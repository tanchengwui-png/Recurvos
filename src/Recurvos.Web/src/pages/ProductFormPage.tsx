import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { FormActionSection } from "../components/ui/FormActionSection";
import { FormPageHeader } from "../components/ui/FormPageHeader";
import { StandardFormLayout } from "../components/ui/StandardFormLayout";
import { AccountSelect } from "../components/ui/AccountSelect";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { api } from "../lib/api";
import { standardUomOptions, type SearchableSelectOption } from "../lib/localeOptions";
import { downloadPricingTemplate, readPricingWorkbook } from "../lib/productCustomPriceWorkbook";
import { DEFAULT_UPLOAD_POLICY, formatUploadSizeLabel, prepareImageUpload } from "../lib/uploads";
import type { CompanyLookup, ContactGroup, Customer, MasterDataSnapshot, PlatformUploadPolicy, PriceLevel, ProductCustomPrice, ProductCustomPriceTargetType, ProductDetails, ProductGroup, ProductUomConversion } from "../types";
import { normalizeProductCode } from "../utils/products";

type ProductFormState = {
  id?: string;
  companyId: string;
  name: string;
  code: string;
  description: string;
  barcode: string;
  category: string;
  productGroups: string[];
  binLocation: string;
  trackInventory: boolean;
  inventoryAccount: string;
  reorderLevel: string;
  openingQuantity: string;
  openingCost: string;
  isSelling: boolean;
  salesPrice: string;
  salesTaxCode: string;
  incomeAccount: string;
  salesDescription: string;
  isBuying: boolean;
  purchasePrice: string;
  purchaseTaxCode: string;
  expenseAccount: string;
  preferredSupplierId: string;
  purchaseDescription: string;
  baseUnitLabel: string;
  hasMultipleUoms: boolean;
  baseSalesUomDefault: boolean;
  basePurchaseUomDefault: boolean;
  uomConversions: ProductUomConversionRow[];
  hasCustomSalesPrices: boolean;
  customSalesPrices: ProductCustomPriceRow[];
  hasCustomPurchasePrices: boolean;
  customPurchasePrices: ProductCustomPriceRow[];
  isSubscriptionProduct: boolean;
  isActive: boolean;
};

type ProductUomConversionRow = {
  id: string;
  label: string;
  factor: string;
  salePrice: string;
  purchasePrice: string;
  isDefaultSalesUom: boolean;
  isDefaultPurchaseUom: boolean;
};

type ProductCustomPriceRow = {
  id: string;
  targetType: ProductCustomPriceTargetType;
  contactId: string;
  contactCode: string;
  contactName: string;
  contactGroup: string;
  priceLevel: string;
  dateFromUtc: string;
  dateToUtc: string;
  minQuantity: string;
  uom: string;
  unitPrice: string;
};

type ImportErrorRow = {
  rowNumber: number;
  status: "error";
  messages: string[];
  data: Record<string, string>;
};

type PricingImportSummary = {
  fileName: string;
  totalRows: number;
  imported: number;
  failed: number;
  errorRows: ImportErrorRow[];
};

type MultiValueLookupProps = {
  values: string[];
  options: string[];
  placeholder: string;
  searchPlaceholder: string;
  addLabel: string;
  emptyText: string;
  ariaLabel: string;
  onChange: (values: string[]) => void;
  allowCreate?: boolean;
};

const emptyForm = (): ProductFormState => ({
  companyId: "",
  name: "",
  code: "",
  description: "",
  barcode: "",
  category: "",
  productGroups: [],
  binLocation: "",
  trackInventory: false,
  inventoryAccount: "",
  reorderLevel: "",
  openingQuantity: "",
  openingCost: "",
  isSelling: true,
  salesPrice: "",
  salesTaxCode: "",
  incomeAccount: "",
  salesDescription: "",
  isBuying: false,
  purchasePrice: "",
  purchaseTaxCode: "",
  expenseAccount: "",
  preferredSupplierId: "",
  purchaseDescription: "",
  baseUnitLabel: "Unit",
  hasMultipleUoms: false,
  baseSalesUomDefault: false,
  basePurchaseUomDefault: false,
  uomConversions: [],
  hasCustomSalesPrices: false,
  customSalesPrices: [],
  hasCustomPurchasePrices: false,
  customPurchasePrices: [],
  isSubscriptionProduct: true,
  isActive: true,
});

let uomRowSequence = 0;
let customPriceRowSequence = 0;

function createUomRow(overrides: Partial<ProductUomConversionRow> = {}): ProductUomConversionRow {
  uomRowSequence += 1;
  return {
    id: `uom-${uomRowSequence}`,
    label: "",
    factor: "",
    salePrice: "",
    purchasePrice: "",
    isDefaultSalesUom: false,
    isDefaultPurchaseUom: false,
    ...overrides,
  };
}

function createCustomPriceRow(overrides: Partial<ProductCustomPriceRow> = {}): ProductCustomPriceRow {
  customPriceRowSequence += 1;
  return {
    id: `price-${customPriceRowSequence}`,
    targetType: "Contact",
    contactId: "",
    contactCode: "",
    contactName: "",
    contactGroup: "",
    priceLevel: "",
    dateFromUtc: "",
    dateToUtc: "",
    minQuantity: "1",
    uom: "",
    unitPrice: "",
    ...overrides,
  };
}

function normalizeUniqueStrings(values: string[]) {
  return values
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((value) => value.toLowerCase() === item.toLowerCase()) === index);
}

function mergeLookupOptions(existingValues: string[], selectedValues: string[]) {
  const merged = new Map<string, string>();

  existingValues.forEach((value) => {
    const trimmed = value.trim();
    if (trimmed) {
      merged.set(trimmed.toLowerCase(), trimmed);
    }
  });

  selectedValues.forEach((value) => {
    const trimmed = value.trim();
    if (trimmed) {
      merged.set(trimmed.toLowerCase(), trimmed);
    }
  });

  return Array.from(merged.values()).sort((left, right) => left.localeCompare(right));
}

function mergeMissingSelection(options: SearchableSelectOption[], selectedValue: string) {
  if (!selectedValue || options.some((option) => option.value === selectedValue)) {
    return options;
  }

  return [{ value: selectedValue, label: selectedValue }, ...options];
}

function parseUomConversions(values: ProductUomConversion[] | undefined) {
  return (values ?? []).map((value) => createUomRow({
    label: value.label,
    factor: value.factor ? String(value.factor) : "",
    salePrice: value.salePrice == null ? "" : String(value.salePrice),
    purchasePrice: value.purchasePrice == null ? "" : String(value.purchasePrice),
    isDefaultSalesUom: value.isDefaultSalesUom,
    isDefaultPurchaseUom: value.isDefaultPurchaseUom,
  }));
}

