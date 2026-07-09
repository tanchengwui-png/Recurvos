import { normalizeDialCode, phoneCountryCodeOptions, type SearchableSelectOption } from "./localeOptions";

export const DEFAULT_PHONE_COUNTRY_CODE = "+60";

function normalizePhoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function getPhoneCountryCodeOptions(selectedCode?: string) {
  const normalizedSelectedCode = normalizeDialCode(selectedCode ?? "");
  if (!normalizedSelectedCode || phoneCountryCodeOptions.some((option) => option.value === normalizedSelectedCode)) {
    return phoneCountryCodeOptions;
  }

  const customOption: SearchableSelectOption = {
    value: normalizedSelectedCode,
    label: `Custom (${normalizedSelectedCode})`,
    keywords: [normalizedSelectedCode, normalizedSelectedCode.replace("+", "")],
  };

  return [customOption, ...phoneCountryCodeOptions];
}

export function splitStoredPhoneNumber(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return {
      countryCode: DEFAULT_PHONE_COUNTRY_CODE,
      phoneNumber: "",
    };
  }

  const normalized = trimmedValue.startsWith("+") ? trimmedValue : `+${trimmedValue}`;
  const compact = normalized.replace(/[^\d+]/g, "");
  const matchingOption = [...getPhoneCountryCodeOptions()]
    .sort((left, right) => right.value.length - left.value.length)
    .find((option) => compact.startsWith(option.value));

  if (matchingOption) {
    return {
      countryCode: matchingOption.value,
      phoneNumber: compact.slice(matchingOption.value.length),
    };
  }

  const fallbackCode = compact.match(/^\+\d{1,4}/)?.[0] ?? DEFAULT_PHONE_COUNTRY_CODE;
  return {
    countryCode: fallbackCode,
    phoneNumber: compact.replace(fallbackCode, ""),
  };
}

export function combinePhoneNumber(countryCode: string, phoneNumber: string) {
  const normalizedCountryCode = normalizeDialCode(countryCode);
  const digits = normalizePhoneDigits(phoneNumber).replace(/^0+/, "");
  if (!normalizedCountryCode || !digits) {
    return "";
  }

  return `${normalizedCountryCode}${digits}`;
}
