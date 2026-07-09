type SelectOption = {
  value: string;
  label: string;
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

const fallbackCurrencyCodes = ["AED", "AUD", "CAD", "CHF", "CNY", "EUR", "GBP", "JPY", "MYR", "SGD", "USD"] as const;

function sortByLabel(left: SelectOption, right: SelectOption) {
  return left.label.localeCompare(right.label, "en");
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" });

export const countryOptions: SelectOption[] = countryCodes
  .map((code) => regionNames.of(code))
  .filter((name): name is string => Boolean(name))
  .map((name) => ({ value: name, label: name }))
  .sort(sortByLabel);

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
