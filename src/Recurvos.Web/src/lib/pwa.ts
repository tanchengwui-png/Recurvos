export function registerPwaServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

export function isStandalonePwa() {
  const mediaQuery = window.matchMedia("(display-mode: standalone)");
  const iosStandalone = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mediaQuery.matches || iosStandalone;
}
