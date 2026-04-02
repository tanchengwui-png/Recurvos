import { useEffect, useState } from "react";
import { isStandalonePwa } from "../lib/pwa";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "recurvos.install.dismissedUntil";
const INSTALLED_KEY = "recurvos.install.installed";
const PAGE_VIEWS_KEY = "recurvos.install.pageViews";
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_PAGE_VIEWS = 2;

function readNumber(key: string) {
  if (typeof window === "undefined") {
    return 0;
  }

  const rawValue = window.localStorage.getItem(key);
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readBoolean(key: string) {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(key) === "true";
}

function isIosSafariBrowser() {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = window.navigator.userAgent;
  const platform = window.navigator.platform;
  const maxTouchPoints = window.navigator.maxTouchPoints ?? 0;
  const isIosDevice = /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  const isWebkitSafari = /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);
  return isIosDevice && isWebkitSafari;
}

function markInstalled() {
  window.localStorage.setItem(INSTALLED_KEY, "true");
}

export function useInstallPromptState(pathname: string) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissedUntil, setDismissedUntil] = useState(() => readNumber(DISMISS_KEY));
  const [pageViews, setPageViews] = useState(() => readNumber(PAGE_VIEWS_KEY));
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return readBoolean(INSTALLED_KEY) || isStandalonePwa();
  });
  const [isManualInstallOnly, setIsManualInstallOnly] = useState(() => isIosSafariBrowser());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncInstallState = () => {
      const standalone = isStandalonePwa();
      const installed = standalone || readBoolean(INSTALLED_KEY);

      if (standalone) {
        markInstalled();
      }

      setIsInstalled(installed);
      setIsManualInstallOnly(isIosSafariBrowser());
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      markInstalled();
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    syncInstallState();

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    window.addEventListener("focus", syncInstallState);
    document.addEventListener("visibilitychange", syncInstallState);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("focus", syncInstallState);
      document.removeEventListener("visibilitychange", syncInstallState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || isInstalled) {
      return;
    }

    const nextPageViews = Math.max(readNumber(PAGE_VIEWS_KEY), pageViews) + 1;
    window.localStorage.setItem(PAGE_VIEWS_KEY, String(nextPageViews));
    setPageViews(nextPageViews);
  }, [pathname, isInstalled]);

  const dismiss = () => {
    const nextDismissedUntil = Date.now() + DISMISS_DURATION_MS;
    window.localStorage.setItem(DISMISS_KEY, String(nextDismissedUntil));
    setDismissedUntil(nextDismissedUntil);
  };

  const promptInstall = async () => {
    if (!deferredPrompt) {
      return { outcome: "unavailable" as const };
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);

    if (choice.outcome === "accepted") {
      markInstalled();
      setIsInstalled(true);
    }

    return choice;
  };

  const shouldShowPrompt = !isInstalled
    && dismissedUntil <= Date.now()
    && pageViews >= MIN_PAGE_VIEWS
    && (isManualInstallOnly || deferredPrompt !== null);

  return {
    canTriggerInstall: deferredPrompt !== null,
    isInstalled,
    isManualInstallOnly,
    promptInstall,
    dismiss,
    shouldShowPrompt,
  };
}