function parseDecimalInput(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

function parseCustomPrices(values: ProductCustomPrice[] | undefined) {
  return (values ?? []).map((value) => createCustomPriceRow({
    targetType: value.targetType,
    contactId: value.contactId ?? "",
    contactCode: value.contactCode ?? "",
    contactName: value.contactName ?? "",
    contactGroup: value.contactGroup ?? "",
    priceLevel: value.priceLevel ?? "",
    dateFromUtc: value.dateFromUtc?.slice(0, 10) ?? "",
    dateToUtc: value.dateToUtc?.slice(0, 10) ?? "",
    minQuantity: value.minQuantity == null ? "1" : String(value.minQuantity),
    uom: value.uom ?? "",
    unitPrice: value.unitPrice ? String(value.unitPrice) : "",
  }));
}

function getAvailableUomOptions(form: ProductFormState) {
  return [form.baseUnitLabel.trim(), ...form.uomConversions.map((conversion) => conversion.label.trim())]
    .filter(Boolean)
    .filter((value, index, list) => list.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index);
}

function normalizeIsoDate(value: string) {
  return value.trim() ? value.trim() : "";
}

function getContactDisplayName(contact: Customer) {
  return (contact.legalName || contact.name || "").trim();
}

function validateCustomPrices(
  rows: ProductCustomPriceRow[],
  enabled: boolean,
  label: string,
  availableUoms: string[],
) {
  if (!enabled) {
    return "";
  }

  const normalizedUoms = availableUoms.map((value) => value.toLowerCase());
  const keys = new Set<string>();

  for (const row of rows) {
    const hasAnyValue = row.contactId || row.contactName.trim() || row.contactGroup.trim() || row.priceLevel.trim() || row.uom.trim() || row.unitPrice.trim() || row.dateFromUtc.trim() || row.dateToUtc.trim() || row.minQuantity.trim();
    if (!hasAnyValue) {
      continue;
    }

    if (row.targetType === "Contact" && !row.contactName.trim()) {
      return `Each custom ${label} price needs a contact.`;
    }

    if (row.targetType === "ContactGroup" && !row.contactGroup.trim()) {
      return `Each custom ${label} price needs a contact group.`;
    }

    if (row.targetType === "PriceLevel" && !row.priceLevel.trim()) {
      return `Each custom ${label} price needs a price level.`;
    }

    if (!row.uom.trim() || !normalizedUoms.includes(row.uom.trim().toLowerCase())) {
      return `Each custom ${label} price must reference an existing UOM.`;
    }

    const minQuantity = Number(row.minQuantity);
    if (!row.minQuantity.trim() || Number.isNaN(minQuantity) || minQuantity <= 0) {
      return `Each custom ${label} price minimum quantity must be greater than zero.`;
    }

    const unitPrice = Number(row.unitPrice);
    if (!row.unitPrice.trim() || Number.isNaN(unitPrice) || unitPrice <= 0) {
      return `Each custom ${label} price unit price must be greater than zero.`;
    }

    if (row.dateFromUtc && row.dateToUtc && row.dateFromUtc > row.dateToUtc) {
      return `Each custom ${label} price must have Date From on or before Date To.`;
    }

    const duplicateKey = [
      row.targetType,
      row.contactId,
      row.contactCode.trim().toLowerCase(),
      row.contactName.trim().toLowerCase(),
      row.contactGroup.trim().toLowerCase(),
      row.priceLevel.trim().toLowerCase(),
      row.dateFromUtc,
      row.dateToUtc,
      row.minQuantity.trim(),
      row.uom.trim().toLowerCase(),
    ].join("|");

    if (keys.has(duplicateKey)) {
      return `Duplicate custom ${label} price rows are not allowed.`;
    }

    keys.add(duplicateKey);
  }

  return "";
}

function splitUomConfiguration(product: ProductDetails) {
  const normalizedBaseLabel = (product.baseUnitLabel || "Unit").trim().toLowerCase();
  const baseEntry = (product.uomConversions ?? []).find((value) => value.label.trim().toLowerCase() === normalizedBaseLabel);
  const extraEntries = (product.uomConversions ?? []).filter((value) => value.label.trim().toLowerCase() !== normalizedBaseLabel);

  return {
    baseSalesUomDefault: baseEntry?.isDefaultSalesUom ?? false,
    basePurchaseUomDefault: baseEntry?.isDefaultPurchaseUom ?? false,
    uomConversions: parseUomConversions(extraEntries),
  };
}

function validateUomConfiguration(form: ProductFormState) {
  if (!form.hasMultipleUoms) {
    return "";
  }

  const baseLabel = form.baseUnitLabel.trim();
  const activeRows = form.uomConversions.filter((row) =>
    row.label.trim()
    || row.factor.trim()
    || row.salePrice.trim()
    || row.purchasePrice.trim()
    || row.isDefaultSalesUom
    || row.isDefaultPurchaseUom);

  const labels = [baseLabel, ...activeRows.map((row) => row.label.trim()).filter(Boolean)];
  const uniqueLabels = new Set(labels.map((label) => label.toLowerCase()));
  const salesDefaultCount = (form.isSelling && form.baseSalesUomDefault ? 1 : 0) + activeRows.filter((row) => form.isSelling && row.isDefaultSalesUom).length;
  const purchaseDefaultCount = (form.isBuying && form.basePurchaseUomDefault ? 1 : 0) + activeRows.filter((row) => form.isBuying && row.isDefaultPurchaseUom).length;

  if (!baseLabel) {
    return "Base unit label is required.";
  }

  if (labels.length !== uniqueLabels.size) {
    return "Each UOM label must be unique within the product.";
  }

  for (const row of activeRows) {
    if (!row.label.trim()) {
      return "Each UOM row needs a label.";
    }

    const rate = Number(row.factor);
    if (!row.factor.trim() || Number.isNaN(rate) || rate <= 0) {
      return "Each UOM rate must be greater than zero.";
    }

    const salePrice = parseDecimalInput(row.salePrice);
    if (salePrice != null && (Number.isNaN(salePrice) || salePrice < 0)) {
      return "Each UOM sale price must be zero or more.";
    }

    const purchasePrice = parseDecimalInput(row.purchasePrice);
    if (purchasePrice != null && (Number.isNaN(purchasePrice) || purchasePrice < 0)) {
      return "Each UOM purchase price must be zero or more.";
    }
  }

  if (salesDefaultCount > 1) {
    return "Only one default sales UOM can be selected.";
  }

  if (purchaseDefaultCount > 1) {
    return "Only one default purchase UOM can be selected.";
  }

  return "";
}

function MultiValueLookup({
  values,
  options,
  placeholder,
  searchPlaceholder,
  addLabel,
  emptyText,
  ariaLabel,
  onChange,
  allowCreate = true,
}: MultiValueLookupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const selectedValues = normalizeUniqueStrings(values);
  const mergedOptions = mergeLookupOptions(options, selectedValues);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? mergedOptions.filter((option) => option.toLowerCase().includes(normalizedQuery))
    : mergedOptions;
  const canCreate = allowCreate && Boolean(query.trim()) && !mergedOptions.some((option) => option.toLowerCase() === query.trim().toLowerCase());

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    searchInputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  function setValueSelected(value: string, selected: boolean) {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    onChange(selected
      ? normalizeUniqueStrings([...selectedValues, trimmed])
      : selectedValues.filter((item) => item.toLowerCase() !== trimmed.toLowerCase()));
  }

  return (
    <div ref={containerRef} className="lookup-multiselect">
      <button
        type="button"
        className={`text-input lookup-multiselect-trigger ${isOpen ? "lookup-multiselect-trigger-open" : ""}`.trim()}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className={selectedValues.length > 0 ? "lookup-multiselect-value" : "searchable-select-placeholder"}>
          {selectedValues.length > 0 ? `${selectedValues.length} selected` : placeholder}
        </span>
        <span className="searchable-select-chevron" aria-hidden="true">v</span>
      </button>
      {selectedValues.length > 0 ? (
        <div className="lookup-selected-chips" aria-label={`Selected ${ariaLabel}`}>
          {selectedValues.map((value) => (
            <button key={value} type="button" className="lookup-chip" onClick={() => setValueSelected(value, false)} aria-label={`Remove ${value}`}>
              <span>{value}</span>
              <span aria-hidden="true">x</span>
            </button>
          ))}
        </div>
      ) : null}
      {isOpen ? (
        <div className="lookup-multiselect-popover">
          <input
            ref={searchInputRef}
            className="text-input searchable-select-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
          <div className="lookup-multiselect-list" role="listbox" aria-label={ariaLabel}>
            {filteredOptions.length > 0 ? filteredOptions.map((option) => (
              <label key={option} className="lookup-multiselect-option">
                <input
                  type="checkbox"
                  checked={selectedValues.some((value) => value.toLowerCase() === option.toLowerCase())}
                  onChange={(event) => setValueSelected(option, event.target.checked)}
                />
                <span>{option}</span>
              </label>
            )) : (
              <p className="searchable-select-empty">{emptyText}</p>
            )}
          </div>
          {canCreate ? (
            <button type="button" className="lookup-add-option" onClick={() => {
              setValueSelected(query.trim(), true);
              setQuery("");
            }}
            >
              {`+ ${addLabel} "${query.trim()}"`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ProductFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editingProductId = id ?? null;
  const [companies, setCompanies] = useState<CompanyLookup[]>([]);
  const [masterData, setMasterData] = useState<MasterDataSnapshot | null>(null);
  const [contacts, setContacts] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Customer[]>([]);
  const [contactGroups, setContactGroups] = useState<ContactGroup[]>([]);
  const [productGroupOptions, setProductGroupOptions] = useState<string[]>([]);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const [uploadPolicy, setUploadPolicy] = useState<PlatformUploadPolicy>(DEFAULT_UPLOAD_POLICY);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [imageRemoved, setImageRemoved] = useState(false);
  const [hasStoredImage, setHasStoredImage] = useState(false);
  const [salesPricingPage, setSalesPricingPage] = useState(1);
  const [purchasePricingPage, setPurchasePricingPage] = useState(1);
  const [salesImportSummary, setSalesImportSummary] = useState<PricingImportSummary | null>(null);
  const [purchaseImportSummary, setPurchaseImportSummary] = useState<PricingImportSummary | null>(null);
  const salesImportInputRef = useRef<HTMLInputElement | null>(null);
  const purchaseImportInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    async function load() {
      const [companyList, snapshot, contactList, groupList, productList, product, policy] = await Promise.all([
        api.get<CompanyLookup[]>("/companies"),
        api.get<MasterDataSnapshot>("/master-data").catch(() => null),
        api.get<Customer[]>("/customers").catch(() => []),
        api.get<ContactGroup[]>("/contact-groups").catch(() => []),
        api.get<ProductGroup[]>("/product-groups").catch(() => []),
        editingProductId ? api.get<ProductDetails>(`/products/${editingProductId}`) : Promise.resolve(null),
        api.get<PlatformUploadPolicy>("/settings/upload-policy").catch(() => DEFAULT_UPLOAD_POLICY),
      ]);

      setCompanies(companyList);
      setMasterData(snapshot);
      setContacts(contactList);
      setSuppliers(contactList.filter((contact) => contact.contactType.split(",").map((item) => item.trim()).includes("Supplier")));
      setContactGroups(groupList);
      setProductGroupOptions(productList.map((group) => group.name));
      setUploadPolicy(policy);

      if (!editingProductId) {
        setForm((current) => ({ ...current, companyId: current.companyId || companyList[0]?.id || "" }));
        return;
      }

      if (!product) {
        setFormError("Product not found.");
        return;
      }

      setHasStoredImage(product.hasImage);
      const parsedUomConfiguration = splitUomConfiguration(product);

      setForm({
        id: product.id,
        companyId: product.companyId,
        name: product.name,
        code: product.code,
        description: product.description || "",
        barcode: product.barcode || "",
        category: product.category || "",
        productGroups: product.productGroups || [],
        binLocation: product.binLocation || "",
        trackInventory: product.trackInventory,
        inventoryAccount: product.inventoryAccount || "",
        reorderLevel: product.reorderLevel == null ? "" : String(product.reorderLevel),
        openingQuantity: product.openingQuantity == null ? "" : String(product.openingQuantity),
        openingCost: product.openingCost == null ? "" : String(product.openingCost),
        isSelling: product.isSelling,
        salesPrice: product.salesPrice == null ? "" : String(product.salesPrice),
        salesTaxCode: product.salesTaxCode || "",
        incomeAccount: product.incomeAccount || "",
        salesDescription: product.salesDescription || "",
        isBuying: product.isBuying,
        purchasePrice: product.purchasePrice == null ? "" : String(product.purchasePrice),
        purchaseTaxCode: product.purchaseTaxCode || "",
        expenseAccount: product.expenseAccount || "",
        preferredSupplierId: product.preferredSupplierId || "",
        purchaseDescription: product.purchaseDescription || "",
        baseUnitLabel: product.baseUnitLabel || "Unit",
        hasMultipleUoms: product.hasMultipleUoms,
        baseSalesUomDefault: parsedUomConfiguration.baseSalesUomDefault,
        basePurchaseUomDefault: parsedUomConfiguration.basePurchaseUomDefault,
        uomConversions: parsedUomConfiguration.uomConversions,
        hasCustomSalesPrices: product.hasCustomSalesPrices,
        customSalesPrices: parseCustomPrices(product.customSalesPrices),
        hasCustomPurchasePrices: product.hasCustomPurchasePrices,
        customPurchasePrices: parseCustomPrices(product.customPurchasePrices),
        isSubscriptionProduct: product.isSubscriptionProduct,
        isActive: product.isActive,
      });
    }

    void load();
  }, [editingProductId]);

  useEffect(() => {
    let isActive = true;
    let objectUrl = "";

    async function loadPreview() {
      if (imageFile) {
        objectUrl = URL.createObjectURL(imageFile);
        if (isActive) {
          setImagePreviewUrl(objectUrl);
        }
        return;
      }

      if (imageRemoved || !editingProductId) {
        if (isActive) {
          setImagePreviewUrl("");
        }
        return;
      }

      try {
        const file = await api.download(`/products/${editingProductId}/image`);
        objectUrl = URL.createObjectURL(file.blob);
        if (isActive) {
          setImagePreviewUrl(objectUrl);
        }
      } catch {
        if (isActive) {
          setImagePreviewUrl("");
        }
      }
    }

    void loadPreview();

    return () => {
      isActive = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [editingProductId, imageFile, imageRemoved]);

  const requiredMark = <span className="form-required-indicator" aria-hidden="true">*</span>;
  const baseUomOptions = mergeMissingSelection(standardUomOptions, form.baseUnitLabel);
  const salesTaxOptions = mergeMissingSelection((masterData?.taxCodes ?? [])
    .filter((taxCode) => taxCode.isActive && (taxCode.scope === "Sales" || taxCode.scope === "Both"))
    .map((taxCode) => ({ value: taxCode.code, label: `${taxCode.code} - ${taxCode.name}` })), form.salesTaxCode);
  const purchaseTaxOptions = mergeMissingSelection((masterData?.taxCodes ?? [])
    .filter((taxCode) => taxCode.isActive && (taxCode.scope === "Purchase" || taxCode.scope === "Both"))
    .map((taxCode) => ({ value: taxCode.code, label: `${taxCode.code} - ${taxCode.name}` })), form.purchaseTaxCode);
  const categoryOptions = mergeMissingSelection((masterData?.productCategories ?? [])
    .filter((category) => category.isActive)
    .map((category) => ({ value: category.code, label: `${category.code} - ${category.name}`, keywords: [category.name, category.description || ""] })), form.category);
  const contactOptions = contacts
    .filter((contact) => contact.companyIds.length === 0 || contact.companyIds.includes(form.companyId))
    .map((contact) => ({
      value: contact.id,
      label: getContactDisplayName(contact),
      keywords: [contact.email, contact.phoneNumber, contact.externalReference, contact.contactType],
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const supplierOptions = suppliers
    .filter((supplier) => supplier.companyIds.length === 0 || supplier.companyIds.includes(form.companyId))
    .map((supplier) => ({
      value: supplier.id,
      label: supplier.legalName || supplier.name,
      keywords: [supplier.email, supplier.phoneNumber, supplier.otherName || ""],
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const contactGroupOptions = contactGroups
    .map((group) => ({ value: group.name, label: group.name }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const priceLevelOptions = (masterData?.priceLevels ?? [])
    .filter((item) => item.isActive)
    .map((item: PriceLevel) => ({ value: item.code, label: `${item.code} - ${item.name}` }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const uomOptions = getAvailableUomOptions(form).map((value) => ({ value, label: value }));
  const salesPricingPageSize = 10;
  const purchasePricingPageSize = 10;
  const pagedSalesPrices = form.customSalesPrices.slice((salesPricingPage - 1) * salesPricingPageSize, salesPricingPage * salesPricingPageSize);
  const pagedPurchasePrices = form.customPurchasePrices.slice((purchasePricingPage - 1) * purchasePricingPageSize, purchasePricingPage * purchasePricingPageSize);

  function updateConversion(index: number, patch: Partial<ProductUomConversionRow>) {
    setForm((current) => ({
      ...current,
      uomConversions: current.uomConversions.map((conversion, conversionIndex) => conversionIndex === index ? { ...conversion, ...patch } : conversion),
    }));
  }

  function addConversion() {
    setForm((current) => ({
      ...current,
      uomConversions: [...current.uomConversions, createUomRow()],
    }));
  }

  function removeConversion(index: number) {
    setForm((current) => ({
      ...current,
      uomConversions: current.uomConversions.filter((_, conversionIndex) => conversionIndex !== index),
    }));
  }

  function setDefaultSalesUom(targetId: string | null) {
    setForm((current) => ({
      ...current,
      baseSalesUomDefault: targetId === null ? false : targetId === "base",
      uomConversions: current.uomConversions.map((conversion) => ({
        ...conversion,
        isDefaultSalesUom: targetId === null ? false : conversion.id === targetId,
      })),
    }));
  }

  function setDefaultPurchaseUom(targetId: string | null) {
    setForm((current) => ({
      ...current,
      basePurchaseUomDefault: targetId === null ? false : targetId === "base",
      uomConversions: current.uomConversions.map((conversion) => ({
        ...conversion,
        isDefaultPurchaseUom: targetId === null ? false : conversion.id === targetId,
      })),
    }));
  }

  function updateCustomPriceRow(kind: "sales" | "purchase", index: number, patch: Partial<ProductCustomPriceRow>) {
    setForm((current) => kind === "sales"
      ? {
          ...current,
          customSalesPrices: current.customSalesPrices.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row),
        }
      : {
          ...current,
          customPurchasePrices: current.customPurchasePrices.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row),
        });
  }

  function addCustomPriceRow(kind: "sales" | "purchase") {
    setForm((current) => {
      const nextRow = createCustomPriceRow({ uom: getAvailableUomOptions(current)[0] || current.baseUnitLabel.trim() || "Unit" });
      return kind === "sales"
        ? {
            ...current,
            hasCustomSalesPrices: true,
            customSalesPrices: [...current.customSalesPrices, nextRow],
          }
        : {
            ...current,
            hasCustomPurchasePrices: true,
            customPurchasePrices: [...current.customPurchasePrices, nextRow],
          };
    });
  }

  function removeCustomPriceRow(kind: "sales" | "purchase", index: number) {
    setForm((current) => kind === "sales"
      ? {
          ...current,
          customSalesPrices: current.customSalesPrices.filter((_, rowIndex) => rowIndex !== index),
        }
      : {
          ...current,
          customPurchasePrices: current.customPurchasePrices.filter((_, rowIndex) => rowIndex !== index),
        });
  }

  function syncContactSelection(kind: "sales" | "purchase", index: number, contactId: string) {
    const source = kind === "sales" ? contacts : suppliers;
    const selectedContact = source.find((item) => item.id === contactId);
    updateCustomPriceRow(kind, index, {
      contactId,
      contactCode: selectedContact?.externalReference ?? "",
      contactName: selectedContact ? getContactDisplayName(selectedContact) : "",
    });
  }

  function downloadImportErrors(kind: "sales" | "purchase") {
    const summary = kind === "sales" ? salesImportSummary : purchaseImportSummary;
    if (!summary || summary.errorRows.length === 0) {
      return;
    }

    const headers = Object.keys(summary.errorRows[0].data);
    const lines = [
      ["Row", "Status", "Messages", ...headers].join(","),
      ...summary.errorRows.map((row) => [row.rowNumber, row.status, `"${row.messages.join("; ").replace(/"/g, "\"\"")}"`, ...headers.map((header) => `"${(row.data[header] ?? "").replace(/"/g, "\"\"")}"`)].join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${kind}-custom-pricing-import-errors.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handlePricingImport(kind: "sales" | "purchase", file: File) {
    const pricingContacts = kind === "sales" ? contacts : suppliers;
    const headersProductCode = normalizeProductCode(form.code);
    const productName = form.name.trim();
    const rows = await readPricingWorkbook(file, kind);
    const nextRows: ProductCustomPriceRow[] = [];
    const errors: ImportErrorRow[] = [];
    const duplicateKeys = new Set<string>();
    const availableUomSet = new Set(getAvailableUomOptions(form).map((value) => value.toLowerCase()));

    rows.forEach((row, rowIndex) => {
      const productCode = normalizeProductCode(row["Product Code"] ?? "");
      const importedProductName = (row["Product Name"] ?? "").trim();
      const codeHeader = kind === "sales" ? "Contact Code" : "Supplier Code";
      const nameHeader = kind === "sales" ? "Contact Name" : "Supplier Name";
      const targetCode = (row[codeHeader] ?? "").trim();
      const targetName = (row[nameHeader] ?? "").trim();
      const contactGroup = (row["Contact Group"] ?? "").trim();
      const priceLevel = (row["Price Level"] ?? "").trim();
      const dateFromUtc = normalizeIsoDate(row["Date From"] ?? "");
      const dateToUtc = normalizeIsoDate(row["Date To"] ?? "");
      const minQuantity = (row["Min Qty"] ?? "").trim();
      const uom = (row["UOM"] ?? "").trim();
      const unitPrice = (row["Unit Price"] ?? "").trim();
      const messages: string[] = [];

      if (!headersProductCode || productCode !== headersProductCode) {
        messages.push("Product Code does not match the current product.");
      }

      if (productName && importedProductName && importedProductName.toLowerCase() !== productName.toLowerCase()) {
        messages.push("Product Name does not match the current product.");
      }

      const matchedContact = pricingContacts.find((contact) =>
        (targetCode && contact.externalReference.trim().toLowerCase() === targetCode.toLowerCase())
        || (targetName && getContactDisplayName(contact).toLowerCase() === targetName.toLowerCase()));

      const targetType: ProductCustomPriceTargetType = (targetCode || targetName)
        ? "Contact"
        : contactGroup
          ? "ContactGroup"
          : "PriceLevel";

      if (!targetCode && !targetName && !contactGroup && !priceLevel) {
        messages.push("Provide a contact, contact group, or price level.");
      }

      if (!matchedContact && targetType === "Contact") {
        messages.push(`${kind === "sales" ? "Contact" : "Supplier"} not found.`);
      }

      if (targetType === "ContactGroup" && !contactGroups.some((group) => group.name.toLowerCase() === contactGroup.toLowerCase())) {
        messages.push("Contact Group not found.");
      }

      if (priceLevel && !priceLevelOptions.some((option) => option.value.toLowerCase() === priceLevel.toLowerCase())) {
        messages.push("Price Level not found.");
      }

      if (!uom || !availableUomSet.has(uom.toLowerCase())) {
        messages.push("UOM not found.");
      }

      if (!unitPrice || Number.isNaN(Number(unitPrice)) || Number(unitPrice) <= 0) {
        messages.push("Unit Price must be greater than zero.");
      }

      if (minQuantity && (Number.isNaN(Number(minQuantity)) || Number(minQuantity) <= 0)) {
        messages.push("Min Qty must be greater than zero.");
      }

      if (dateFromUtc && dateToUtc && dateFromUtc > dateToUtc) {
        messages.push("Date From must be on or before Date To.");
      }

      const duplicateKey = [targetType, matchedContact?.id ?? "", targetCode.toLowerCase(), targetName.toLowerCase(), contactGroup.toLowerCase(), priceLevel.toLowerCase(), dateFromUtc, dateToUtc, minQuantity || "1", uom.toLowerCase()].join("|");
      if (duplicateKeys.has(duplicateKey)) {
        messages.push("Duplicate row detected.");
      }

      duplicateKeys.add(duplicateKey);

      if (messages.length > 0) {
        errors.push({ rowNumber: rowIndex + 2, status: "error", messages, data: row });
        return;
      }

      nextRows.push(createCustomPriceRow({
        targetType,
        contactId: matchedContact?.id ?? "",
        contactCode: matchedContact?.externalReference ?? targetCode,
        contactName: matchedContact ? getContactDisplayName(matchedContact) : targetName,
        contactGroup,
        priceLevel,
        dateFromUtc,
        dateToUtc,
        minQuantity: minQuantity || "1",
        uom,
        unitPrice,
      }));
    });

    setForm((current) => kind === "sales"
      ? {
          ...current,
          hasCustomSalesPrices: true,
          customSalesPrices: nextRows,
        }
      : {
          ...current,
          hasCustomPurchasePrices: true,
          customPurchasePrices: nextRows,
        });
    const summary = {
      fileName: file.name,
      totalRows: rows.length,
      imported: nextRows.length,
      failed: errors.length,
      errorRows: errors,
    };
    if (kind === "sales") {
      setSalesImportSummary(summary);
      setSalesPricingPage(1);
    } else {
      setPurchaseImportSummary(summary);
      setPurchasePricingPage(1);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError("");

    // The API resolves account codes from the shared chart and validates their
    // required type. Keeping IDs null avoids stale lookups while the form is open.
    const inventoryAccountId = null;
    const incomeAccountId = null;
    const expenseAccountId = null;
    const salesTaxCodeId = masterData?.taxCodes.find((taxCode) => taxCode.code === form.salesTaxCode)?.id ?? null;
    const purchaseTaxCodeId = masterData?.taxCodes.find((taxCode) => taxCode.code === form.purchaseTaxCode)?.id ?? null;
    const preferredSupplierName = suppliers.find((supplier) => supplier.id === form.preferredSupplierId)?.legalName || suppliers.find((supplier) => supplier.id === form.preferredSupplierId)?.name || "";
    const normalizedGroups = normalizeUniqueStrings(form.productGroups);
    const uomValidationError = validateUomConfiguration(form);
    if (uomValidationError) {
      setFormError(uomValidationError);
      return;
    }
    const availableUoms = getAvailableUomOptions(form);
    const customSalesPriceError = validateCustomPrices(form.customSalesPrices, form.hasCustomSalesPrices, "sales", availableUoms);
    if (customSalesPriceError) {
      setFormError(customSalesPriceError);
      return;
    }
    const customPurchasePriceError = validateCustomPrices(form.customPurchasePrices, form.hasCustomPurchasePrices, "purchase", availableUoms);
    if (customPurchasePriceError) {
      setFormError(customPurchasePriceError);
      return;
    }

    const normalizedUoms = [
      {
        label: form.baseUnitLabel.trim(),
        factor: 1,
        salePrice: form.isSelling ? parseDecimalInput(form.salesPrice) : null,
        purchasePrice: form.isBuying ? parseDecimalInput(form.purchasePrice) : null,
        isDefaultSalesUom: form.isSelling && form.baseSalesUomDefault,
        isDefaultPurchaseUom: form.isBuying && form.basePurchaseUomDefault,
      },
      ...form.uomConversions
        .map((conversion) => ({
          label: conversion.label.trim(),
          factor: Number(conversion.factor),
          salePrice: form.isSelling ? parseDecimalInput(conversion.salePrice) : null,
          purchasePrice: form.isBuying ? parseDecimalInput(conversion.purchasePrice) : null,
          isDefaultSalesUom: form.isSelling && conversion.isDefaultSalesUom,
          isDefaultPurchaseUom: form.isBuying && conversion.isDefaultPurchaseUom,
        }))
        .filter((conversion) =>
          conversion.label
          || String(conversion.factor).trim()
          || conversion.salePrice != null
          || conversion.purchasePrice != null
          || conversion.isDefaultSalesUom
          || conversion.isDefaultPurchaseUom),
    ];

    const payload = {
      companyId: form.companyId,
      name: form.name.trim(),
      code: normalizeProductCode(form.code),
      description: form.description.trim() || null,
      barcode: form.barcode.trim() || null,
      category: form.category.trim() || null,
      productGroups: normalizedGroups,
      binLocation: form.binLocation.trim() || null,
      trackInventory: form.trackInventory,
      inventoryAccountId: form.trackInventory ? inventoryAccountId : null,
      inventoryAccount: form.trackInventory ? form.inventoryAccount.trim() : "",
      reorderLevel: form.trackInventory && form.reorderLevel.trim() ? Number(form.reorderLevel) : null,
      openingQuantity: form.trackInventory && form.openingQuantity.trim() ? Number(form.openingQuantity) : null,
      openingCost: form.trackInventory && form.openingCost.trim() ? Number(form.openingCost) : null,
      isSelling: form.isSelling,
      salesPrice: form.isSelling && form.salesPrice.trim() ? Number(form.salesPrice) : null,
      salesTaxCodeId: form.isSelling ? salesTaxCodeId : null,
      salesTaxCode: form.isSelling ? form.salesTaxCode.trim() : "",
      incomeAccountId: form.isSelling ? incomeAccountId : null,
      incomeAccount: form.isSelling ? form.incomeAccount.trim() : "",
      salesDescription: form.isSelling ? form.salesDescription.trim() || null : null,
      isBuying: form.isBuying,
      purchasePrice: form.isBuying && form.purchasePrice.trim() ? Number(form.purchasePrice) : null,
      purchaseTaxCodeId: form.isBuying ? purchaseTaxCodeId : null,
      purchaseTaxCode: form.isBuying ? form.purchaseTaxCode.trim() : "",
      expenseAccountId: form.isBuying ? expenseAccountId : null,
      expenseAccount: form.isBuying ? form.expenseAccount.trim() : "",
      preferredSupplierId: form.isBuying && form.preferredSupplierId ? form.preferredSupplierId : null,
      preferredSupplierName: form.isBuying ? preferredSupplierName : "",
      purchaseDescription: form.isBuying ? form.purchaseDescription.trim() || null : null,
      baseUnitLabel: form.baseUnitLabel.trim(),
      hasMultipleUoms: form.hasMultipleUoms,
      uomConversions: form.hasMultipleUoms ? normalizedUoms : [],
      hasCustomSalesPrices: form.hasCustomSalesPrices,
      customSalesPrices: form.hasCustomSalesPrices
        ? form.customSalesPrices
          .filter((row) => row.contactName.trim() || row.contactGroup.trim() || row.priceLevel.trim() || row.uom.trim() || row.unitPrice.trim())
          .map((row) => ({
            targetType: row.targetType,
            contactId: row.contactId || null,
            contactCode: row.contactCode.trim(),
            contactName: row.contactName.trim(),
            contactGroup: row.contactGroup.trim(),
            priceLevel: row.priceLevel.trim(),
            dateFromUtc: row.dateFromUtc ? new Date(`${row.dateFromUtc}T00:00:00Z`).toISOString() : null,
            dateToUtc: row.dateToUtc ? new Date(`${row.dateToUtc}T00:00:00Z`).toISOString() : null,
            minQuantity: row.minQuantity.trim() ? Number(row.minQuantity) : 1,
            uom: row.uom.trim(),
            unitPrice: Number(row.unitPrice),
          }))
        : [],
      hasCustomPurchasePrices: form.hasCustomPurchasePrices,
      customPurchasePrices: form.hasCustomPurchasePrices
        ? form.customPurchasePrices
          .filter((row) => row.contactName.trim() || row.contactGroup.trim() || row.priceLevel.trim() || row.uom.trim() || row.unitPrice.trim())
          .map((row) => ({
            targetType: row.targetType,
            contactId: row.contactId || null,
            contactCode: row.contactCode.trim(),
            contactName: row.contactName.trim(),
            contactGroup: row.contactGroup.trim(),
            priceLevel: row.priceLevel.trim(),
            dateFromUtc: row.dateFromUtc ? new Date(`${row.dateFromUtc}T00:00:00Z`).toISOString() : null,
            dateToUtc: row.dateToUtc ? new Date(`${row.dateToUtc}T00:00:00Z`).toISOString() : null,
            minQuantity: row.minQuantity.trim() ? Number(row.minQuantity) : 1,
            uom: row.uom.trim(),
            unitPrice: Number(row.unitPrice),
          }))
        : [],
      isSubscriptionProduct: form.isSubscriptionProduct,
      isActive: form.isActive,
    };

    setConfirmState({
      title: form.id ? "Update product" : "Create product",
      description: form.id
        ? `Save changes to ${form.name || "this product"}?`
        : `Create ${form.name || "this product"} for the selected company?`,
      action: async () => {
        setIsSubmitting(true);
        try {
          const saved = form.id
            ? await api.put<ProductDetails>(`/products/${form.id}`, payload)
            : await api.post<ProductDetails>("/products", payload);

          if (imageFile) {
            const imageData = new FormData();
            imageData.append("file", imageFile);
            await api.postForm<ProductDetails>(`/products/${saved.id}/image`, imageData);
          } else if (imageRemoved && hasStoredImage) {
            await api.delete(`/products/${saved.id}/image`);
          }

          navigate("/products", {
            replace: true,
            state: { flashMessage: form.id ? `Product updated: ${payload.name || "Product"}.` : `Product created: ${payload.name || "Product"}.` },
          });
        } catch (error) {
          const nextError = error instanceof Error ? error.message : "Unable to save product.";
          setFormError(nextError);
          throw new Error(nextError);
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  }

  return (
    <div className="page product-create-page">
      <StandardFormLayout className="product-create-content standard-form-page">
      <FormPageHeader backLabel="Back to Products" backHref="/products" breadcrumbs={<><span>Products</span><span>/</span><span>{editingProductId ? "Edit Product" : "New Product"}</span></>} />
        <form id="product-form" className="form-stack product-create-form" onSubmit={submit}>
          <section className="product-form-section" aria-labelledby="product-information-title">
            <div className="product-form-section-header">
              <span className="product-form-section-number">01</span><div><h3 id="product-information-title">Product information</h3><p>Core identity, grouping and classification.</p></div>
            </div>
            <div className="product-form-section-body product-form-grid">
              <label className="form-label product-form-field">
                Company
                <select value={form.companyId} disabled={Boolean(editingProductId)} onChange={(event) => setForm((current) => ({ ...current, companyId: event.target.value }))}>
                  {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                </select>
              </label>
              <label className="form-label product-form-field">
                <span className="form-label-inline">Product Name {requiredMark}</span>
                <input className="text-input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="form-label product-form-field">
                SKU / Code
                <input className="text-input" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: normalizeProductCode(event.target.value) }))} />
                <span className="product-field-guidance">Use an uppercase SKU or code such as STARTER or GROWTH-PLAN.</span>
              </label>
              <label className="form-label product-form-field">
                Barcode
                <input className="text-input" value={form.barcode} onChange={(event) => setForm((current) => ({ ...current, barcode: event.target.value }))} />
              </label>
              <label className="form-label product-form-field product-form-field-wide">
                Product Group(s)
                <MultiValueLookup
                  values={form.productGroups}
                  options={productGroupOptions}
                  placeholder="Select product groups"
                  searchPlaceholder="Search product groups"
                  addLabel="Add group"
                  emptyText="No product groups yet."
                  ariaLabel="Product groups"
                  onChange={(values) => setForm((current) => ({ ...current, productGroups: values }))}
                  allowCreate={false}
                />
              </label>
              <label className="form-label product-form-field product-form-field-wide">
                Classification Code
                <SearchableSelect
                  value={form.category}
                  onChange={(value) => setForm((current) => ({ ...current, category: value }))}
                  options={categoryOptions}
                  placeholder="Select classification code"
                  searchPlaceholder="Search classification codes"
                  ariaLabel="Classification Code"
                  clearable
                />
              </label>
              <label className="form-label product-form-field">
                Bin Location
                <input className="text-input" value={form.binLocation} onChange={(event) => setForm((current) => ({ ...current, binLocation: event.target.value }))} />
              </label>
              <label className="form-label product-form-field product-form-field-wide">
                Description
                <textarea className="company-profile-textarea" rows={4} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
              </label>
            </div>
          </section>

          <section className="product-form-section" aria-labelledby="product-image-title">
            <div className="product-form-section-header"><span className="product-form-section-number">02</span><div><h3 id="product-image-title">Product image</h3><p>Image used in catalogues and product records.</p></div></div>
            <div className="product-form-section-body product-image-layout">
              <div className="product-image-preview">
                <div className="logo-preview-frame product-image-preview-frame">
                  {imagePreviewUrl ? <img src={imagePreviewUrl} alt="Product image preview" className="logo-preview-image" /> : <><span className="product-image-icon" aria-hidden="true">▧</span><span>No product image selected</span></>}
                </div>
                <div className="company-profile-logo-summary">
                  <span className={`status-pill ${imagePreviewUrl ? "status-pill-active" : "status-pill-inactive"}`}>
                    {imageRemoved ? "Image will be removed" : imagePreviewUrl ? "Preview ready" : "No image uploaded"}
                  </span>
                  <p className="muted">Recommended square or landscape image</p>
                </div>
              </div>
              <div className="product-image-controls">
                <div>
                  <input
                    className="product-image-input"
                    id="product-image-upload"
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp"
                    aria-label="Product image file"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (!file) {
                        setImageFile(null);
                        return;
                      }

                      void (async () => {
                        try {
                          const prepared = await prepareImageUpload(file, uploadPolicy);
                          setFormError("");
                          setImageRemoved(false);
                          setImageFile(prepared);
                        } catch (uploadError) {
                          setFormError(uploadError instanceof Error ? uploadError.message : `Product image must be ${formatUploadSizeLabel(uploadPolicy.uploadMaxBytes)} or smaller.`);
                          event.target.value = "";
                          setImageFile(null);
                        }
                      })();
                    }}
                  />
                  <label className="button button-secondary" htmlFor="product-image-upload">Choose image</label>
                </div>
                <div className="product-image-meta">
                  <p>{imageRemoved ? "No image uploaded" : imageFile ? `Selected: ${imageFile.name}` : imagePreviewUrl ? "Current image uploaded" : "No image uploaded"}</p>
                  <p className="muted">PNG, JPG, JPEG or WEBP · Maximum {formatUploadSizeLabel(uploadPolicy.uploadMaxBytes)}</p>
                  <p className="muted">Recommended square or landscape image.</p>
                </div>
                <div className="product-image-actions">
                  {(imageFile || imagePreviewUrl) && !imageRemoved ? (
                    <button
                      type="button"
                      className="button button-secondary"
                    onClick={() => {
                      setImageFile(null);
                      setImageRemoved(imageFile ? false : hasStoredImage);
                      setFormError("");
                    }}
                  >
                    {imageFile ? "Clear selected image" : "Remove image"}
                  </button>
                  ) : null}
                  {imageRemoved && hasStoredImage ? (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => {
                        setImageRemoved(false);
                        setFormError("");
                      }}
                    >
                      Keep current image
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className="product-form-section" aria-labelledby="product-inventory-title">
            <div className="product-form-section-header">
              <span className="product-form-section-number">03</span><div><h3 id="product-inventory-title">Inventory</h3><p>Stock tracking and storage settings.</p></div>
            </div>
            <div className="product-form-section-body product-form-grid">
              <label className="product-setting-row product-form-field-wide">
                <span><strong>Track inventory</strong><small>Enable stock quantity, reorder and storage controls.</small></span>
                <input type="checkbox" checked={form.trackInventory} onChange={(event) => setForm((current) => ({ ...current, trackInventory: event.target.checked }))} />
              </label>
              {form.trackInventory ? (
                <>
                  <label className="form-label company-profile-field company-profile-field-wide">
                    Inventory Account
                    <AccountSelect
                      value={form.inventoryAccount}
                      onChange={(value) => setForm((current) => ({ ...current, inventoryAccount: value }))}
                      kind="inventory"
                      placeholder="Select inventory account"
                      searchPlaceholder="Search asset accounts"
                      ariaLabel="Inventory Account"
                      clearable
                    />
                  </label>
                  <label className="form-label company-profile-field">
                    Reorder Level
                    <input className="text-input" type="number" min="0" step="0.01" value={form.reorderLevel} onChange={(event) => setForm((current) => ({ ...current, reorderLevel: event.target.value }))} />
                  </label>
                  <label className="form-label company-profile-field">
                    Opening Quantity
                    <input className="text-input" type="number" min="0" step="0.01" value={form.openingQuantity} onChange={(event) => setForm((current) => ({ ...current, openingQuantity: event.target.value }))} />
                  </label>
                  <label className="form-label company-profile-field">
                    Opening Cost
                    <input className="text-input" type="number" min="0" step="0.01" value={form.openingCost} onChange={(event) => setForm((current) => ({ ...current, openingCost: event.target.value }))} />
                  </label>
                </>
              ) : (
                <div className="company-profile-field company-profile-field-wide">
                  <p className="muted">Inventory fields are available after stock tracking is enabled.</p>
                </div>
              )}
            </div>
          </section>

          <section className="product-form-section" aria-labelledby="product-sales-title">
            <div className="product-form-section-header">
              <span className="product-form-section-number">04</span><div><h3 id="product-sales-title">Sales</h3><p>Selling price, tax, income account and sales description.</p></div>
            </div>
            <div className="product-form-section-body product-form-grid">
              <label className="product-setting-row product-form-field-wide">
                <span><strong>I&apos;m selling</strong><small>Enable sales pricing, tax and income settings.</small></span>
                <input type="checkbox" checked={form.isSelling} onChange={(event) => setForm((current) => ({ ...current, isSelling: event.target.checked }))} />
              </label>
              {form.isSelling ? (
                <>
                  <label className="form-label company-profile-field">
                    Sales Price
                    <input className="text-input" type="number" min="0" step="0.01" value={form.salesPrice} onChange={(event) => setForm((current) => ({ ...current, salesPrice: event.target.value }))} />
                  </label>
                  <label className="form-label company-profile-field company-profile-field-wide">
                    Sales Tax
                    <SearchableSelect
                      value={form.salesTaxCode}
                      onChange={(value) => setForm((current) => ({ ...current, salesTaxCode: value }))}
                      options={salesTaxOptions}
                      placeholder="Select sales tax"
                      searchPlaceholder="Search sales tax codes"
                      ariaLabel="Sales Tax"
                      clearable
                    />
                  </label>
                  <label className="form-label company-profile-field company-profile-field-wide">
                    Income Account
                    <AccountSelect
                      value={form.incomeAccount}
                      onChange={(value) => setForm((current) => ({ ...current, incomeAccount: value }))}
                      kind="income"
                      placeholder="Select income account"
                      searchPlaceholder="Search revenue accounts"
                      ariaLabel="Income Account"
                      clearable
                    />
                  </label>
                  <label className="form-label company-profile-field company-profile-field-wide">
                    Sales Description
                    <textarea className="company-profile-textarea" rows={4} value={form.salesDescription} onChange={(event) => setForm((current) => ({ ...current, salesDescription: event.target.value }))} />
                  </label>
                </>
              ) : (
                <div className="company-profile-field company-profile-field-wide">
                  <p className="muted">Sales fields are available after selling is enabled.</p>
                </div>
              )}
            </div>
          </section>

          <section className="product-form-section" aria-labelledby="product-purchase-title">
            <div className="product-form-section-header">
              <span className="product-form-section-number">05</span><div><h3 id="product-purchase-title">Purchases</h3><p>Purchase cost, tax, supplier and expense settings.</p></div>
            </div>
            <div className="product-form-section-body product-form-grid">
              <label className="product-setting-row product-form-field-wide">
                <span><strong>I&apos;m buying</strong><small>Enable purchase cost, tax and supplier settings.</small></span>
                <input type="checkbox" checked={form.isBuying} onChange={(event) => setForm((current) => ({ ...current, isBuying: event.target.checked }))} />
              </label>
              {form.isBuying ? (
                <>
                  <label className="form-label company-profile-field">
                    Purchase Price / Cost
                    <input className="text-input" type="number" min="0" step="0.01" value={form.purchasePrice} onChange={(event) => setForm((current) => ({ ...current, purchasePrice: event.target.value }))} />
                  </label>
                  <label className="form-label company-profile-field company-profile-field-wide">
                    Purchase Tax
                    <SearchableSelect
                      value={form.purchaseTaxCode}
                      onChange={(value) => setForm((current) => ({ ...current, purchaseTaxCode: value }))}
                      options={purchaseTaxOptions}
                      placeholder="Select purchase tax"
                      searchPlaceholder="Search purchase tax codes"
                      ariaLabel="Purchase Tax"
                      clearable
                    />
                  </label>
                  <label className="form-label company-profile-field company-profile-field-wide">
                    Expense Account
                    <AccountSelect
                      value={form.expenseAccount}
                      onChange={(value) => setForm((current) => ({ ...current, expenseAccount: value }))}
                      kind="expense"
                      placeholder="Select expense account"
                      searchPlaceholder="Search expense accounts"
                      ariaLabel="Expense Account"
                      clearable
                    />
                  </label>
                  <label className="form-label company-profile-field company-profile-field-wide">
                    Preferred Supplier
                    <SearchableSelect
                      value={form.preferredSupplierId}
                      onChange={(value) => setForm((current) => ({ ...current, preferredSupplierId: value }))}
                      options={supplierOptions}
                      placeholder="Select preferred supplier"
                      searchPlaceholder="Search suppliers"
                      ariaLabel="Preferred Supplier"
                      clearable
                    />
                  </label>
                  <label className="form-label company-profile-field company-profile-field-wide">
                    Purchase Description
                    <textarea className="company-profile-textarea" rows={4} value={form.purchaseDescription} onChange={(event) => setForm((current) => ({ ...current, purchaseDescription: event.target.value }))} />
                  </label>
                </>
              ) : (
                <div className="company-profile-field company-profile-field-wide">
                  <p className="muted">Purchase fields are available after buying is enabled.</p>
                </div>
              )}
            </div>
          </section>

          <section className="product-form-section" aria-labelledby="product-uom-title">
            <div className="product-form-section-header">
              <span className="product-form-section-number">06</span><div><h3 id="product-uom-title">Unit of measurement</h3><p>Base unit and optional unit conversions.</p></div>
            </div>
            <div className="product-form-section-body product-form-grid">
              <label className="product-setting-row product-form-field-wide">
                <span><strong>Multiple UOMs</strong><small>Enable conversions and sales or purchase defaults.</small></span>
                <input type="checkbox" checked={form.hasMultipleUoms} onChange={(event) => setForm((current) => ({ ...current, hasMultipleUoms: event.target.checked }))} />
              </label>
              <div className="company-profile-field company-profile-field-wide uom-config-section">
                  <div className="table-scroll table-scroll-bounded">
                    <table className="catalog-table uom-config-table">
                      <thead>
                        <tr>
                          <th>UOM</th>
                          <th>Rate</th>
                          <th>Sale Price</th>
                          <th>Purchase Price</th>
                          <th>Default Sales UOM</th>
                          <th>Default Purchase UOM</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>
                            <div className="uom-base-cell">
                              <SearchableSelect
                                value={form.baseUnitLabel}
                                onChange={(value) => setForm((current) => ({ ...current, baseUnitLabel: value }))}
                                options={baseUomOptions}
                                placeholder="Select base unit"
                                searchPlaceholder="Search units"
                                emptyText="No units found."
                                ariaLabel="Base unit (required)"
                                className="uom-label-select"
                              />
                              <span className="uom-base-badge">Required base</span>
                            </div>
                          </td>
                          <td>
                            <input className="text-input uom-rate-input" value="1.00" aria-label="Base unit rate" disabled />
                          </td>
                          <td>
                            <input
                              className="text-input uom-price-input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={form.salesPrice}
                              onChange={(event) => setForm((current) => ({ ...current, salesPrice: event.target.value }))}
                              aria-label="Base unit sale price"
                              disabled={!form.isSelling}
                              placeholder="0.00"
                            />
                          </td>
                          <td>
                            <input
                              className="text-input uom-price-input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={form.purchasePrice}
                              onChange={(event) => setForm((current) => ({ ...current, purchasePrice: event.target.value }))}
                              aria-label="Base unit purchase price"
                              disabled={!form.isBuying}
                              placeholder="0.00"
                            />
                          </td>
                          <td>
                            <label className="uom-default-toggle">
                              <input
                                type="checkbox"
                                checked={form.baseSalesUomDefault}
                                onChange={() => setDefaultSalesUom(form.baseSalesUomDefault ? null : "base")}
                                disabled={!form.isSelling}
                              />
                              <span>Sales</span>
                            </label>
                          </td>
                          <td>
                            <label className="uom-default-toggle">
                              <input
                                type="checkbox"
                                checked={form.basePurchaseUomDefault}
                                onChange={() => setDefaultPurchaseUom(form.basePurchaseUomDefault ? null : "base")}
                                disabled={!form.isBuying}
                              />
                              <span>Purchases</span>
                            </label>
                          </td>
                          <td className="uom-action-cell">
                            <span className="muted">-</span>
                          </td>
                        </tr>
                        {form.hasMultipleUoms ? form.uomConversions.map((conversion, index) => (
                          <tr key={conversion.id}>
                            <td>
                              <SearchableSelect
                                value={conversion.label}
                                onChange={(value) => updateConversion(index, { label: value })}
                                options={mergeMissingSelection(standardUomOptions, conversion.label)}
                                placeholder="Select unit"
                                searchPlaceholder="Search units"
                                emptyText="No units found."
                                ariaLabel={`UOM label ${index + 1}`}
                                className="uom-label-select"
                              />
                            </td>
                            <td>
                              <input className="text-input uom-rate-input" type="number" min="0.0001" step="0.0001" value={conversion.factor} onChange={(event) => updateConversion(index, { factor: event.target.value })} placeholder="0.00" aria-label={`UOM rate ${index + 1}`} />
                            </td>
                            <td>
                              <input
                                className="text-input uom-price-input"
                                type="number"
                                min="0"
                                step="0.01"
                                value={conversion.salePrice}
                                onChange={(event) => updateConversion(index, { salePrice: event.target.value })}
                                placeholder="0.00"
                                aria-label={`UOM sale price ${index + 1}`}
                                disabled={!form.isSelling}
                              />
                            </td>
                            <td>
                              <input
                                className="text-input uom-price-input"
                                type="number"
                                min="0"
                                step="0.01"
                                value={conversion.purchasePrice}
                                onChange={(event) => updateConversion(index, { purchasePrice: event.target.value })}
                                placeholder="0.00"
                                aria-label={`UOM purchase price ${index + 1}`}
                                disabled={!form.isBuying}
                              />
                            </td>
                            <td>
                              <label className="uom-default-toggle">
                                <input
                                  type="checkbox"
                                  checked={conversion.isDefaultSalesUom}
                                  onChange={() => setDefaultSalesUom(conversion.isDefaultSalesUom ? null : conversion.id)}
                                  disabled={!form.isSelling}
                                />
                                <span>Sales</span>
                              </label>
                            </td>
                            <td>
                              <label className="uom-default-toggle">
                                <input
                                  type="checkbox"
                                  checked={conversion.isDefaultPurchaseUom}
                                  onChange={() => setDefaultPurchaseUom(conversion.isDefaultPurchaseUom ? null : conversion.id)}
                                  disabled={!form.isBuying}
                                />
                                <span>Purchases</span>
                              </label>
                            </td>
                            <td className="uom-action-cell">
                              <button type="button" className="button button-secondary button-small" onClick={() => removeConversion(index)}>Delete</button>
                            </td>
                          </tr>
                        )) : null}
                      </tbody>
                    </table>
                  </div>
                  <div className="uom-config-actions">
                    {form.hasMultipleUoms ? <button type="button" className="button button-secondary" onClick={addConversion}>Add UOM</button> : <span className="muted">Enable Multiple UOMs to add optional conversions.</span>}
                  </div>
                  <HelperText>Select the required base UOM in the first row. Each optional conversion rate is measured against that base, and only one default sales UOM and one default purchase UOM can be selected.</HelperText>
              </div>
            </div>
          </section>

          <section className="product-form-section product-custom-pricing-section" aria-labelledby="product-custom-sales-prices-title">
            <div className="product-form-section-header">
              <span className="product-form-section-number">07</span><div><h3 id="product-custom-sales-prices-title">Custom pricing</h3><p>Customer-specific sales and purchase prices.</p></div>
            </div>
            <div className="product-form-section-body pricing-section-body">
              <div className="pricing-settings-row">
              <label className="product-setting-row product-form-field-wide">
                <span><strong>Enable custom sales prices</strong><small>Set sales prices for specific contacts, groups or price levels.</small></span>
                <input type="checkbox" checked={form.hasCustomSalesPrices} onChange={(event) => setForm((current) => ({ ...current, hasCustomSalesPrices: event.target.checked }))} />
              </label>
              {form.hasCustomSalesPrices ? (
                <div className="company-profile-field company-profile-field-wide pricing-config-section">
                  <div className="pricing-config-toolbar">
                    <button type="button" className="button button-secondary" onClick={() => void downloadPricingTemplate("sales", normalizeProductCode(form.code), form.name.trim())}>Download Template</button>
                    <button type="button" className="button button-secondary" onClick={() => salesImportInputRef.current?.click()}>Import File</button>
                    <button type="button" className="button button-secondary" onClick={() => addCustomPriceRow("sales")}>Add Price</button>
                    <input
                      ref={salesImportInputRef}
                      type="file"
                      accept=".xlsx"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) {
                          return;
                        }

                        void handlePricingImport("sales", file).catch((error) => {
                          setFormError(error instanceof Error ? error.message : "Unable to import custom sales prices.");
                        });
                        event.target.value = "";
                      }}
                    />
                  </div>
                  {salesImportSummary ? (
                    <div className="pricing-import-summary">
                      <span className="page-meta-chip"><span className="page-meta-chip-label">Total Rows</span><strong className="page-meta-chip-value">{salesImportSummary.totalRows}</strong></span>
                      <span className="page-meta-chip"><span className="page-meta-chip-label">Imported</span><strong className="page-meta-chip-value">{salesImportSummary.imported}</strong></span>
                      <span className="page-meta-chip"><span className="page-meta-chip-label">Failed</span><strong className="page-meta-chip-value">{salesImportSummary.failed}</strong></span>
                      {salesImportSummary.failed > 0 ? <button type="button" className="button button-secondary button-small" onClick={() => downloadImportErrors("sales")}>Download Error Report</button> : null}
                    </div>
                  ) : null}
                  <div className="table-scroll table-scroll-bounded">
                    <table className="catalog-table pricing-config-table">
                      <thead>
                        <tr>
                          <th>Price Level</th>
                          <th>Customer / Contact</th>
                          <th>Date From</th>
                          <th>Date To</th>
                          <th>Min Qty</th>
                          <th>UOM</th>
                          <th>Unit Price</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {pagedSalesPrices.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="empty-table-cell">No custom sales prices yet.</td>
                          </tr>
                        ) : pagedSalesPrices.map((row, pageIndex) => {
                          const rowIndex = (salesPricingPage - 1) * salesPricingPageSize + pageIndex;
                          return (
                            <tr key={row.id}>
                              <td>
                                <SearchableSelect
                                  value={row.priceLevel}
                                  onChange={(value) => updateCustomPriceRow("sales", rowIndex, { targetType: value ? "PriceLevel" : row.targetType, priceLevel: value })}
                                  options={priceLevelOptions}
                                  placeholder="Select price level"
                                  searchPlaceholder="Search price levels"
                                  ariaLabel={`Sales price level ${rowIndex + 1}`}
                                  clearable
                                />
                              </td>
                              <td>
                                <div className="pricing-target-cell">
                                  <select
                                    value={row.targetType}
                                    onChange={(event) => updateCustomPriceRow("sales", rowIndex, {
                                      targetType: event.target.value as ProductCustomPriceTargetType,
                                      contactId: "",
                                      contactCode: "",
                                      contactName: "",
                                      contactGroup: "",
                                      priceLevel: "",
                                    })}
                                  >
                                    <option value="Contact">Contact</option>
                                    <option value="ContactGroup">Contact Group</option>
                                    <option value="PriceLevel">Price Level</option>
                                  </select>
                                  {row.targetType === "Contact" ? (
                                    <SearchableSelect
                                      value={row.contactId}
                                      onChange={(value) => syncContactSelection("sales", rowIndex, value)}
                                      options={contactOptions}
                                      placeholder="Select contact"
                                      searchPlaceholder="Search contacts"
                                      ariaLabel={`Sales contact ${rowIndex + 1}`}
                                      clearable
                                    />
                                  ) : row.targetType === "ContactGroup" ? (
                                    <SearchableSelect
                                      value={row.contactGroup}
                                      onChange={(value) => updateCustomPriceRow("sales", rowIndex, { contactGroup: value })}
                                      options={contactGroupOptions}
                                      placeholder="Select contact group"
                                      searchPlaceholder="Search contact groups"
                                      ariaLabel={`Sales contact group ${rowIndex + 1}`}
                                      clearable
                                    />
                                  ) : (
                                    <span className="muted">Uses the selected price level.</span>
                                  )}
                                </div>
                              </td>
                              <td><input className="text-input" type="date" value={row.dateFromUtc} onChange={(event) => updateCustomPriceRow("sales", rowIndex, { dateFromUtc: event.target.value })} /></td>
                              <td><input className="text-input" type="date" value={row.dateToUtc} onChange={(event) => updateCustomPriceRow("sales", rowIndex, { dateToUtc: event.target.value })} /></td>
                              <td><input className="text-input pricing-number-input" type="number" min="1" step="0.01" value={row.minQuantity} onChange={(event) => updateCustomPriceRow("sales", rowIndex, { minQuantity: event.target.value })} /></td>
                              <td>
                                <SearchableSelect
                                  value={row.uom}
                                  onChange={(value) => updateCustomPriceRow("sales", rowIndex, { uom: value })}
                                  options={uomOptions}
                                  placeholder="Select UOM"
                                  searchPlaceholder="Search UOMs"
                                  ariaLabel={`Sales UOM ${rowIndex + 1}`}
                                />
                              </td>
                              <td><input className="text-input pricing-number-input" type="number" min="0.01" step="0.01" value={row.unitPrice} onChange={(event) => updateCustomPriceRow("sales", rowIndex, { unitPrice: event.target.value })} /></td>
                              <td className="uom-action-cell"><button type="button" className="button button-secondary button-small" onClick={() => removeCustomPriceRow("sales", rowIndex)}>Delete</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {form.customSalesPrices.length > salesPricingPageSize ? (
                    <div className="pricing-pagination">
                      <button type="button" className="button button-secondary button-small" onClick={() => setSalesPricingPage((current) => Math.max(1, current - 1))} disabled={salesPricingPage === 1}>Previous</button>
                      <span className="muted">{`Page ${salesPricingPage} of ${Math.max(1, Math.ceil(form.customSalesPrices.length / salesPricingPageSize))}`}</span>
                      <button type="button" className="button button-secondary button-small" onClick={() => setSalesPricingPage((current) => Math.min(Math.ceil(form.customSalesPrices.length / salesPricingPageSize), current + 1))} disabled={salesPricingPage >= Math.ceil(form.customSalesPrices.length / salesPricingPageSize)}>Next</button>
                    </div>
                  ) : null}
                  <HelperText>Priority is contact-specific price, then contact group, then price level, then the product default sales price.</HelperText>
                </div>
              ) : (
                null
              )}
              </div>
              <div className="pricing-section-divider" aria-hidden="true" />
              <div className="pricing-settings-row">
              <label className="product-setting-row product-form-field-wide">
                <span><strong>Enable custom purchase prices</strong><small>Set purchase prices for specific suppliers, groups or price levels.</small></span>
                <input type="checkbox" checked={form.hasCustomPurchasePrices} onChange={(event) => setForm((current) => ({ ...current, hasCustomPurchasePrices: event.target.checked }))} />
              </label>
              {form.hasCustomPurchasePrices ? (
                <div className="company-profile-field company-profile-field-wide pricing-config-section">
                  <div className="pricing-config-toolbar">
                    <button type="button" className="button button-secondary" onClick={() => void downloadPricingTemplate("purchase", normalizeProductCode(form.code), form.name.trim())}>Download Template</button>
                    <button type="button" className="button button-secondary" onClick={() => purchaseImportInputRef.current?.click()}>Import File</button>
                    <button type="button" className="button button-secondary" onClick={() => addCustomPriceRow("purchase")}>Add Price</button>
                    <input
                      ref={purchaseImportInputRef}
                      type="file"
                      accept=".xlsx"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) {
                          return;
                        }

                        void handlePricingImport("purchase", file).catch((error) => {
                          setFormError(error instanceof Error ? error.message : "Unable to import custom purchase prices.");
                        });
                        event.target.value = "";
                      }}
                    />
                  </div>
                  {purchaseImportSummary ? (
                    <div className="pricing-import-summary">
                      <span className="page-meta-chip"><span className="page-meta-chip-label">Total Rows</span><strong className="page-meta-chip-value">{purchaseImportSummary.totalRows}</strong></span>
                      <span className="page-meta-chip"><span className="page-meta-chip-label">Imported</span><strong className="page-meta-chip-value">{purchaseImportSummary.imported}</strong></span>
                      <span className="page-meta-chip"><span className="page-meta-chip-label">Failed</span><strong className="page-meta-chip-value">{purchaseImportSummary.failed}</strong></span>
                      {purchaseImportSummary.failed > 0 ? <button type="button" className="button button-secondary button-small" onClick={() => downloadImportErrors("purchase")}>Download Error Report</button> : null}
                    </div>
                  ) : null}
                  <div className="table-scroll table-scroll-bounded">
                    <table className="catalog-table pricing-config-table">
                      <thead>
                        <tr>
                          <th>Price Level</th>
                          <th>Supplier</th>
                          <th>Date From</th>
                          <th>Date To</th>
                          <th>Min Qty</th>
                          <th>UOM</th>
                          <th>Unit Price</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {pagedPurchasePrices.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="empty-table-cell">No custom purchase prices yet.</td>
                          </tr>
                        ) : pagedPurchasePrices.map((row, pageIndex) => {
                          const rowIndex = (purchasePricingPage - 1) * purchasePricingPageSize + pageIndex;
                          return (
                            <tr key={row.id}>
                              <td>
                                <SearchableSelect
                                  value={row.priceLevel}
                                  onChange={(value) => updateCustomPriceRow("purchase", rowIndex, { targetType: value ? "PriceLevel" : row.targetType, priceLevel: value })}
                                  options={priceLevelOptions}
                                  placeholder="Select price level"
                                  searchPlaceholder="Search price levels"
                                  ariaLabel={`Purchase price level ${rowIndex + 1}`}
                                  clearable
                                />
                              </td>
                              <td>
                                <div className="pricing-target-cell">
                                  <select
                                    value={row.targetType}
                                    onChange={(event) => updateCustomPriceRow("purchase", rowIndex, {
                                      targetType: event.target.value as ProductCustomPriceTargetType,
                                      contactId: "",
                                      contactCode: "",
                                      contactName: "",
                                      contactGroup: "",
                                      priceLevel: "",
                                    })}
                                  >
                                    <option value="Contact">Supplier</option>
                                    <option value="ContactGroup">Contact Group</option>
                                    <option value="PriceLevel">Price Level</option>
                                  </select>
                                  {row.targetType === "Contact" ? (
                                    <SearchableSelect
                                      value={row.contactId}
                                      onChange={(value) => syncContactSelection("purchase", rowIndex, value)}
                                      options={supplierOptions}
                                      placeholder="Select supplier"
                                      searchPlaceholder="Search suppliers"
                                      ariaLabel={`Purchase supplier ${rowIndex + 1}`}
                                      clearable
                                    />
                                  ) : row.targetType === "ContactGroup" ? (
                                    <SearchableSelect
                                      value={row.contactGroup}
                                      onChange={(value) => updateCustomPriceRow("purchase", rowIndex, { contactGroup: value })}
                                      options={contactGroupOptions}
                                      placeholder="Select contact group"
                                      searchPlaceholder="Search contact groups"
                                      ariaLabel={`Purchase contact group ${rowIndex + 1}`}
                                      clearable
                                    />
                                  ) : (
                                    <span className="muted">Uses the selected price level.</span>
                                  )}
                                </div>
                              </td>
                              <td><input className="text-input" type="date" value={row.dateFromUtc} onChange={(event) => updateCustomPriceRow("purchase", rowIndex, { dateFromUtc: event.target.value })} /></td>
                              <td><input className="text-input" type="date" value={row.dateToUtc} onChange={(event) => updateCustomPriceRow("purchase", rowIndex, { dateToUtc: event.target.value })} /></td>
                              <td><input className="text-input pricing-number-input" type="number" min="1" step="0.01" value={row.minQuantity} onChange={(event) => updateCustomPriceRow("purchase", rowIndex, { minQuantity: event.target.value })} /></td>
                              <td>
                                <SearchableSelect
                                  value={row.uom}
                                  onChange={(value) => updateCustomPriceRow("purchase", rowIndex, { uom: value })}
                                  options={uomOptions}
                                  placeholder="Select UOM"
                                  searchPlaceholder="Search UOMs"
                                  ariaLabel={`Purchase UOM ${rowIndex + 1}`}
                                />
                              </td>
                              <td><input className="text-input pricing-number-input" type="number" min="0.01" step="0.01" value={row.unitPrice} onChange={(event) => updateCustomPriceRow("purchase", rowIndex, { unitPrice: event.target.value })} /></td>
                              <td className="uom-action-cell"><button type="button" className="button button-secondary button-small" onClick={() => removeCustomPriceRow("purchase", rowIndex)}>Delete</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {form.customPurchasePrices.length > purchasePricingPageSize ? (
                    <div className="pricing-pagination">
                      <button type="button" className="button button-secondary button-small" onClick={() => setPurchasePricingPage((current) => Math.max(1, current - 1))} disabled={purchasePricingPage === 1}>Previous</button>
                      <span className="muted">{`Page ${purchasePricingPage} of ${Math.max(1, Math.ceil(form.customPurchasePrices.length / purchasePricingPageSize))}`}</span>
                      <button type="button" className="button button-secondary button-small" onClick={() => setPurchasePricingPage((current) => Math.min(Math.ceil(form.customPurchasePrices.length / purchasePricingPageSize), current + 1))} disabled={purchasePricingPage >= Math.ceil(form.customPurchasePrices.length / purchasePricingPageSize)}>Next</button>
                    </div>
                  ) : null}
                  <HelperText>Priority is supplier-specific price, then contact group, then price level, then the product default purchase price.</HelperText>
                </div>
              ) : (
                null
              )}
              </div>
            </div>
          </section>

          <section className="product-form-section" aria-labelledby="product-status-title">
            <div className="product-form-section-header">
              <span className="product-form-section-number">08</span><div><h3 id="product-status-title">Status</h3><p>Subscription and active-product settings.</p></div>
            </div>
            <div className="product-form-section-body product-form-grid">
              <label className="product-setting-row product-form-field-wide">
                <span><strong>Subscription product</strong><small>Allows recurring plans and subscription billing.</small></span>
                <input type="checkbox" checked={form.isSubscriptionProduct} onChange={(event) => setForm((current) => ({ ...current, isSubscriptionProduct: event.target.checked }))} />
              </label>
              <label className="product-setting-row product-form-field-wide">
                <span><strong>Active</strong><small>Product can be selected in sales and billing workflows.</small></span>
                <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />
              </label>
            </div>
          </section>

          {formError ? <HelperText tone="error">{formError}</HelperText> : null}
          <FormActionSection className="product-create-actions">
            <div className="product-create-actions-note">Complete all required fields before creating the product.</div>
            <div className="product-create-actions-buttons">
              <button type="button" className="button button-secondary" onClick={() => navigate("/products")}>Cancel</button>
              <button type="submit" className="button button-primary" disabled={isSubmitting}>{isSubmitting ? "Creating product…" : editingProductId ? "Update product" : "Create product"}</button>
            </div>
          </FormActionSection>
        </form>
      </StandardFormLayout>
      <ConfirmModal
        open={confirmState !== null}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        confirmLabel="Confirm"
        onConfirm={async () => { if (confirmState) await confirmState.action(); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
