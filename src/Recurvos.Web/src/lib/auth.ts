import type { AuthResponse } from "../types";

const STORAGE_KEY = "recurvos.auth";

export function getAuth(): AuthResponse | null {
  const value = localStorage.getItem(STORAGE_KEY);
  return value ? (JSON.parse(value) as AuthResponse) : null;
}

export function setAuth(value: AuthResponse | null) {
  if (!value) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}
