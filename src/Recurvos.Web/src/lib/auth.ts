import type { AuthResponse } from "../types";

const STORAGE_KEY = "recurvos.auth";
const ACTIVE_COMPANY_STORAGE_KEY = "recurvos.active-company-id";

export function getAuth(): AuthResponse | null {
  const value = localStorage.getItem(STORAGE_KEY);
  return value ? (JSON.parse(value) as AuthResponse) : null;
}

export function setAuth(value: AuthResponse | null) {
  if (!value) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ACTIVE_COMPANY_STORAGE_KEY);
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  if (!localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY)) {
    localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, value.companyId);
  }
}

export function getActiveCompanyId() {
  return localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY) ?? getAuth()?.companyId ?? null;
}

/** Prefer the workspace selected in the app shell whenever a page needs a default company. */
export function resolveActiveCompanyId<T extends { id: string }>(companies: readonly T[]) {
  const activeCompanyId = getActiveCompanyId();
  return activeCompanyId && companies.some((company) => company.id === activeCompanyId)
    ? activeCompanyId
    : companies[0]?.id ?? "";
}

export function setActiveCompanyId(companyId: string) {
  localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, companyId);
  window.dispatchEvent(new Event("recurvos:company-changed"));
}
