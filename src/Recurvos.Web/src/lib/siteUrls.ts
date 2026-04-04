function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function getCurrentOrigin() {
  if (typeof window === "undefined") {
    return "http://localhost:5173";
  }

  return window.location.origin;
}

export const PUBLIC_SITE_URL = normalizeBaseUrl(import.meta.env.VITE_PUBLIC_SITE_URL ?? getCurrentOrigin());
export const APP_SITE_URL = normalizeBaseUrl(import.meta.env.VITE_APP_SITE_URL ?? getCurrentOrigin());

export function buildPublicSiteUrl(path = "/") {
  return `${PUBLIC_SITE_URL}${normalizePath(path)}`;
}

export function buildAppSiteUrl(path = "/") {
  return `${APP_SITE_URL}${normalizePath(path)}`;
}

export function isAppSiteHost() {
  if (typeof window === "undefined") {
    return false;
  }

  const hasExplicitSplitHosts = Boolean(import.meta.env.VITE_APP_SITE_URL) && Boolean(import.meta.env.VITE_PUBLIC_SITE_URL);
  if (!hasExplicitSplitHosts) {
    return false;
  }

  return normalizeBaseUrl(window.location.origin).toLowerCase() === APP_SITE_URL.toLowerCase()
    && APP_SITE_URL.toLowerCase() !== PUBLIC_SITE_URL.toLowerCase();
}
