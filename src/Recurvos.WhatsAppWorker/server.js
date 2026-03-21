const express = require("express");
const QRCode = require("qrcode");
const { Client, LocalAuth } = require("whatsapp-web.js");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json({ limit: "1mb" }));

const port = Number(process.env.PORT || 3011);
const workerToken = process.env.WHATSAPP_WORKER_TOKEN || "";
const sessionRoot = process.env.WHATSAPP_SESSION_DIR || path.resolve(__dirname, "..", "..", "storage", "whatsapp-webjs");
const minSendDelayMs = Number(process.env.WHATSAPP_MIN_SEND_DELAY_MS || 12000);
const sendJitterMs = Number(process.env.WHATSAPP_SEND_JITTER_MS || 4000);
const maxMessagesPerDay = Number(process.env.WHATSAPP_MAX_MESSAGES_PER_DAY || 250);
const puppeteerExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH || "";
const puppeteerProtocolTimeoutMs = Number(process.env.PUPPETEER_PROTOCOL_TIMEOUT_MS || 120000);
const chromiumProfileLockNames = ["SingletonLock", "SingletonSocket", "SingletonCookie"];
fs.mkdirSync(sessionRoot, { recursive: true });

const sessions = new Map();

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

function authorize(req, res, next) {
  if (!workerToken) {
    next();
    return;
  }

  const header = req.headers.authorization || "";
  if (header === `Bearer ${workerToken}`) {
    next();
    return;
  }

  res.status(401).json({ message: "Unauthorized" });
}

app.use(authorize);

function initialSessionState(tenantId) {
  return {
    tenantId,
    status: "not_connected",
    phoneNumber: null,
    qrCodeDataUrl: null,
    lastError: null,
    lastSyncedAtUtc: new Date().toISOString(),
    client: null,
    sendQueue: Promise.resolve(),
    lastSentAtMs: 0,
    sentTodayKey: new Date().toISOString().slice(0, 10),
    sentTodayCount: 0,
  };
}

function getSession(tenantId) {
  if (!sessions.has(tenantId)) {
    sessions.set(tenantId, initialSessionState(tenantId));
  }

  return sessions.get(tenantId);
}

function toSessionResponse(session) {
  return {
    status: session.status,
    phoneNumber: session.phoneNumber,
    qrCodeDataUrl: session.qrCodeDataUrl,
    lastError: session.lastError,
    lastSyncedAtUtc: session.lastSyncedAtUtc,
    isReady: session.status === "connected",
    sentTodayCount: session.sentTodayCount,
    sentTodayLimit: maxMessagesPerDay,
  };
}

function touch(session, updates = {}) {
  Object.assign(session, updates, { lastSyncedAtUtc: new Date().toISOString() });
}

function clearStaleChromiumLocks(tenantId) {
  const profilePath = path.join(sessionRoot, `session-${tenantId}`);
  for (const lockName of chromiumProfileLockNames) {
    const lockPath = path.join(profilePath, lockName);
    try {
      fs.lstatSync(lockPath);
      fs.unlinkSync(lockPath);
    } catch {
      // Ignore stale lock cleanup errors and continue startup.
    }
  }
}

function createClient(tenantId, session) {
  const puppeteerConfig = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    protocolTimeout: puppeteerProtocolTimeoutMs,
  };

  if (puppeteerExecutablePath) {
    puppeteerConfig.executablePath = puppeteerExecutablePath;
  }

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: tenantId,
      dataPath: sessionRoot,
    }),
    webVersionCache: {
      type: "none",
    },
    puppeteer: puppeteerConfig,
  });

  client.on("qr", async (qr) => {
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 1 });
      touch(session, {
        status: "qr_ready",
        qrCodeDataUrl,
        lastError: null,
      });
    } catch (error) {
      touch(session, {
        status: "error",
        lastError: error instanceof Error ? error.message : "Unable to render QR code.",
      });
    }
  });

  client.on("authenticated", () => {
    touch(session, {
      status: "authenticated",
      qrCodeDataUrl: null,
      lastError: null,
    });
  });

  client.on("ready", async () => {
    let phoneNumber = null;
    try {
      const wid = client.info && client.info.wid ? client.info.wid.user : null;
      phoneNumber = wid || null;
    } catch {
      phoneNumber = null;
    }

    touch(session, {
      status: "connected",
      phoneNumber,
      qrCodeDataUrl: null,
      lastError: null,
    });
  });

  client.on("auth_failure", (message) => {
    touch(session, {
      status: "auth_failure",
      lastError: message || "Authentication failed.",
      qrCodeDataUrl: null,
    });
  });

  client.on("disconnected", (reason) => {
    touch(session, {
      status: "disconnected",
      phoneNumber: null,
      qrCodeDataUrl: null,
      lastError: reason || null,
    });
  });

  client.on("change_state", (state) => {
    if (session.status !== "connected") {
      touch(session, {
        status: String(state || "initializing").toLowerCase(),
      });
    }
  });

  session.client = client;
  return client;
}

