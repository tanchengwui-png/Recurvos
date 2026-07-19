const SALES_SHEET_NAME = "CustomSalesPrices";
const PURCHASE_SHEET_NAME = "CustomPurchasePrices";

const salesHeaders = [
  "Product Code",
  "Product Name",
  "Contact Code",
  "Contact Name",
  "Contact Group",
  "Price Level",
  "Date From",
  "Date To",
  "Min Qty",
  "UOM",
  "Unit Price",
] as const;

const purchaseHeaders = [
  "Product Code",
  "Product Name",
  "Supplier Code",
  "Supplier Name",
  "Price Level",
  "Date From",
  "Date To",
  "Min Qty",
  "UOM",
  "Unit Price",
] as const;

export type PricingWorkbookMode = "sales" | "purchase";

export type PricingWorkbookRow = Record<string, string>;

function toIsoDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizeCell(value: unknown) {
  if (value == null) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).trim();
}

export async function downloadPricingTemplate(mode: PricingWorkbookMode, productCode: string, productName: string) {
  const XLSX = await import("xlsx");
  const headers = mode === "sales" ? salesHeaders : purchaseHeaders;
  const exampleRow = mode === "sales"
    ? [productCode, productName, "CUST-001", "ABC Sdn Bhd", "VIP Customers", "VIP", "2026-01-01", "2026-12-31", 1, "Unit", 10]
    : [productCode, productName, "SUP-001", "XYZ Trading", "Dealer", "2026-01-01", "2026-12-31", 10, "Carton", 220];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    [...headers],
    exampleRow,
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, mode === "sales" ? SALES_SHEET_NAME : PURCHASE_SHEET_NAME);
  XLSX.writeFile(workbook, `${mode === "sales" ? "custom-sales-prices" : "custom-purchase-prices"}-template.xlsx`);
}

export async function readPricingWorkbook(file: File, mode: PricingWorkbookMode) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = mode === "sales" ? SALES_SHEET_NAME : PURCHASE_SHEET_NAME;
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Workbook must include a sheet named ${sheetName}.`);
  }

  const rows = XLSX.utils.sheet_to_json<(string | number | Date)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  const headers = mode === "sales" ? salesHeaders : purchaseHeaders;
  const [firstRow = [], ...bodyRows] = rows;
  const missingHeaders = headers.filter((header) => !firstRow.some((value) => normalizeCell(value) === header));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required template headers: ${missingHeaders.join(", ")}.`);
  }

  return bodyRows
    .map((cells) => Object.fromEntries(headers.map((header, index) => [header, normalizeCell(cells[index])])) as PricingWorkbookRow)
    .filter((row) => Object.values(row).some(Boolean))
    .map((row): PricingWorkbookRow => ({
      ...row,
      "Date From": toIsoDate(row["Date From"]),
      "Date To": toIsoDate(row["Date To"]),
    }));
}
