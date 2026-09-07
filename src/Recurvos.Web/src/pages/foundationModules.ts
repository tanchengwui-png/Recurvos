import type { ReactNode } from "react";
import { formatWarehouseAddress } from "../lib/warehouseAddress";

export type FoundationFieldType = "text" | "number" | "textarea" | "checkbox" | "select";

export type FoundationField = {
  key: string;
  label: string;
  type: FoundationFieldType;
  required?: boolean;
  placeholder?: string;
  min?: number;
  step?: number;
  options?: Array<{ label: string; value: string }>;
};

export type FoundationColumn = {
  key: string;
  label: string;
  render: (item: FoundationRecord) => ReactNode;
};

export type FoundationFilter = {
  key: string;
  label: string;
  options: Array<{ label: string; value: string }>;
};

export type FoundationDetailSection = {
  title: string;
  fields: Array<{ key: string; label: string; render?: (value: unknown, item: FoundationRecord) => ReactNode }>;
};

export type FoundationModuleConfig = {
  key: string;
  label: string;
  singularLabel: string;
  description: string;
  path: string;
  apiPath: string;
  searchPlaceholder: string;
  defaultValues: Record<string, unknown>;
  fields: FoundationField[];
  columns: FoundationColumn[];
  filters?: FoundationFilter[];
  detailSections: FoundationDetailSection[];
};

export type FoundationRecord = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc?: string | null;
  [key: string]: unknown;
};

function renderStatus(value: unknown) {
  return value ? "Active" : "Inactive";
}

function renderDate(value: unknown) {
  if (typeof value !== "string" || !value) {
    return "-";
  }

  return new Date(value).toLocaleDateString();
}

function renderPercent(value: unknown) {
  return typeof value === "number" ? `${value}%` : "-";
}

export function renderPriceLevelAdjustment(value: unknown) {
  const adjustment = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(adjustment) || adjustment === 0) return "No adjustment";
  return `${Math.abs(adjustment)}% ${adjustment < 0 ? "decrease" : "increase"}`;
}

function renderText(value: unknown) {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return String(value);
}

const statusFilter: FoundationFilter = {
  key: "isActive",
  label: "Status",
  options: [
    { label: "All statuses", value: "" },
    { label: "Active", value: "true" },
    { label: "Inactive", value: "false" },
  ],
};

