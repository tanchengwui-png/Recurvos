export type SelectOption = {
  value: string;
  label: string;
};

export type SearchableSelectOption = SelectOption & {
  keywords?: string[];
};

type CountryDialingDefinition = {
  isoCode: string;
  dialCode: string;
};

const countryCodes = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AR", "AT", "AU", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BN", "BO", "BR",
  "BS", "BT", "BW", "BY", "BZ", "CA", "CD", "CF", "CG", "CH", "CI", "CL",
  "CM", "CN", "CO", "CR", "CU", "CV", "CY", "CZ", "DE", "DJ", "DK", "DM",
  "DO", "DZ", "EC", "EE", "EG", "ER", "ES", "ET", "FI", "FJ", "FM", "FR",
  "GA", "GB", "GD", "GE", "GH", "GM", "GN", "GQ", "GR", "GT", "GW", "GY",
  "HK", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IN", "IQ", "IR", "IS",
  "IT", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR",
  "KW", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV",
  "LY", "MA", "MC", "MD", "ME", "MG", "MH", "MK", "ML", "MM", "MN", "MR",
  "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NE", "NG", "NI", "NL",
  "NO", "NP", "NR", "NZ", "OM", "PA", "PE", "PG", "PH", "PK", "PL", "PS",
  "PT", "PW", "PY", "QA", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD",
  "SE", "SG", "SI", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV",
  "SY", "SZ", "TD", "TG", "TH", "TJ", "TL", "TM", "TN", "TO", "TR", "TT",
  "TV", "TW", "TZ", "UA", "UG", "US", "UY", "UZ", "VA", "VC", "VE", "VN",
  "VU", "WS", "YE", "ZA", "ZM", "ZW",
] as const;

const countryDialingDefinitions: CountryDialingDefinition[] = [
  { isoCode: "MY", dialCode: "+60" },
  { isoCode: "AE", dialCode: "+971" },
  { isoCode: "AR", dialCode: "+54" },
  { isoCode: "AT", dialCode: "+43" },
  { isoCode: "AU", dialCode: "+61" },
  { isoCode: "BD", dialCode: "+880" },
  { isoCode: "BE", dialCode: "+32" },
  { isoCode: "BG", dialCode: "+359" },
  { isoCode: "BH", dialCode: "+973" },
  { isoCode: "BN", dialCode: "+673" },
  { isoCode: "BR", dialCode: "+55" },
  { isoCode: "CA", dialCode: "+1" },
  { isoCode: "CH", dialCode: "+41" },
  { isoCode: "CL", dialCode: "+56" },
  { isoCode: "CN", dialCode: "+86" },
  { isoCode: "CZ", dialCode: "+420" },
  { isoCode: "DE", dialCode: "+49" },
  { isoCode: "DK", dialCode: "+45" },
  { isoCode: "DZ", dialCode: "+213" },
  { isoCode: "EG", dialCode: "+20" },
  { isoCode: "ES", dialCode: "+34" },
  { isoCode: "FI", dialCode: "+358" },
  { isoCode: "FR", dialCode: "+33" },
  { isoCode: "GB", dialCode: "+44" },
  { isoCode: "GH", dialCode: "+233" },
  { isoCode: "GR", dialCode: "+30" },
  { isoCode: "HK", dialCode: "+852" },
  { isoCode: "HR", dialCode: "+385" },
  { isoCode: "HU", dialCode: "+36" },
  { isoCode: "ID", dialCode: "+62" },
  { isoCode: "IE", dialCode: "+353" },
  { isoCode: "IN", dialCode: "+91" },
  { isoCode: "IQ", dialCode: "+964" },
  { isoCode: "IR", dialCode: "+98" },
  { isoCode: "IS", dialCode: "+354" },
  { isoCode: "IT", dialCode: "+39" },
  { isoCode: "JO", dialCode: "+962" },
  { isoCode: "JP", dialCode: "+81" },
  { isoCode: "KE", dialCode: "+254" },
  { isoCode: "KH", dialCode: "+855" },
  { isoCode: "KR", dialCode: "+82" },
  { isoCode: "KW", dialCode: "+965" },
  { isoCode: "KZ", dialCode: "+7" },
  { isoCode: "LA", dialCode: "+856" },
  { isoCode: "LB", dialCode: "+961" },
  { isoCode: "LK", dialCode: "+94" },
  { isoCode: "MM", dialCode: "+95" },
  { isoCode: "MN", dialCode: "+976" },
  { isoCode: "MO", dialCode: "+853" },
  { isoCode: "MT", dialCode: "+356" },
  { isoCode: "MX", dialCode: "+52" },
  { isoCode: "NG", dialCode: "+234" },
  { isoCode: "NL", dialCode: "+31" },
  { isoCode: "NO", dialCode: "+47" },
  { isoCode: "NP", dialCode: "+977" },
  { isoCode: "NZ", dialCode: "+64" },
  { isoCode: "OM", dialCode: "+968" },
  { isoCode: "PE", dialCode: "+51" },
  { isoCode: "PH", dialCode: "+63" },
  { isoCode: "PK", dialCode: "+92" },
  { isoCode: "PL", dialCode: "+48" },
  { isoCode: "PT", dialCode: "+351" },
  { isoCode: "QA", dialCode: "+974" },
  { isoCode: "RO", dialCode: "+40" },
  { isoCode: "RU", dialCode: "+7" },
  { isoCode: "SA", dialCode: "+966" },
  { isoCode: "SE", dialCode: "+46" },
  { isoCode: "SG", dialCode: "+65" },
  { isoCode: "SI", dialCode: "+386" },
  { isoCode: "SK", dialCode: "+421" },
  { isoCode: "TH", dialCode: "+66" },
  { isoCode: "TN", dialCode: "+216" },
  { isoCode: "TR", dialCode: "+90" },
  { isoCode: "TW", dialCode: "+886" },
  { isoCode: "UA", dialCode: "+380" },
  { isoCode: "US", dialCode: "+1" },
  { isoCode: "VN", dialCode: "+84" },
  { isoCode: "ZA", dialCode: "+27" },
];

