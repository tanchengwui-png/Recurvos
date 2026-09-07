export type WarehouseAddress = {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
};

type ParsedWarehouseAddress = {
  address: WarehouseAddress;
  extraProperties: Record<string, unknown>;
};

const defaultAddress: WarehouseAddress = {
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postcode: "",
  country: "Malaysia",
};

const knownKeys = new Set([
  "addressLine1", "addressLine2", "city", "state", "postcode", "country",
  "address", "address1", "address2", "line1", "line2", "street", "streetAddress",
  "postalCode", "postal_code", "zip", "zipCode", "stateName", "countryName",
]);

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function isMalaysiaCountry(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "malaysia" || normalized === "my";
}

export function normalizeWarehouseCountry(value: string) {
  const normalized = value.trim();
  if (isMalaysiaCountry(normalized)) return "Malaysia";
  return countryOptions.find((option) => option.value.toLowerCase() === normalized.toLowerCase())?.value ?? normalized;
}

function normalizeMalaysiaState(value: string) {
  const normalized = value.trim().toLowerCase();
  const legacyNames: Record<string, string> = {
    "w.p. kuala lumpur": "Kuala Lumpur",
    "wilayah persekutuan kuala lumpur": "Kuala Lumpur",
    "w.p. labuan": "Labuan",
    "wilayah persekutuan labuan": "Labuan",
    "w.p. putrajaya": "Putrajaya",
    "wilayah persekutuan putrajaya": "Putrajaya",
    melaka: "Malacca",
    "pulau pinang": "Penang",
  };
  const canonical = legacyNames[normalized] ?? value;
  return malaysiaStateOptions.find((option) => option.value.toLowerCase() === canonical.trim().toLowerCase())?.value ?? "";
}

/** Converts current and legacy warehouse address storage into form-friendly fields. */
export function parseWarehouseAddress(value: string | null | undefined): ParsedWarehouseAddress {
  const raw = value?.trim() ?? "";
  if (!raw || raw === "{}") {
    return { address: { ...defaultAddress }, extraProperties: {} };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null) {
      return { address: { ...defaultAddress }, extraProperties: {} };
    }

    if (typeof parsed === "string") {
      return { address: { ...defaultAddress, addressLine1: parsed }, extraProperties: {} };
    }

    if (Array.isArray(parsed) || typeof parsed !== "object") {
      return { address: { ...defaultAddress, addressLine1: raw }, extraProperties: {} };
    }

    const record = parsed as Record<string, unknown>;
    const country = normalizeWarehouseCountry(readString(record.country) || readString(record.countryName) || "Malaysia");
    const state = readString(record.state) || readString(record.stateName);

    return {
      address: {
        addressLine1: readString(record.addressLine1) || readString(record.address) || readString(record.address1) || readString(record.line1) || readString(record.street) || readString(record.streetAddress),
        addressLine2: readString(record.addressLine2) || readString(record.address2) || readString(record.line2),
        city: readString(record.city),
        state: isMalaysiaCountry(country) ? normalizeMalaysiaState(state) : state,
        postcode: readString(record.postcode) || readString(record.postalCode) || readString(record.postal_code) || readString(record.zip) || readString(record.zipCode),
        country,
      },
      extraProperties: Object.fromEntries(Object.entries(record).filter(([key]) => !knownKeys.has(key))),
    };
  } catch {
    const isJsonLike = raw.startsWith("{") || raw.startsWith("[");
    return {
      address: { ...defaultAddress, addressLine1: isJsonLike ? "" : raw },
      extraProperties: isJsonLike ? { legacyAddressRaw: raw } : {},
    };
  }
}

/** Serializes UI fields back into the existing warehouse AddressJson representation. */
export function serializeWarehouseAddress(address: WarehouseAddress, extraProperties: Record<string, unknown> = {}) {
  const normalized = Object.fromEntries(Object.entries(address).map(([key, value]) => [key, value.trim()]));
  const hasAddressContent = Object.entries(normalized).some(([key, value]) => key !== "country" && Boolean(value));

  if (!hasAddressContent && Object.keys(extraProperties).length === 0) {
    return "{}";
  }

  return JSON.stringify({ ...extraProperties, ...normalized });
}

export function formatWarehouseAddress(value: string | null | undefined) {
  const { address } = parseWarehouseAddress(value);
  return [
    address.addressLine1,
    address.addressLine2,
    [address.postcode, address.city].filter(Boolean).join(" "),
    address.state,
    address.country,
  ].filter(Boolean).join(", ") || "-";
}
import { countryOptions, malaysiaStateOptions } from "./localeOptions";