export const foundationModules: FoundationModuleConfig[] = [
  {
    key: "chart-of-accounts",
    label: "Chart of Accounts",
    singularLabel: "account",
    description: "Manage account codes, account types, and manual posting availability.",
    path: "/foundation/chart-of-accounts",
    apiPath: "/master-data/accounts",
    searchPlaceholder: "Search account code, name, or description",
    defaultValues: {
      code: "",
      name: "",
      type: "Asset",
      currencyCode: "",
      allowManualEntries: true,
      description: "",
      isActive: true,
    },
    fields: [
      { key: "code", label: "Code", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "type", label: "Type", type: "select", required: true, options: [
        { label: "Asset", value: "Asset" },
        { label: "Liability", value: "Liability" },
        { label: "Equity", value: "Equity" },
        { label: "Revenue", value: "Revenue" },
        { label: "Expense", value: "Expense" },
      ] },
      { key: "currencyCode", label: "Currency", type: "text", required: true, placeholder: "Select currency" },
      { key: "allowManualEntries", label: "Allow manual entries", type: "checkbox" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "isActive", label: "Active", type: "checkbox" },
    ],
    columns: [
      { key: "code", label: "Code", render: (item) => item.code },
      { key: "name", label: "Name", render: (item) => item.name },
      { key: "type", label: "Type", render: (item) => renderText(item.type) },
      { key: "currencyCode", label: "Currency", render: (item) => renderText(item.currencyCode) },
      { key: "isActive", label: "Status", render: (item) => renderStatus(item.isActive) },
    ],
    filters: [
      statusFilter,
      {
        key: "type",
        label: "Type",
        options: [
          { label: "All types", value: "" },
          { label: "Asset", value: "Asset" },
          { label: "Liability", value: "Liability" },
          { label: "Equity", value: "Equity" },
          { label: "Revenue", value: "Revenue" },
          { label: "Expense", value: "Expense" },
        ],
      },
    ],
    detailSections: [
      {
        title: "Account",
        fields: [
          { key: "code", label: "Code" },
          { key: "name", label: "Name" },
          { key: "type", label: "Type" },
          { key: "currencyCode", label: "Currency" },
          { key: "allowManualEntries", label: "Allow manual entries", render: renderText },
          { key: "isActive", label: "Status", render: renderStatus },
        ],
      },
      {
        title: "Notes",
        fields: [{ key: "description", label: "Description" }],
      },
    ],
  },
  {
    key: "tax-codes",
    label: "Tax Codes",
    singularLabel: "tax code",
    description: "Define tax percentages and scope for sales and purchases.",
    path: "/foundation/tax-codes",
    apiPath: "/master-data/tax-codes",
    searchPlaceholder: "Search tax code, name, or tax type",
    defaultValues: {
      code: "",
      name: "",
      rate: 0,
      scope: "Both",
      isSst: false,
      myInvoisTaxTypeCode: "",
      isActive: true,
    },
    fields: [
      { key: "code", label: "Code", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "rate", label: "Rate %", type: "number", required: true, min: 0, step: 0.01 },
      { key: "scope", label: "Scope", type: "select", required: true, options: [
        { label: "Both", value: "Both" },
        { label: "Sales", value: "Sales" },
        { label: "Purchase", value: "Purchase" },
      ] },
      { key: "isSst", label: "SST", type: "checkbox" },
      { key: "myInvoisTaxTypeCode", label: "MyInvois tax type", type: "text" },
      { key: "isActive", label: "Active", type: "checkbox" },
    ],
    columns: [
      { key: "code", label: "Code", render: (item) => item.code },
      { key: "name", label: "Name", render: (item) => item.name },
      { key: "rate", label: "Rate", render: (item) => renderPercent(item.rate) },
      { key: "scope", label: "Scope", render: (item) => renderText(item.scope) },
      { key: "isActive", label: "Status", render: (item) => renderStatus(item.isActive) },
    ],
    filters: [
      statusFilter,
      {
        key: "scope",
        label: "Scope",
        options: [
          { label: "All scopes", value: "" },
          { label: "Sales", value: "Sales" },
          { label: "Purchase", value: "Purchase" },
          { label: "Both", value: "Both" },
        ],
      },
    ],
    detailSections: [
      {
        title: "Tax Code",
        fields: [
          { key: "code", label: "Code" },
          { key: "name", label: "Name" },
          { key: "rate", label: "Rate", render: renderPercent },
          { key: "scope", label: "Scope" },
          { key: "isSst", label: "SST", render: renderText },
          { key: "myInvoisTaxTypeCode", label: "MyInvois tax type" },
          { key: "isActive", label: "Status", render: renderStatus },
        ],
      },
    ],
  },
  {
    key: "payment-terms",
    label: "Payment Terms",
    singularLabel: "payment term",
    description: "Control payment due-day rules for customer and supplier documents.",
    path: "/foundation/payment-terms",
    apiPath: "/master-data/payment-terms",
    searchPlaceholder: "Search payment term code or name",
    defaultValues: { code: "", name: "", days: 0, isActive: true },
    fields: [
      { key: "code", label: "Code", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "days", label: "Days", type: "number", required: true, min: 0, step: 1 },
      { key: "isActive", label: "Active", type: "checkbox" },
    ],
    columns: [
      { key: "code", label: "Code", render: (item) => item.code },
      { key: "name", label: "Name", render: (item) => item.name },
      { key: "days", label: "Days", render: (item) => renderText(item.days) },
      { key: "isActive", label: "Status", render: (item) => renderStatus(item.isActive) },
    ],
    filters: [statusFilter],
    detailSections: [
      {
        title: "Payment Term",
        fields: [
          { key: "code", label: "Code" },
          { key: "name", label: "Name" },
          { key: "days", label: "Days" },
          { key: "isActive", label: "Status", render: renderStatus },
        ],
      },
    ],
  },
  {
    key: "warehouses",
    label: "Warehouses",
    singularLabel: "warehouse",
    description: "Maintain receiving and stocking locations for purchase and inventory flows.",
    path: "/foundation/warehouses",
    apiPath: "/master-data/warehouses",
    searchPlaceholder: "Search warehouse code or name",
    defaultValues: { code: "", name: "", addressJson: "{}", isActive: true },
    fields: [
      { key: "code", label: "Code", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "addressJson", label: "Address", type: "textarea" },
      { key: "isActive", label: "Active", type: "checkbox" },
    ],
    columns: [
      { key: "code", label: "Code", render: (item) => item.code },
      { key: "name", label: "Name", render: (item) => item.name },
      { key: "isActive", label: "Status", render: (item) => renderStatus(item.isActive) },
    ],
    filters: [statusFilter],
    detailSections: [
      {
        title: "Warehouse",
        fields: [
          { key: "code", label: "Code" },
          { key: "name", label: "Name" },
          { key: "isActive", label: "Status", render: renderStatus },
        ],
      },
      {
        title: "Address",
        fields: [{ key: "addressJson", label: "Address", render: (value) => formatWarehouseAddress(typeof value === "string" ? value : "") }],
      },
    ],
  },
  {
    key: "currencies",
    label: "Currencies",
    singularLabel: "currency",
    description: "Maintain allowed document currencies and decimal-place rules.",
    path: "/foundation/currencies",
    apiPath: "/master-data/currencies",
    searchPlaceholder: "Search currency code, name, or symbol",
    defaultValues: { code: "", name: "", symbol: "", decimalPlaces: 2, isActive: true },
    fields: [
      { key: "code", label: "Code", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "symbol", label: "Symbol", type: "text", required: true },
      { key: "decimalPlaces", label: "Decimal places", type: "number", required: true, min: 0, step: 1 },
      { key: "isActive", label: "Active", type: "checkbox" },
    ],
    columns: [
      { key: "code", label: "Code", render: (item) => item.code },
      { key: "name", label: "Name", render: (item) => item.name },
      { key: "symbol", label: "Symbol", render: (item) => renderText(item.symbol) },
      { key: "isActive", label: "Status", render: (item) => renderStatus(item.isActive) },
    ],
    filters: [statusFilter],
    detailSections: [
      {
        title: "Currency",
        fields: [
          { key: "code", label: "Code" },
          { key: "name", label: "Name" },
          { key: "symbol", label: "Symbol" },
          { key: "decimalPlaces", label: "Decimal places" },
          { key: "isActive", label: "Status", render: renderStatus },
        ],
      },
    ],
  },
  {
    key: "product-categories",
    label: "Product Categories",
    singularLabel: "product category",
    description: "Organize products under reusable category codes.",
    path: "/foundation/product-categories",
    apiPath: "/master-data/product-categories",
    searchPlaceholder: "Search category code, name, or description",
    defaultValues: { code: "", name: "", description: "", isActive: true },
    fields: [
      { key: "code", label: "Code", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "isActive", label: "Active", type: "checkbox" },
    ],
    columns: [
      { key: "code", label: "Code", render: (item) => item.code },
      { key: "name", label: "Name", render: (item) => item.name },
      { key: "description", label: "Description", render: (item) => renderText(item.description) },
      { key: "isActive", label: "Status", render: (item) => renderStatus(item.isActive) },
    ],
    filters: [statusFilter],
    detailSections: [
      {
        title: "Product Category",
        fields: [
          { key: "code", label: "Code" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "isActive", label: "Status", render: renderStatus },
        ],
      },
    ],
  },
  {
    key: "price-levels",
    label: "Price Levels",
    singularLabel: "price level",
    description: "Define reusable pricing adjustments for future customer and product pricing references.",
    path: "/foundation/price-levels",
    apiPath: "/master-data/price-levels",
    searchPlaceholder: "Search price level code, name, or description",
    defaultValues: { code: "", name: "", adjustmentPercent: 0, description: "", isActive: true },
    fields: [
      { key: "code", label: "Code", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "adjustmentPercent", label: "Adjustment %", type: "number", required: true, min: -100, step: 0.01 },
      { key: "description", label: "Description", type: "textarea" },
      { key: "isActive", label: "Active", type: "checkbox" },
    ],
    columns: [
      { key: "code", label: "Code", render: (item) => item.code },
      { key: "name", label: "Name", render: (item) => item.name },
      { key: "adjustmentPercent", label: "Adjustment", render: (item) => renderPriceLevelAdjustment(item.adjustmentPercent) },
      { key: "isActive", label: "Status", render: (item) => renderStatus(item.isActive) },
    ],
    filters: [statusFilter],
    detailSections: [
      {
        title: "Price Level",
        fields: [
          { key: "code", label: "Code" },
          { key: "name", label: "Name" },
          { key: "adjustmentPercent", label: "Adjustment", render: renderPriceLevelAdjustment },
          { key: "description", label: "Description" },
          { key: "isActive", label: "Status", render: renderStatus },
        ],
      },
    ],
  },
];

export const priorityFoundationModuleKeys = [
  "chart-of-accounts",
  "tax-codes",
  "payment-terms",
  "warehouses",
  "currencies",
  "price-levels",
] as const;

export const priorityFoundationModules = foundationModules.filter((module) =>
  priorityFoundationModuleKeys.includes(module.key as (typeof priorityFoundationModuleKeys)[number]));

export function getFoundationModule(key: string) {
  return foundationModules.find((item) => item.key === key);
}

export function renderFoundationValue(value: unknown) {
  return renderText(value);
}

export function renderFoundationDate(value: unknown) {
  return renderDate(value);
}
