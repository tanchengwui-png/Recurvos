import type { CurrencyDefinition } from "../types";

export function normaliseCurrencyCode(value: string | null | undefined) {
  const code = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{3}$/.test(code) ? code : "";
}

export function validateCurrency(value: string | null | undefined, currencies: readonly CurrencyDefinition[]) {
  const code = normaliseCurrencyCode(value);
  if (!code || !currencies.some((currency) => currency.isActive && normaliseCurrencyCode(currency.code) === code)) {
    return "Select a valid currency.";
  }

  return "";
}

export function defaultCurrencyCode(currencies: readonly CurrencyDefinition[], preferred?: string | null) {
  const preferredCode = normaliseCurrencyCode(preferred);
  if (preferredCode && currencies.some((currency) => currency.isActive && normaliseCurrencyCode(currency.code) === preferredCode)) {
    return preferredCode;
  }

  return normaliseCurrencyCode(currencies.find((currency) => currency.isActive)?.code);
}