const fallbackCurrencyCodes = ["AED", "AUD", "CAD", "CHF", "CNY", "EUR", "GBP", "JPY", "MYR", "SGD", "USD"] as const;

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" });

function sortByLabel(left: SelectOption, right: SelectOption) {
  return left.label.localeCompare(right.label, "en");
}

function sortWithMalaysiaFirst<T extends SelectOption>(options: T[]) {
  return [...options].sort((left, right) => {
    if (left.value === "Malaysia" || left.label === "Malaysia") {
      return -1;
    }

    if (right.value === "Malaysia" || right.label === "Malaysia") {
      return 1;
    }

    return left.label.localeCompare(right.label, "en");
  });
}

function getCountryName(isoCode: string) {
  return regionNames.of(isoCode) ?? isoCode;
}

export function normalizeDialCode(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
}

export const countryOptions: SelectOption[] = sortWithMalaysiaFirst(
  countryCodes
    .map((code) => getCountryName(code))
    .filter((name): name is string => Boolean(name))
    .map((name) => ({ value: name, label: name })),
);

export const phoneCountryCodeOptions: SearchableSelectOption[] = sortWithMalaysiaFirst(
  countryDialingDefinitions
    .map(({ isoCode, dialCode }) => {
      const countryName = getCountryName(isoCode);
      return {
        value: dialCode,
        label: `${countryName} (${dialCode})`,
        keywords: [countryName, dialCode, dialCode.replace("+", ""), isoCode],
      };
    }),
);

const supportedCurrencyCodes = typeof Intl.supportedValuesOf === "function"
  ? Intl.supportedValuesOf("currency")
  : [...fallbackCurrencyCodes];

export const currencyOptions: SelectOption[] = supportedCurrencyCodes
  .map((code) => ({
    value: code,
    label: `${code} - ${currencyNames.of(code) ?? code}`,
  }))
  .sort(sortByLabel);

export const registrationNumberTypeOptions: SelectOption[] = [
  { value: "BRN", label: "BRN" },
  { value: "NRIC", label: "NRIC" },
  { value: "Passport", label: "Passport" },
  { value: "Army", label: "Army" },
];

export const malaysiaStateOptions: SelectOption[] = [
  { value: "Johor", label: "Johor" },
  { value: "Kedah", label: "Kedah" },
  { value: "Kelantan", label: "Kelantan" },
  { value: "Kuala Lumpur", label: "Kuala Lumpur" },
  { value: "Labuan", label: "Labuan" },
  { value: "Malacca", label: "Malacca" },
  { value: "Negeri Sembilan", label: "Negeri Sembilan" },
  { value: "Pahang", label: "Pahang" },
  { value: "Penang", label: "Penang" },
  { value: "Perak", label: "Perak" },
  { value: "Perlis", label: "Perlis" },
  { value: "Putrajaya", label: "Putrajaya" },
  { value: "Sabah", label: "Sabah" },
  { value: "Sarawak", label: "Sarawak" },
  { value: "Selangor", label: "Selangor" },
  { value: "Terengganu", label: "Terengganu" },
];