async function ensureInitialized(tenantId) {
  const session = getSession(tenantId);
  if (session.client) {
    return session;
  }

  clearStaleChromiumLocks(tenantId);
  const client = createClient(tenantId, session);
  touch(session, {
    status: "initializing",
    lastError: null,
  });

  // Start initialization asynchronously so API connect requests never block on browser startup.
  void client.initialize().catch((error) => {
    touch(session, {
      status: "error",
      lastError: error instanceof Error ? error.message : "Unable to initialize WhatsApp client.",
    });
  });

  return session;
}

function normalizePhoneNumber(input) {
  let digits = String(input || "").replace(/\D+/g, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("0")) {
    digits = `60${digits.slice(1)}`;
  }
  return digits;
}

function currentDayKey() {
  return new Date().toISOString().slice(0, 10);
}

function resetDailyCounterIfNeeded(session) {
  const today = currentDayKey();
  if (session.sentTodayKey !== today) {
    session.sentTodayKey = today;
    session.sentTodayCount = 0;
  }
}

function randomJitter() {
  if (sendJitterMs <= 0) {
    return 0;
  }

  return Math.floor(Math.random() * sendJitterMs);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enqueueSend(session, work) {
  const run = async () => {
    resetDailyCounterIfNeeded(session);

    if (maxMessagesPerDay > 0 && session.sentTodayCount >= maxMessagesPerDay) {
      const error = new Error(`Daily WhatsApp send limit reached (${maxMessagesPerDay} per day).`);
      error.statusCode = 429;
      throw error;
    }

    const now = Date.now();
    const nextAllowedAt = session.lastSentAtMs + minSendDelayMs + randomJitter();
    if (nextAllowedAt > now) {
      await wait(nextAllowedAt - now);
    }

    const result = await work();
    session.lastSentAtMs = Date.now();
    session.sentTodayCount += 1;
    return result;
  };

  const pending = session.sendQueue.catch(() => {}).then(run);
  session.sendQueue = pending.catch(() => {});
  return pending;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "recurvos-whatsapp-worker" });
});

app.get("/api/sessions/:tenantId/status", async (req, res) => {
  const session = getSession(req.params.tenantId);
  res.json(toSessionResponse(session));
});

app.post("/api/sessions/:tenantId/connect", async (req, res) => {
  const session = await ensureInitialized(req.params.tenantId);
  res.json(toSessionResponse(session));
});

app.post("/api/sessions/:tenantId/disconnect", async (req, res) => {
  const session = getSession(req.params.tenantId);
  try {
    if (session.client) {
      await session.client.logout().catch(() => {});
      await session.client.destroy().catch(() => {});
    }
  } finally {
    touch(session, {
      status: "not_connected",
      phoneNumber: null,
      qrCodeDataUrl: null,
      lastError: null,
      client: null,
    });
  }

  res.json(toSessionResponse(session));
});

app.post("/api/messages/send", async (req, res) => {
  const tenantId = String(req.body?.tenantId || "").trim();
  const to = normalizePhoneNumber(req.body?.to || "");
  const message = String(req.body?.message || "").trim();
  const reference = String(req.body?.reference || "").trim();

  if (!tenantId) {
    res.status(400).json({ message: "tenantId is required." });
    return;
  }

  if (!to) {
    res.status(400).json({ message: "Recipient phone number is required." });
    return;
  }

  if (!message) {
    res.status(400).json({ message: "Message is required." });
    return;
  }

  const session = getSession(tenantId);
  if (!session.client || session.status !== "connected") {
    res.status(400).json({ message: "WhatsApp session is not connected.", externalMessageId: null, success: false });
    return;
  }

  try {
    const numberId = await session.client.getNumberId(to);
    if (!numberId || !numberId._serialized) {
      res.status(400).json({
        success: false,
        externalMessageId: null,
        message: "That phone number is not reachable on WhatsApp.",
      });
      return;
    }

    const result = await session.client.sendMessage(numberId._serialized, message);
    touch(session, { lastError: null });
    res.json({
      success: true,
      externalMessageId: result?.id?._serialized || reference || null,
      message: "Message sent.",
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unable to send WhatsApp message.";
    touch(session, {
      lastError: messageText,
    });
    res.status(500).json({
      success: false,
      externalMessageId: null,
      message: messageText,
    });
  }
});

app.listen(port, () => {
  console.log(`Recurvos WhatsApp worker listening on port ${port}`);
});
