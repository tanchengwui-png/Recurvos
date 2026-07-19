import type { Customer, Product, ProductCustomPrice, ProductDetails, ProductUomConversion } from "../types";

type ProductPricingSource = Pick<
  Product,
  "salesPrice" | "purchasePrice" | "baseUnitLabel" | "uomConversions" | "customSalesPrices" | "customPurchasePrices"
> | Pick<
  ProductDetails,
  "salesPrice" | "purchasePrice" | "baseUnitLabel" | "uomConversions" | "customSalesPrices" | "customPurchasePrices"
>;

type PriceMode = "sales" | "purchase";

type ResolveProductPriceOptions = {
  product: ProductPricingSource;
  contact?: Customer | null;
  quantity?: number;
  uom?: string;
  effectiveDate?: string | Date | null;
  mode: PriceMode;
};

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function toDateOnly(value?: string | Date | null) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function getBaseRow(product: ProductPricingSource): ProductUomConversion | null {
  const baseLabel = normalize(product.baseUnitLabel);
  return product.uomConversions.find((value) => normalize(value.label) === baseLabel) ?? null;
}

export function getProductUomOptions(product: ProductPricingSource) {
  const seen = new Set<string>();
  const labels = [product.baseUnitLabel, ...product.uomConversions.map((value) => value.label)];

  return labels
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

export function getDefaultProductUom(product: ProductPricingSource, mode: PriceMode) {
  const baseRow = getBaseRow(product);
  const selected = product.uomConversions.find((value) =>
    mode === "sales" ? value.isDefaultSalesUom : value.isDefaultPurchaseUom);

  if (selected?.label.trim()) {
    return selected.label.trim();
  }

  if ((mode === "sales" ? baseRow?.isDefaultSalesUom : baseRow?.isDefaultPurchaseUom) && product.baseUnitLabel.trim()) {
    return product.baseUnitLabel.trim();
  }

  return product.baseUnitLabel.trim() || "Unit";
}

function matchesDateRange(rule: ProductCustomPrice, effectiveDate: Date | null) {
  if (!effectiveDate) {
    return true;
  }

  const from = toDateOnly(rule.dateFromUtc);
  const to = toDateOnly(rule.dateToUtc);
  if (from && effectiveDate < from) {
    return false;
  }

  if (to && effectiveDate > to) {
    return false;
  }

  return true;
}

function matchesQuantity(rule: ProductCustomPrice, quantity: number) {
  return rule.minQuantity == null || quantity >= rule.minQuantity;
}

function matchesUom(rule: ProductCustomPrice, uom: string) {
  return normalize(rule.uom) === normalize(uom);
}

function selectBestRule(rules: ProductCustomPrice[]) {
  return [...rules].sort((left, right) => {
    const leftQuantity = left.minQuantity ?? 0;
    const rightQuantity = right.minQuantity ?? 0;
    if (leftQuantity !== rightQuantity) {
      return rightQuantity - leftQuantity;
    }

    const leftFrom = toDateOnly(left.dateFromUtc)?.getTime() ?? 0;
    const rightFrom = toDateOnly(right.dateFromUtc)?.getTime() ?? 0;
    return rightFrom - leftFrom;
  })[0];
}

export function resolveProductUnitPrice({
  product,
  contact,
  quantity = 1,
  uom,
  effectiveDate,
  mode,
}: ResolveProductPriceOptions) {
  const selectedUom = (uom?.trim() || getDefaultProductUom(product, mode)).trim();
  const candidateRules = (mode === "sales" ? product.customSalesPrices : product.customPurchasePrices)
    .filter((rule) => matchesUom(rule, selectedUom))
    .filter((rule) => matchesQuantity(rule, quantity))
    .filter((rule) => matchesDateRange(rule, toDateOnly(effectiveDate)));

  const contactRules = candidateRules.filter((rule) =>
    rule.targetType === "Contact"
    && contact
    && (
      (rule.contactId && rule.contactId === contact.id)
      || (normalize(rule.contactName) && normalize(rule.contactName) === normalize(contact.legalName || contact.name))
      || (normalize(rule.contactCode) && normalize(rule.contactCode) === normalize(contact.externalReference))
    ));
  const groupRules = candidateRules.filter((rule) =>
    rule.targetType === "ContactGroup"
    && contact
    && contact.groups.some((group) => normalize(group) === normalize(rule.contactGroup)));
  const priceLevelRules = candidateRules.filter((rule) =>
    rule.targetType === "PriceLevel"
    && contact
    && normalize(contact.priceLevel) === normalize(rule.priceLevel));

  const matchedRule = selectBestRule(contactRules) ?? selectBestRule(groupRules) ?? selectBestRule(priceLevelRules);
  if (matchedRule) {
    return matchedRule.unitPrice;
  }

  return mode === "sales" ? product.salesPrice ?? undefined : product.purchasePrice ?? undefined;
}
