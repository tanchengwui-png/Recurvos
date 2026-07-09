export type CompanyAddress = {
  id: string;
  addressLine1: string;
  addressLine2?: string | null;
  addressLine3?: string | null;
  postcode?: string | null;
  city?: string | null;
  state?: string | null;
  country: string;
  isDefault: boolean;
  isDefaultBilling: boolean;
  isDefaultShipping: boolean;
};

export function formatCompanyAddress(address: Pick<CompanyAddress, "addressLine1" | "addressLine2" | "addressLine3" | "postcode" | "city" | "state" | "country">) {
  const cityLine = [address.city?.trim(), address.state?.trim(), address.postcode?.trim()].filter(Boolean).join(", ");

  return [
    address.addressLine1.trim(),
    address.addressLine2?.trim(),
    address.addressLine3?.trim(),
    cityLine,
    address.country.trim(),
  ].filter(Boolean).join("\n");
}

export function parseLegacyCompanyAddress(address: string): CompanyAddress | null {
  const parts = address
    .split(/\r?\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  const [addressLine1 = "", addressLine2 = "", addressLine3 = "", cityStatePostcode = "", country = ""] = parts;
  let city = "";
  let state = "";
  let postcode = "";

  if (cityStatePostcode) {
    const lineParts = cityStatePostcode.split(",").map((part) => part.trim()).filter(Boolean);
    if (lineParts.length >= 3) {
      [city, state, postcode] = [lineParts[0] ?? "", lineParts[1] ?? "", lineParts.slice(2).join(", ")];
    } else {
      const postcodeMatch = cityStatePostcode.match(/^(\d{4,10})\s+(.*)$/);
      if (postcodeMatch) {
        postcode = postcodeMatch[1];
        const remainder = postcodeMatch[2].trim();
        const remainderParts = remainder.split(",").map((part) => part.trim()).filter(Boolean);
        city = remainderParts[0] ?? "";
        state = remainderParts.slice(1).join(", ");
      } else {
        city = lineParts[0] ?? "";
        state = lineParts.slice(1).join(", ");
      }
    }
  }

  return {
    id: `legacy-${Math.random().toString(36).slice(2, 10)}`,
    addressLine1,
    addressLine2,
    addressLine3,
    postcode,
    city,
    state,
    country,
    isDefault: true,
    isDefaultBilling: true,
    isDefaultShipping: true,
  };
}

export function getCompanyAddressTitle(address: Pick<CompanyAddress, "addressLine1" | "city" | "state" | "country">, index: number) {
  const primary = [address.addressLine1?.trim(), address.city?.trim(), address.state?.trim(), address.country?.trim()].find(Boolean);
  return primary || `Address ${index + 1}`;
}
