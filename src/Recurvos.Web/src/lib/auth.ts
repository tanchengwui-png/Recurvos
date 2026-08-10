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

export function setActiveCompanyId(companyId: string) {
  localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, companyId);
  window.dispatchEvent(new Event("recurvos:company-changed"));
}
