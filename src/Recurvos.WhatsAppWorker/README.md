# Recurvos WhatsApp Worker

This worker runs `whatsapp-web.js` for the platform-owned WhatsApp session.

## MVP behavior

- Uses `LocalAuth`
- Stores session data under `storage/whatsapp-webjs`
- Exposes QR/session/send APIs for the .NET platform owner screens
- Supports one session per `tenantId`, so the session model is multi-tenant ready

## Run locally

```powershell
cd src\Recurvos.WhatsAppWorker
npm install
$env:PORT="3011"
$env:WHATSAPP_WORKER_TOKEN=""
npm start
```

If you set `WHATSAPP_WORKER_TOKEN`, put the same value in:

- `src/Recurvos.Api/appsettings.json`
- `WhatsAppWebJs:AccessToken`

## Safety throttling

Default safety limits:

- `WHATSAPP_MIN_SEND_DELAY_MS=12000`
- `WHATSAPP_SEND_JITTER_MS=4000`
- `WHATSAPP_MAX_MESSAGES_PER_DAY=250`

This means the worker will queue messages per session, wait roughly 12-16 seconds between sends, and stop after the daily cap is reached.

## API

- `GET /api/health`
- `GET /api/sessions/:tenantId/status`
- `POST /api/sessions/:tenantId/connect`
- `POST /api/sessions/:tenantId/disconnect`
- `POST /api/messages/send`
