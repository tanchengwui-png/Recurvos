import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { TablePagination } from "../components/TablePagination";
import { RowActionMenu } from "../components/RowActionMenu";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { useClientPagination } from "../hooks/useClientPagination";
import { useSyncedHorizontalScroll } from "../hooks/useSyncedHorizontalScroll";
import { HelperText } from "../components/ui/HelperText";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { api } from "../lib/api";
import { getAuth } from "../lib/auth";
import { currencyOptions } from "../lib/localeOptions";
import type { SearchableSelectOption } from "../lib/localeOptions";
import type { ContactAddress, ContactGroup, ContactPerson, Customer, CustomerBatchUpdateFields, CustomerBatchUpdateListMode, CustomerBatchUpdateListModes, CustomerBatchUpdateRequest, CustomerBatchUpdateResult, CustomerBatchUpdateTargets, CustomerBatchUpdateValues, FeatureAccess, MasterDataSnapshot, PlatformPackage } from "../types";

const contactTypeOptions: Customer["contactType"][] = ["Customer", "Supplier", "Employee"];
const statusOptions: Customer["status"][] = ["Active", "Inactive", "Archived"];
const myInvoisControlOptions = ["Default", "Enabled", "Disabled"] as const;

type BatchGridField =
  | "legalName"
  | "email"
  | "phoneNumber"
  | "contactPersons"
  | "phoneNumbers"
  | "emailAddresses"
  | "addresses"
  | "contactType"
  | "status"
  | "groups"
  | "creditLimit"
  | "receivableAccount"
  | "payableAccount"
  | "currency"
  | "paymentTerm"
  | "priceLevel"
  | "tags"
  | "location"
  | "myInvoisControl";

type BatchGridColumn = {
  key: BatchGridField;
  label: string;
  width: string;
  editor: "text" | "number" | "select";
};

type BatchView = "operations" | "grid";
type BatchFieldKind = "single" | "multi";

type BatchFieldOption = {
  key: BatchGridField;
  label: string;
  kind: BatchFieldKind;
};

type RecordTargetOption<T> = {
  key: string;
  value: T;
  title: string;
  description: string;
  badges?: string[];
};

const batchFieldOptions: BatchFieldOption[] = [
  { key: "legalName", label: "Legal Name", kind: "single" },
  { key: "email", label: "Primary Email", kind: "single" },
  { key: "phoneNumber", label: "Primary Phone", kind: "single" },
  { key: "contactPersons", label: "Contact Persons", kind: "multi" },
  { key: "phoneNumbers", label: "Phone Numbers", kind: "multi" },
  { key: "emailAddresses", label: "Email Addresses", kind: "multi" },
  { key: "addresses", label: "Addresses", kind: "multi" },
  { key: "contactType", label: "Contact Type", kind: "single" },
  { key: "status", label: "Status", kind: "single" },
  { key: "groups", label: "Contact Groups", kind: "multi" },
  { key: "creditLimit", label: "Credit Limit", kind: "single" },
  { key: "receivableAccount", label: "Receivable Account", kind: "single" },
  { key: "payableAccount", label: "Payable Account", kind: "single" },
  { key: "currency", label: "Currency", kind: "single" },
  { key: "paymentTerm", label: "Payment Term", kind: "single" },
  { key: "priceLevel", label: "Price Level", kind: "single" },
  { key: "tags", label: "Tags", kind: "multi" },
  { key: "location", label: "Location", kind: "single" },
  { key: "myInvoisControl", label: "MyInvois Control", kind: "single" },
];

const batchListModeOptions: CustomerBatchUpdateListMode[] = ["Append", "Replace", "Remove"];

const batchGridColumns: BatchGridColumn[] = [
  { key: "legalName", label: "Legal Name", width: "220px", editor: "text" },
  { key: "email", label: "Email", width: "220px", editor: "text" },
  { key: "phoneNumber", label: "Phone", width: "150px", editor: "text" },
  { key: "contactType", label: "Contact Type", width: "170px", editor: "select" },
  { key: "status", label: "Status", width: "130px", editor: "select" },
  { key: "creditLimit", label: "Credit Limit", width: "140px", editor: "number" },
  { key: "receivableAccount", label: "Receivable", width: "170px", editor: "select" },
  { key: "payableAccount", label: "Payable", width: "170px", editor: "select" },
  { key: "currency", label: "Currency", width: "130px", editor: "select" },
  { key: "paymentTerm", label: "Payment Term", width: "160px", editor: "select" },
  { key: "priceLevel", label: "Price Level", width: "160px", editor: "select" },
  { key: "location", label: "Location", width: "150px", editor: "text" },
  { key: "myInvoisControl", label: "MyInvois", width: "140px", editor: "select" },
];

const emptyContactPerson = (): ContactPerson => ({
  name: "",
  role: "",
  email: "",
  phoneNumber: "",
});

const emptyAddress = (): ContactAddress => ({
  addressName: "",
  streetAddress: "",
  addressLine2: "",
  addressLine3: "",
  city: "",
  postcode: "",
  country: "",
  state: "",
  isDefaultBilling: false,
  isDefaultShipping: false,
});

const emptyBatchValues = (): CustomerBatchUpdateValues => ({
  legalName: "",
  email: "",
  phoneNumber: "",
  contactPersons: [],
  phoneNumbers: [],
  emailAddresses: [],
  addresses: [],
  contactType: "Customer",
  status: "Active",
  receivableAccountId: null,
  receivableAccount: "",
  creditLimit: null,
  payableAccountId: null,
  payableAccount: "",
  groups: [],
  priceLevel: "",
  currency: "MYR",
  paymentTerm: "",
  incomeAccountId: null,
  incomeAccount: "",
  expenseAccountId: null,
  expenseAccount: "",
  location: "",
  tags: [],
  myInvoisControl: "Default",
});

const emptyBatchModes = (): CustomerBatchUpdateListModes => ({
  contactPersons: "Replace",
  phoneNumbers: "Replace",
  emailAddresses: "Replace",
  addresses: "Replace",
  groups: "Replace",
  tags: "Replace",
});

const emptyBatchTargets = (): CustomerBatchUpdateTargets => ({
  contactPersons: [],
  phoneNumbers: [],
  emailAddresses: [],
  addresses: [],
  groups: [],
  tags: [],
});

const emptyBatchFields = (): CustomerBatchUpdateFields => ({
  legalName: false,
  email: false,
  phoneNumber: false,
  contactPersons: false,
  phoneNumbers: false,
  emailAddresses: false,
  addresses: false,
  contactType: false,
  status: false,
  receivableAccount: false,
  creditLimit: false,
  payableAccount: false,
  groups: false,
  priceLevel: false,
  currency: false,
  paymentTerm: false,
  incomeAccount: false,
  expenseAccount: false,
  location: false,
  tags: false,
  myInvoisControl: false,
});

function parseContactTypes(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasValue(value: string | number | null | undefined) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function formatContactAddress(address: ContactAddress) {
  return [
    address.streetAddress.trim(),
    address.addressLine2.trim(),
    address.addressLine3.trim(),
    address.city.trim(),
    address.state.trim(),
    address.postcode.trim(),
    address.country.trim(),
  ].filter(Boolean).join(", ");
}

function hasContactAddressContent(address: ContactAddress) {
  return Boolean(address.addressName.trim() || formatContactAddress(address));
}

function splitContactPersonName(person: ContactPerson) {
  const parts = person.name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return {
      firstName: parts[0] ?? "",
      lastName: "",
    };
  }

  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function DetailItem({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!hasValue(value)) {
    return null;
  }

  return (
    <div className="company-detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DetailListItem({ label, values }: { label: string; values: string[] }) {
  const cleanValues = values.map((value) => value.trim()).filter(Boolean);
  if (cleanValues.length === 0) {
    return null;
  }

  return (
    <div className="company-detail-item company-detail-item-wide">
      <span>{label}</span>
      <div className="contact-detail-chip-row">
        {cleanValues.map((value) => <span key={value} className="page-meta-chip">{value}</span>)}
      </div>
    </div>
  );
}

function ContactGroupPills({ groups }: { groups: string[] }) {
  const cleanGroups = groups.map((group) => group.trim()).filter(Boolean);
  if (cleanGroups.length === 0) {
    return <span className="muted">-</span>;
  }

  return (
    <div className="contact-group-pill-row">
      {cleanGroups.map((group) => <span key={group} className="badge contact-group-pill" title={group}>{group}</span>)}
    </div>
  );
}

function getContactStatusClassName(status: Customer["status"]) {
  if (status === "Active") {
    return "status-pill-active";
  }

  if (status === "Archived") {
    return "status-pill-danger";
  }

  return "status-pill-inactive";
}

function AddContactMenu({ onAddManually, onImport, onBatchUpdate, showBatchUpdate }: { onAddManually: () => void; onImport: () => void; onBatchUpdate: () => void; showBatchUpdate: boolean }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function select(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div ref={menuRef} className="contact-add-menu">
      <button type="button" className="button button-primary contact-add-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="menu">
        Add Contact <span aria-hidden="true">▼</span>
      </button>
      {open ? (
        <div className="contact-add-popover" role="menu" aria-label="Add contact actions">
          <button type="button" role="menuitem" onClick={() => select(onAddManually)}>Add Manually</button>
          <button type="button" role="menuitem" onClick={() => select(onImport)}>Import Contacts</button>
          {showBatchUpdate ? <button type="button" role="menuitem" onClick={() => select(onBatchUpdate)}>Batch Update</button> : null}
        </div>
      ) : null}
    </div>
  );
}

function buildCustomerPayload(customer: Customer) {
  return {
    name: customer.name,
    email: customer.email,
    phoneNumber: customer.phoneNumber,
    externalReference: customer.externalReference,
    billingAddress: customer.billingAddress,
    entityType: customer.entityType,
    legalName: customer.legalName,
    otherName: customer.otherName,
    registrationNumberType: customer.registrationNumberType,
    registrationNumber: customer.registrationNumber,
    oldRegistrationNumber: customer.oldRegistrationNumber,
    tin: customer.tin,
    sstRegistrationNumber: customer.sstRegistrationNumber,
    contactType: customer.contactType,
    status: customer.status,
    contactPersons: customer.contactPersons,
    phoneNumbers: customer.phoneNumbers,
    emailAddresses: customer.emailAddresses,
    addresses: customer.addresses,
    receivableAccount: customer.receivableAccount,
    creditLimit: customer.creditLimit ?? null,
    payableAccount: customer.payableAccount,
    groups: customer.groups,
    priceLevel: customer.priceLevel,
    currency: customer.currency,
    paymentTerm: customer.paymentTerm,
    incomeAccount: customer.incomeAccount,
    expenseAccount: customer.expenseAccount,
    location: customer.location,
    tags: customer.tags,
    myInvoisControl: customer.myInvoisControl,
  };
}

function normalizeUniqueStrings(values: string[]) {
  return values.map((item) => item.trim()).filter(Boolean).filter((item, index, list) => list.findIndex((value) => value.toLowerCase() === item.toLowerCase()) === index);
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

function getContactPersonKey(person: ContactPerson) {
  return [person.name, person.role, person.email, person.phoneNumber].map((value) => value.trim().toLowerCase()).join("\u001f");
}

function getAddressKey(address: ContactAddress) {
  return [
    address.addressName,
    address.streetAddress,
    address.addressLine2,
    address.addressLine3,
    address.city,
    address.postcode,
    address.country,
    address.state,
    String(address.isDefaultBilling),
    String(address.isDefaultShipping),
  ].map((value) => value.trim().toLowerCase()).join("\u001f");
}

function formatContactPersonSummary(person: ContactPerson) {
  return [person.role.trim(), person.email.trim(), person.phoneNumber.trim()].filter(Boolean).join(" · ");
}

function cloneContactPerson(person: ContactPerson): ContactPerson {
  return {
    name: person.name,
    role: person.role,
    email: person.email,
    phoneNumber: person.phoneNumber,
  };
}

function cloneContactAddress(address: ContactAddress): ContactAddress {
  return {
    addressName: address.addressName,
    streetAddress: address.streetAddress,
    addressLine2: address.addressLine2,
    addressLine3: address.addressLine3,
    city: address.city,
    postcode: address.postcode,
    country: address.country,
    state: address.state,
    isDefaultBilling: address.isDefaultBilling,
    isDefaultShipping: address.isDefaultShipping,
  };
}

function cloneCustomerForBatchGrid(customer: Customer): Customer {
  return {
    ...customer,
    contactPersons: customer.contactPersons.map(cloneContactPerson),
    phoneNumbers: [...customer.phoneNumbers],
    emailAddresses: [...customer.emailAddresses],
    addresses: customer.addresses.map(cloneContactAddress),
    groups: [...customer.groups],
    tags: [...customer.tags],
  };
}

function buildContactPersonTargetOptions(customers: Customer[]): RecordTargetOption<ContactPerson>[] {
  const unique = new Map<string, RecordTargetOption<ContactPerson>>();
  customers.forEach((customer) => {
    customer.contactPersons.forEach((person) => {
      const key = getContactPersonKey(person);
      if (!key || unique.has(key)) {
        return;
      }

      unique.set(key, {
        key,
        value: person,
        title: person.name.trim() || "Unnamed contact person",
        description: formatContactPersonSummary(person) || "No extra details",
      });
    });
  });
  return Array.from(unique.values()).sort((left, right) => left.title.localeCompare(right.title));
}

function buildAddressTargetOptions(customers: Customer[]): RecordTargetOption<ContactAddress>[] {
  const unique = new Map<string, RecordTargetOption<ContactAddress>>();
  customers.forEach((customer) => {
    customer.addresses.filter(hasContactAddressContent).forEach((address) => {
      const key = getAddressKey(address);
      if (!key || unique.has(key)) {
        return;
      }

      unique.set(key, {
        key,
        value: address,
        title: address.addressName.trim() || formatContactAddress(address) || "Unnamed address",
        description: formatContactAddress(address) || "No extra details",
        badges: [
          ...(address.isDefaultBilling ? ["Billing Default"] : []),
          ...(address.isDefaultShipping ? ["Shipping Default"] : []),
        ],
      });
    });
  });
  return Array.from(unique.values()).sort((left, right) => left.title.localeCompare(right.title));
}

function RecordTargetSelector<T>({
  options,
  selectedKeys,
  onToggle,
  emptyText,
}: {
  options: RecordTargetOption<T>[];
  selectedKeys: Set<string>;
  onToggle: (option: RecordTargetOption<T>, selected: boolean) => void;
  emptyText: string;
}) {
  if (options.length === 0) {
    return <p className="muted">{emptyText}</p>;
  }

  return (
    <div className="batch-record-target-list">
      {options.map((option) => (
        <label key={option.key} className="batch-record-target-card">
          <input type="checkbox" checked={selectedKeys.has(option.key)} onChange={(event) => onToggle(option, event.target.checked)} />
          <div className="batch-record-target-copy">
            <strong>{option.title}</strong>
            <p>{option.description}</p>
            {option.badges && option.badges.length > 0 ? (
              <div className="batch-record-target-badges">
                {option.badges.map((badge) => <span key={badge} className="status-pill status-pill-active status-pill-compact">{badge}</span>)}
              </div>
            ) : null}
          </div>
        </label>
      ))}
    </div>
  );
}

function buildAccountOptions(accounts?: MasterDataSnapshot["accounts"]): SearchableSelectOption[] {
  return (accounts ?? [])
    .filter((account) => account.isActive)
    .map((account) => ({
      value: account.code,
      label: `${account.code} - ${account.name}`,
      keywords: [account.name, account.type, account.currencyCode],
    }));
}

function resolveAccountIdByCode(accounts: MasterDataSnapshot["accounts"] | undefined, selectedCode: string) {
  const normalized = selectedCode.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  return accounts?.find((account) => account.code.toUpperCase() === normalized)?.id ?? null;
}

function buildCurrencyOptions(currencies: MasterDataSnapshot["currencies"] | undefined, selectedValue: string): SearchableSelectOption[] {
  const activeOptions = (currencies ?? [])
    .filter((currency) => currency.isActive)
    .map((currency) => ({
      value: currency.code,
      label: `${currency.code} - ${currency.name}`,
      keywords: [currency.name, currency.symbol],
    }));

  return mergeMissingSelection(activeOptions, selectedValue, currencyOptions);
}

function buildPaymentTermOptions(paymentTerms?: MasterDataSnapshot["paymentTerms"], selectedValue = ""): SearchableSelectOption[] {
  return mergeMissingSelection((paymentTerms ?? [])
    .filter((paymentTerm) => paymentTerm.isActive)
    .map((paymentTerm) => ({
      value: paymentTerm.code,
      label: `${paymentTerm.code} - ${paymentTerm.name}`,
      keywords: [paymentTerm.name, String(paymentTerm.days)],
    })), selectedValue);
}

function buildPriceLevelOptions(priceLevels?: MasterDataSnapshot["priceLevels"], selectedValue = ""): SearchableSelectOption[] {
  return mergeMissingSelection((priceLevels ?? [])
    .filter((priceLevel) => priceLevel.isActive)
    .map((priceLevel) => ({
      value: priceLevel.code,
      label: `${priceLevel.code} - ${priceLevel.name}`,
      keywords: [priceLevel.name, String(priceLevel.adjustmentPercent)],
    })), selectedValue);
}

function mergeMissingSelection(
  options: SearchableSelectOption[],
  selectedValue: string,
  fallbackOptions: { value: string; label: string }[] = [],
): SearchableSelectOption[] {
  const merged = new Map<string, SearchableSelectOption>();
  options.forEach((option) => merged.set(option.value, option));
  fallbackOptions.forEach((option) => {
    if (!merged.has(option.value)) {
      merged.set(option.value, option);
    }
  });
  if (selectedValue && !merged.has(selectedValue)) {
    merged.set(selectedValue, { value: selectedValue, label: selectedValue });
  }
  return Array.from(merged.values());
}

type MultiValueLookupProps = {
  values: string[];
  options: string[];
  placeholder: string;
  searchPlaceholder: string;
  addLabel: string;
  emptyText: string;
  ariaLabel: string;
  onChange: (values: string[]) => void;
  onCreate?: (value: string) => Promise<string> | string;
  allowCreate?: boolean;
};

function MultiValueLookup({
  values,
  options,
  placeholder,
  searchPlaceholder,
  addLabel,
  emptyText,
  ariaLabel,
  onChange,
  onCreate,
  allowCreate = true,
}: MultiValueLookupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
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
        setCreateError("");
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

  async function createValue() {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

    setIsCreating(true);
    setCreateError("");

    try {
      const createdValue = onCreate ? await onCreate(trimmed) : trimmed;
      setValueSelected(createdValue, true);
      setQuery("");
    } catch (creationError) {
      setCreateError(creationError instanceof Error ? creationError.message : "Unable to add value.");
    } finally {
      setIsCreating(false);
    }
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
            onChange={(event) => {
              setQuery(event.target.value);
              setCreateError("");
            }}
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
            <button type="button" className="lookup-add-option" onClick={createValue} disabled={isCreating}>
              {isCreating ? "Adding..." : `+ ${addLabel} "${query.trim()}"`}
            </button>
          ) : null}
          {createError ? <p className="lookup-create-error">{createError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function CustomersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const [items, setItems] = useState<Customer[]>([]);
  const [contactGroups, setContactGroups] = useState<ContactGroup[]>([]);
  const [masterData, setMasterData] = useState<MasterDataSnapshot | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [packageLimit, setPackageLimit] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; confirmLabel: string; action: () => Promise<void> } | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchView, setBatchView] = useState<BatchView>("operations");
  const [batchRows, setBatchRows] = useState<Customer[]>([]);
  const [dirtyCells, setDirtyCells] = useState<Record<string, true>>({});
  const [batchField, setBatchField] = useState<BatchGridField>("tags");
  const [batchListMode, setBatchListMode] = useState<CustomerBatchUpdateListMode>("Append");
  const [batchValues, setBatchValues] = useState<CustomerBatchUpdateValues>(() => emptyBatchValues());
  const [batchTargets, setBatchTargets] = useState<CustomerBatchUpdateTargets>(() => emptyBatchTargets());
  const [batchContactPersonDraft, setBatchContactPersonDraft] = useState<ContactPerson>(() => emptyContactPerson());
  const [batchAddressDraft, setBatchAddressDraft] = useState<ContactAddress>(() => emptyAddress());
  const [isBatchApplying, setIsBatchApplying] = useState(false);
  const [bulkField, setBulkField] = useState<BatchGridField>("legalName");
  const [bulkValue, setBulkValue] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") ?? "");
  const [contactTypeFilter, setContactTypeFilter] = useState<Customer["contactType"] | "all">(() => {
    const value = searchParams.get("type");
    return contactTypeOptions.includes(value as Customer["contactType"]) ? value as Customer["contactType"] : "all";
  });
  const [contactGroupFilter, setContactGroupFilter] = useState<string>(() => searchParams.get("group") ?? "all");
  const [statusFilter, setStatusFilter] = useState<Customer["status"] | "all">(() => {
    const value = searchParams.get("status");
    return statusOptions.includes(value as Customer["status"]) ? value as Customer["status"] : "all";
  });
  const [tagFilter, setTagFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    const matchesSearch = !normalizedSearchQuery
      || [
        item.name,
        item.email,
        item.phoneNumber,
        item.externalReference,
        item.billingAddress,
        item.tags.join(" "),
      ].some((value) => value.toLowerCase().includes(normalizedSearchQuery));

    if (!matchesSearch) {
      return false;
    }

    if (contactTypeFilter !== "all" && !parseContactTypes(item.contactType).includes(contactTypeFilter)) {
      return false;
    }

    if (contactGroupFilter !== "all" && !item.groups.some((group) => group.toLowerCase() === contactGroupFilter.toLowerCase())) {
      return false;
    }

    if (statusFilter !== "all" && item.status !== statusFilter) {
      return false;
    }

    if (tagFilter !== "all" && !item.tags.some((tag) => tag.toLowerCase() === tagFilter.toLowerCase())) {
      return false;
    }

    if (companyFilter !== "all" && item.entityType !== companyFilter) {
      return false;
    }

    return true;
  });

  const pagination = useClientPagination(filteredItems, [filteredItems.length, searchQuery, contactTypeFilter, contactGroupFilter, statusFilter, tagFilter, companyFilter]);
  const { topScrollRef, topInnerRef, contentScrollRef, bottomScrollRef, bottomInnerRef } = useSyncedHorizontalScroll([pagination.pagedItems.length, pagination.currentPage, pagination.pageSize]);
  const selectedCustomer = expandedId ? items.find((item) => item.id === expandedId) ?? null : null;
  const selectedCustomerTypes = selectedCustomer ? parseContactTypes(selectedCustomer.contactType) : [];
  const selectedCustomerAddresses = selectedCustomer
    ? (selectedCustomer.addresses.filter(hasContactAddressContent).length > 0
        ? selectedCustomer.addresses.filter(hasContactAddressContent)
        : selectedCustomer.billingAddress.trim()
          ? [{
              addressName: "Billing Address",
              streetAddress: selectedCustomer.billingAddress,
              addressLine2: "",
              addressLine3: "",
              city: "",
              postcode: "",
              country: "",
              state: "",
              isDefaultBilling: true,
              isDefaultShipping: false,
            }]
          : [])
    : [];
  const auth = getAuth();
  const canManageContacts = Boolean(auth && !auth.isPlatformOwner && ["Owner", "Admin"].includes(auth.role));
  const accountOptions = buildAccountOptions(masterData?.accounts);
  const receivableAccountOptions = accountOptions.filter((option) => option.keywords?.includes("Asset"));
  const payableAccountOptions = accountOptions.filter((option) => option.keywords?.includes("Liability"));
  const currencyLookupOptions = buildCurrencyOptions(masterData?.currencies, "");
  const paymentTermOptions = buildPaymentTermOptions(masterData?.paymentTerms, "");
  const priceLevelOptions = buildPriceLevelOptions(masterData?.priceLevels, "");
  const allTagOptions = mergeLookupOptions(items.flatMap((item) => item.tags ?? []), []);
  const allPhoneNumberOptions = mergeLookupOptions(items.flatMap((item) => item.phoneNumbers ?? []), []);
  const allEmailAddressOptions = mergeLookupOptions(items.flatMap((item) => item.emailAddresses ?? []), []);
  const allContactGroupOptions = mergeLookupOptions(contactGroups.map((group) => group.name), []);
  const companyFilterOptions = Array.from(new Set(items.map((item) => item.entityType).filter(Boolean))).sort();
  const selectedContactIdSet = new Set(selectedContactIds);
  const selectedBatchContacts = batchRows.filter((row) => selectedContactIdSet.has(row.id));
  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedContactIdSet.has(item.id));
  const unsavedChangeCount = Object.keys(dirtyCells).length;
  const batchGridTemplateColumns = `48px ${batchGridColumns.map((column) => column.width).join(" ")}`;
  const selectedBatchField = batchFieldOptions.find((field) => field.key === batchField) ?? batchFieldOptions[0];
  const availableBatchTargetGroups = mergeLookupOptions(selectedBatchContacts.flatMap((item) => item.groups ?? []), batchTargets.groups);
  const availableBatchTargetTags = mergeLookupOptions(selectedBatchContacts.flatMap((item) => item.tags ?? []), batchTargets.tags);
  const availableBatchTargetPhoneNumbers = mergeLookupOptions(selectedBatchContacts.flatMap((item) => item.phoneNumbers ?? []), batchTargets.phoneNumbers);
  const availableBatchTargetEmailAddresses = mergeLookupOptions(selectedBatchContacts.flatMap((item) => item.emailAddresses ?? []), batchTargets.emailAddresses);
  const availableBatchTargetContactPersons = buildContactPersonTargetOptions(selectedBatchContacts);
  const availableBatchTargetAddresses = buildAddressTargetOptions(selectedBatchContacts);

  async function load() {
    const [customerList, groupList, snapshot, access, packages] = await Promise.all([
      api.get<Customer[]>("/customers"),
      api.get<ContactGroup[]>("/contact-groups"),
      api.get<MasterDataSnapshot>("/master-data").catch(() => null),
      api.get<FeatureAccess>("/settings/feature-access").catch(() => null),
      api.get<PlatformPackage[]>("/public/packages").catch(() => []),
    ]);
    setItems(customerList);
    setContactGroups(groupList);
    setMasterData(snapshot);
    setContactGroupFilter((current) => current === "all" || groupList.some((group) => group.name === current) ? current : "all");
    const activePackage = packages.find((item) => item.code === access?.packageCode);
    setPackageLimit(activePackage?.maxCustomers ?? null);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const itemIds = new Set(items.map((item) => item.id));
    setSelectedContactIds((current) => current.filter((id) => itemIds.has(id)));
  }, [items]);

  useEffect(() => {
    const unsavedCount = Object.keys(dirtyCells).length;
    if (!batchOpen || unsavedCount === 0) {
      return undefined;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [batchOpen, dirtyCells]);

  useEffect(() => {
    if (selectedBatchField.kind === "multi") {
      setBatchListMode("Append");
    }
  }, [selectedBatchField.kind]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    const trimmedSearch = searchQuery.trim();

    if (trimmedSearch) {
      nextParams.set("search", trimmedSearch);
    } else {
      nextParams.delete("search");
    }

    nextParams.delete("contact");

    if (contactTypeFilter !== "all") {
      nextParams.set("type", contactTypeFilter);
    } else {
      nextParams.delete("type");
    }

    if (contactGroupFilter !== "all") {
      nextParams.set("group", contactGroupFilter);
    } else {
      nextParams.delete("group");
    }

    if (statusFilter !== "all") {
      nextParams.set("status", statusFilter);
    } else {
      nextParams.delete("status");
    }

    const nextQuery = nextParams.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [contactGroupFilter, contactTypeFilter, searchQuery, searchParams, setSearchParams, statusFilter]);

  useEffect(() => {
    const state = location.state;
    const flashMessage = state && typeof state === "object" && "flashMessage" in state ? state.flashMessage : null;

    if (typeof flashMessage !== "string" || !flashMessage) {
      return;
    }

    setMessage(flashMessage);
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (!selectedCustomer) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpandedId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCustomer]);

  useEffect(() => {
    if (!selectedCustomer) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [selectedCustomer]);

  const contactsWithEmail = items.filter((item) => item.email).length;
  const activeContacts = items.filter((item) => item.status === "Active").length;
  const packageLimitLabel = packageLimit === null ? "-" : packageLimit <= 0 ? "Unlimited" : String(packageLimit);
  function getPrimaryContactPerson(item: Customer) {
    const primary = item.contactPersons.find((person) => person.name.trim());
    if (!primary) {
      return "-";
    }

    const additionalCount = item.contactPersons.filter((person) => person.name.trim()).length - 1;
    return additionalCount > 0 ? `${primary.name} +${additionalCount}` : primary.name;
  }

  async function createContactGroup(name: string) {
    const created = await api.post<ContactGroup>("/contact-groups", { name });
    setContactGroups((current) => current.some((group) => group.id === created.id) ? current : [...current, created].sort((left, right) => left.name.localeCompare(right.name)));
    return created.name;
  }

  function updateBatchValues(patch: Partial<CustomerBatchUpdateValues>) {
    setBatchValues((current) => ({ ...current, ...patch }));
  }

  function updateBatchTargets(patch: Partial<CustomerBatchUpdateTargets>) {
    setBatchTargets((current) => ({ ...current, ...patch }));
  }

  function addBatchContactPerson() {
    const name = batchContactPersonDraft.name.trim();
    const role = batchContactPersonDraft.role.trim();
    const email = batchContactPersonDraft.email.trim();
    const phoneNumber = batchContactPersonDraft.phoneNumber.trim();
    if (!name && !role && !email && !phoneNumber) {
      setError("Enter at least one contact person detail before adding it.");
      return;
    }

    setError("");
    updateBatchValues({
      contactPersons: [...batchValues.contactPersons, { name, role, email, phoneNumber }],
    });
    setBatchContactPersonDraft(emptyContactPerson());
  }

  function removeBatchContactPerson(index: number) {
    updateBatchValues({
      contactPersons: batchValues.contactPersons.filter((_, itemIndex) => itemIndex !== index),
    });
  }

  function addBatchAddress() {
    const address = {
      addressName: batchAddressDraft.addressName.trim(),
      streetAddress: batchAddressDraft.streetAddress.trim(),
      addressLine2: batchAddressDraft.addressLine2.trim(),
      addressLine3: batchAddressDraft.addressLine3.trim(),
      city: batchAddressDraft.city.trim(),
      postcode: batchAddressDraft.postcode.trim(),
      country: batchAddressDraft.country.trim(),
      state: batchAddressDraft.state.trim(),
      isDefaultBilling: batchAddressDraft.isDefaultBilling,
      isDefaultShipping: batchAddressDraft.isDefaultShipping,
    };

    if (!hasContactAddressContent(address)) {
      setError("Enter at least one address detail before adding it.");
      return;
    }

    setError("");
    updateBatchValues({
      addresses: [...batchValues.addresses, address],
    });
    setBatchAddressDraft(emptyAddress());
  }

  function removeBatchAddress(index: number) {
    updateBatchValues({
      addresses: batchValues.addresses.filter((_, itemIndex) => itemIndex !== index),
    });
  }

  function buildBatchFieldFlags(field: BatchGridField) {
    const flags = emptyBatchFields();
    flags[field] = true;
    return flags;
  }

  function buildBatchModes(field: BatchGridField, mode: CustomerBatchUpdateListMode): CustomerBatchUpdateListModes {
    const modes = emptyBatchModes();
    switch (field) {
      case "contactPersons":
      case "phoneNumbers":
      case "emailAddresses":
      case "addresses":
      case "groups":
      case "tags":
        modes[field] = mode;
        break;
    }
    return modes;
  }

  function getBatchTargetCount(field: BatchGridField) {
    switch (field) {
      case "contactPersons": return batchTargets.contactPersons.length;
      case "phoneNumbers": return batchTargets.phoneNumbers.length;
      case "emailAddresses": return batchTargets.emailAddresses.length;
      case "addresses": return batchTargets.addresses.length;
      case "groups": return batchTargets.groups.length;
      case "tags": return batchTargets.tags.length;
      default: return 0;
    }
  }

  function resetBatchOperationState() {
    setBatchField("tags");
    setBatchListMode("Append");
    setBatchValues(emptyBatchValues());
    setBatchTargets(emptyBatchTargets());
    setBatchContactPersonDraft(emptyContactPerson());
    setBatchAddressDraft(emptyAddress());
  }

  async function applyBatchOperation() {
    setError("");

    if (selectedContactIds.length === 0) {
      setError("Select at least one contact.");
      return;
    }

    if (selectedBatchField.kind === "multi" && batchListMode !== "Append" && getBatchTargetCount(batchField) === 0) {
      setError(`Select at least one existing ${selectedBatchField.label.toLowerCase()} value to ${batchListMode.toLowerCase()}.`);
      return;
    }

    const request: CustomerBatchUpdateRequest = {
      customerIds: selectedContactIds,
      fields: buildBatchFieldFlags(batchField),
      values: batchValues,
      modes: buildBatchModes(batchField, batchListMode),
      targets: batchTargets,
    };

    setIsBatchApplying(true);

    try {
      const result = await api.post<CustomerBatchUpdateResult>("/customers/batch-update", request);
      const updatedById = new Map(result.customers.map((customer) => [customer.id, customer]));
      setItems((current) => current.map((item) => updatedById.get(item.id) ?? item));
      setBatchRows((current) => current.map((item) => updatedById.get(item.id) ?? item));
      setMessage(`${result.successCount} contacts updated.${result.failureCount > 0 ? ` ${result.failureCount} failed.` : ""}`);
      resetBatchOperationState();
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : "Unable to apply batch update.");
    } finally {
      setIsBatchApplying(false);
    }
  }

  function getCustomerActions(item: Customer) {
    const contactTypes = parseContactTypes(item.contactType);
    const canViewStatement = contactTypes.some((type) => type === "Customer" || type === "Supplier");
    const nextStatus = item.status === "Active" ? "Inactive" : "Active";
    const statusActionLabel = item.status === "Active" ? "Deactivate" : "Activate";

    return [
      { label: "View", onClick: () => setExpandedId((current) => current === item.id ? null : item.id) },
      { label: "Edit", onClick: () => navigate(`/customers/${item.id}/edit`) },
      ...(canViewStatement ? [{ label: "Statement of Account", onClick: () => navigate(`/customers/${item.id}/statement`) }] : []),
      {
        label: statusActionLabel,
        onClick: () => setConfirmState({
          title: `${statusActionLabel} contact`,
          description: `${statusActionLabel} ${item.legalName || item.name}?`,
          confirmLabel: statusActionLabel,
          action: async () => {
            const updated = await api.put<Customer>(`/customers/${item.id}`, {
              ...buildCustomerPayload(item),
              status: nextStatus,
            });
            setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
            setMessage(`${updated.legalName || updated.name} is now ${updated.status.toLowerCase()}.`);
            setConfirmState(null);
          },
        }),
      },
      {
        label: "Delete",
        tone: "danger" as const,
        onClick: () => setConfirmState({
          title: "Delete contact",
          description: `Delete ${item.legalName || item.name}? This action cannot be undone.`,
          confirmLabel: "Delete",
          action: async () => {
            await api.delete(`/customers/${item.id}`);
            setItems((current) => current.filter((entry) => entry.id !== item.id));
            setExpandedId((current) => current === item.id ? null : current);
            setMessage(`${item.legalName || item.name} was deleted.`);
            setConfirmState(null);
          },
        }),
      },
    ];
  }

  function toggleSelectedContact(id: string, selected: boolean) {
    setSelectedContactIds((current) => selected
      ? Array.from(new Set([...current, id]))
      : current.filter((item) => item !== id));
  }

  function toggleAllFiltered(selected: boolean) {
    setSelectedContactIds((current) => {
      const filteredIds = filteredItems.map((item) => item.id);
      if (selected) {
        return Array.from(new Set([...current, ...filteredIds]));
      }

      const filteredIdSet = new Set(filteredIds);
      return current.filter((id) => !filteredIdSet.has(id));
    });
  }

  function resetBatchState() {
    setError("");
  }

  function getGridCellValue(contact: Customer, field: BatchGridField) {
    switch (field) {
      case "legalName": return contact.legalName || contact.name;
      case "email": return contact.email;
      case "phoneNumber": return contact.phoneNumber;
      case "contactType": return contact.contactType;
      case "status": return contact.status;
      case "creditLimit": return contact.creditLimit == null ? "" : String(contact.creditLimit);
      case "receivableAccount": return contact.receivableAccount;
      case "payableAccount": return contact.payableAccount;
      case "currency": return contact.currency;
      case "paymentTerm": return contact.paymentTerm;
      case "priceLevel": return contact.priceLevel;
      case "tags": return contact.tags.join(", ");
      case "location": return contact.location;
      case "myInvoisControl": return contact.myInvoisControl;
      default: return "";
    }
  }

  function normalizeGridValue(field: BatchGridField, value: string) {
    if (field === "creditLimit") {
      return value.trim();
    }

    return value.trim();
  }

  function applyGridCellValue(contact: Customer, field: BatchGridField, value: string): Customer {
    const normalized = normalizeGridValue(field, value);
    switch (field) {
      case "legalName": return { ...contact, legalName: normalized, name: normalized };
      case "email": return { ...contact, email: normalized, emailAddresses: normalized ? [normalized] : [] };
      case "phoneNumber": return { ...contact, phoneNumber: normalized, phoneNumbers: normalized ? [normalized] : [] };
      case "contactType": return { ...contact, contactType: normalized };
      case "status": return { ...contact, status: normalized as Customer["status"] };
      case "creditLimit": return { ...contact, creditLimit: normalized ? Number(normalized) : null };
      case "receivableAccount": return { ...contact, receivableAccount: normalized };
      case "payableAccount": return { ...contact, payableAccount: normalized };
      case "currency": return { ...contact, currency: normalized };
      case "paymentTerm": return { ...contact, paymentTerm: normalized };
      case "priceLevel": return { ...contact, priceLevel: normalized };
      case "location": return { ...contact, location: normalized };
      case "myInvoisControl": return { ...contact, myInvoisControl: normalized };
      default: return contact;
    }
  }

  function setGridCell(contactId: string, field: BatchGridField, value: string) {
    setBatchRows((current) => current.map((contact) => contact.id === contactId ? applyGridCellValue(contact, field, value) : contact));
    const original = items.find((contact) => contact.id === contactId);
    const nextValue = normalizeGridValue(field, value);
    const originalValue = original ? normalizeGridValue(field, getGridCellValue(original, field)) : "";
    const cellKey = `${contactId}:${field}`;
    setDirtyCells((current) => {
      const next = { ...current };
      if (nextValue === originalValue) {
        delete next[cellKey];
      } else {
        next[cellKey] = true;
      }
      return next;
    });
  }


  function getGridSelectOptions(field: BatchGridField) {
    switch (field) {
      case "contactType": return contactTypeOptions.map((value) => ({ value, label: value }));
      case "status": return statusOptions.map((value) => ({ value, label: value }));
      case "receivableAccount": return receivableAccountOptions;
      case "payableAccount": return payableAccountOptions;
      case "currency": return currencyLookupOptions;
      case "paymentTerm": return paymentTermOptions;
      case "priceLevel": return priceLevelOptions;
      case "myInvoisControl": return myInvoisControlOptions.map((value) => ({ value, label: value }));
      default: return [];
    }
  }

  function focusGridCell(rowIndex: number, columnIndex: number) {
    const next = document.querySelector<HTMLElement>(`[data-grid-cell="${rowIndex}:${columnIndex}"]`);
    next?.focus();
  }

  function handleGridCellKeyDown(event: ReactKeyboardEvent<HTMLElement>, rowIndex: number, columnIndex: number) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      return;
    }

    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const nextRow = event.key === "ArrowUp" ? rowIndex - 1 : event.key === "ArrowDown" ? rowIndex + 1 : rowIndex;
    const nextColumn = event.key === "ArrowLeft" ? columnIndex - 1 : event.key === "ArrowRight" ? columnIndex + 1 : columnIndex;
    focusGridCell(Math.max(0, Math.min(batchRows.length - 1, nextRow)), Math.max(0, Math.min(batchGridColumns.length - 1, nextColumn)));
  }

  function openBatchUpdate() {
    resetBatchState();
    setBatchRows(filteredItems.map(cloneCustomerForBatchGrid));
    setDirtyCells({});
    resetBatchOperationState();
    setBatchView("grid");
    setBulkField("legalName");
    setBulkValue("");
    setBatchOpen(true);
  }

  function closeBatchUpdate() {
    if (isBatchSaving) {
      return;
    }

    if (Object.keys(dirtyCells).length > 0 && !window.confirm("Discard unsaved batch update changes?")) {
      return;
    }

    setBatchOpen(false);
    setBatchRows([]);
    setDirtyCells({});
    resetBatchOperationState();
    resetBatchState();
  }

  function applyBulkValueToSelectedRows() {
    if (selectedContactIds.length === 0) {
      setError("Select at least one contact.");
      return;
    }

    selectedContactIds.forEach((id) => {
      if (batchRows.some((row) => row.id === id)) {
        setGridCell(id, bulkField, bulkValue);
      }
    });
  }

  function buildGridFieldFlags(fields: BatchGridField[]) {
    const flags = emptyBatchFields();
    fields.forEach((field) => {
      flags[field] = true;
    });
    return flags;
  }

  function buildGridValues(contact: Customer) {
    return {
      legalName: contact.legalName || contact.name,
      email: contact.email,
      phoneNumber: contact.phoneNumber,
      contactPersons: contact.contactPersons.map(cloneContactPerson),
      phoneNumbers: [...contact.phoneNumbers],
      emailAddresses: [...contact.emailAddresses],
      addresses: contact.addresses.map(cloneContactAddress),
      contactType: contact.contactType,
      status: contact.status,
      receivableAccountId: resolveAccountIdByCode(masterData?.accounts, contact.receivableAccount),
      receivableAccount: contact.receivableAccount,
      creditLimit: contact.creditLimit ?? null,
      payableAccountId: resolveAccountIdByCode(masterData?.accounts, contact.payableAccount),
      payableAccount: contact.payableAccount,
      groups: contact.groups,
      priceLevel: contact.priceLevel,
      currency: contact.currency,
      paymentTerm: contact.paymentTerm,
      incomeAccountId: resolveAccountIdByCode(masterData?.accounts, contact.incomeAccount),
      incomeAccount: contact.incomeAccount,
      expenseAccountId: resolveAccountIdByCode(masterData?.accounts, contact.expenseAccount),
      expenseAccount: contact.expenseAccount,
      location: contact.location,
      tags: contact.tags,
      myInvoisControl: contact.myInvoisControl,
    };
  }

  async function saveGridChanges() {
    setError("");
    const dirtyEntries = Object.keys(dirtyCells);
    if (dirtyEntries.length === 0) {
      setMessage("No batch update changes to save.");
      return;
    }

    const fieldsByContact = new Map<string, BatchGridField[]>();
    dirtyEntries.forEach((entry) => {
      const [contactId, field] = entry.split(":") as [string, BatchGridField];
      fieldsByContact.set(contactId, [...(fieldsByContact.get(contactId) ?? []), field]);
    });

    setIsBatchSaving(true);
    try {
      const result = await api.post<CustomerBatchUpdateResult>("/customers/batch-grid-update", {
        records: Array.from(fieldsByContact.entries()).map(([contactId, fields]) => {
          const contact = batchRows.find((row) => row.id === contactId)!;
          return {
            customerId: contactId,
            fields: buildGridFieldFlags(fields),
            values: buildGridValues(contact),
          };
        }),
      });

      const updatedById = new Map(result.customers.map((customer) => [customer.id, customer]));
      setItems((current) => current.map((item) => updatedById.get(item.id) ?? item));
      setBatchRows((current) => current.map((item) => updatedById.get(item.id) ?? item));
      setDirtyCells({});
      setMessage(`${result.successCount} records updated. ${result.failureCount > 0 ? `${result.failureCount} failed.` : ""}`.trim());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save batch grid changes.");
    } finally {
      setIsBatchSaving(false);
    }
  }

  function renderBatchTargetEditor() {
    switch (batchField) {
      case "groups":
        return (
          <MultiValueLookup
            values={batchTargets.groups}
            options={availableBatchTargetGroups}
            placeholder="Select existing contact groups"
            searchPlaceholder="Search existing contact groups"
            addLabel="Select Contact Group"
            emptyText="No existing groups found on the selected contacts."
            ariaLabel="Target Contact Groups"
            onChange={(values) => updateBatchTargets({ groups: values })}
            allowCreate={false}
          />
        );
      case "tags":
        return (
          <MultiValueLookup
            values={batchTargets.tags}
            options={availableBatchTargetTags}
            placeholder="Select existing tags"
            searchPlaceholder="Search existing tags"
            addLabel="Select Tag"
            emptyText="No existing tags found on the selected contacts."
            ariaLabel="Target Tags"
            onChange={(values) => updateBatchTargets({ tags: values })}
            allowCreate={false}
          />
        );
      case "phoneNumbers":
        return (
          <MultiValueLookup
            values={batchTargets.phoneNumbers}
            options={availableBatchTargetPhoneNumbers}
            placeholder="Select existing phone numbers"
            searchPlaceholder="Search existing phone numbers"
            addLabel="Select Phone Number"
            emptyText="No existing phone numbers found on the selected contacts."
            ariaLabel="Target Phone Numbers"
            onChange={(values) => updateBatchTargets({ phoneNumbers: values })}
            allowCreate={false}
          />
        );
      case "emailAddresses":
        return (
          <MultiValueLookup
            values={batchTargets.emailAddresses}
            options={availableBatchTargetEmailAddresses}
            placeholder="Select existing email addresses"
            searchPlaceholder="Search existing email addresses"
            addLabel="Select Email Address"
            emptyText="No existing email addresses found on the selected contacts."
            ariaLabel="Target Email Addresses"
            onChange={(values) => updateBatchTargets({ emailAddresses: values })}
            allowCreate={false}
          />
        );
      case "contactPersons":
        return (
          <RecordTargetSelector
            options={availableBatchTargetContactPersons}
            selectedKeys={new Set(batchTargets.contactPersons.map(getContactPersonKey))}
            onToggle={(option, selected) => updateBatchTargets({
              contactPersons: selected
                ? [...batchTargets.contactPersons, option.value]
                : batchTargets.contactPersons.filter((person) => getContactPersonKey(person) !== option.key),
            })}
            emptyText="No contact persons found on the selected contacts."
          />
        );
      case "addresses":
        return (
          <RecordTargetSelector
            options={availableBatchTargetAddresses}
            selectedKeys={new Set(batchTargets.addresses.map(getAddressKey))}
            onToggle={(option, selected) => updateBatchTargets({
              addresses: selected
                ? [...batchTargets.addresses, option.value]
                : batchTargets.addresses.filter((address) => getAddressKey(address) !== option.key),
            })}
            emptyText="No addresses found on the selected contacts."
          />
        );
      default:
        return null;
    }
  }

  function renderBatchFieldEditor() {
    switch (batchField) {
      case "legalName":
        return <input className="text-input" value={batchValues.legalName} onChange={(event) => updateBatchValues({ legalName: event.target.value })} placeholder="Set legal name" />;
      case "email":
        return <input className="text-input" type="email" value={batchValues.email} onChange={(event) => updateBatchValues({ email: event.target.value })} placeholder="Set primary email" />;
      case "phoneNumber":
        return <input className="text-input" value={batchValues.phoneNumber} onChange={(event) => updateBatchValues({ phoneNumber: event.target.value })} placeholder="Set primary phone" />;
      case "contactType":
        return (
          <select value={batchValues.contactType} onChange={(event) => updateBatchValues({ contactType: event.target.value })}>
            {contactTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        );
      case "status":
        return (
          <select value={batchValues.status} onChange={(event) => updateBatchValues({ status: event.target.value as Customer["status"] })}>
            {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        );
      case "receivableAccount":
        return (
          <SearchableSelect
            value={batchValues.receivableAccount}
            onChange={(value) => updateBatchValues({ receivableAccount: value, receivableAccountId: resolveAccountIdByCode(masterData?.accounts, value) })}
            options={receivableAccountOptions}
            placeholder="Select receivable account"
            searchPlaceholder="Search asset accounts"
            ariaLabel="Receivable Account"
            clearable
          />
        );
      case "payableAccount":
        return (
          <SearchableSelect
            value={batchValues.payableAccount}
            onChange={(value) => updateBatchValues({ payableAccount: value, payableAccountId: resolveAccountIdByCode(masterData?.accounts, value) })}
            options={payableAccountOptions}
            placeholder="Select payable account"
            searchPlaceholder="Search liability accounts"
            ariaLabel="Payable Account"
            clearable
          />
        );
      case "currency":
        return (
          <SearchableSelect
            value={batchValues.currency}
            onChange={(value) => updateBatchValues({ currency: value || "MYR" })}
            options={currencyLookupOptions}
            placeholder="Select currency"
            searchPlaceholder="Search currencies"
            ariaLabel="Currency"
          />
        );
      case "paymentTerm":
        return (
          <SearchableSelect
            value={batchValues.paymentTerm}
            onChange={(value) => updateBatchValues({ paymentTerm: value })}
            options={paymentTermOptions}
            placeholder="Select payment term"
            searchPlaceholder="Search payment terms"
            ariaLabel="Payment Term"
            clearable
          />
        );
      case "priceLevel":
        return (
          <SearchableSelect
            value={batchValues.priceLevel}
            onChange={(value) => updateBatchValues({ priceLevel: value })}
            options={priceLevelOptions}
            placeholder="Select price level"
            searchPlaceholder="Search price levels"
            ariaLabel="Price Level"
            clearable
          />
        );
      case "creditLimit":
        return (
          <input
            className="text-input"
            type="number"
            inputMode="decimal"
            value={batchValues.creditLimit ?? ""}
            onChange={(event) => updateBatchValues({ creditLimit: event.target.value === "" ? null : Number(event.target.value) })}
            placeholder="Set credit limit"
          />
        );
      case "location":
        return <input className="text-input" value={batchValues.location} onChange={(event) => updateBatchValues({ location: event.target.value })} placeholder="Set location" />;
      case "myInvoisControl":
        return (
          <select value={batchValues.myInvoisControl} onChange={(event) => updateBatchValues({ myInvoisControl: event.target.value })}>
            {myInvoisControlOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        );
      case "groups":
        return (
          <MultiValueLookup
            values={batchValues.groups}
            options={allContactGroupOptions}
            placeholder="Select contact groups"
            searchPlaceholder="Search contact groups"
            addLabel="Add Contact Group"
            emptyText="No matching groups."
            ariaLabel="Contact Groups"
            onChange={(values) => updateBatchValues({ groups: values })}
            onCreate={createContactGroup}
          />
        );
      case "tags":
        return (
          <MultiValueLookup
            values={batchValues.tags}
            options={allTagOptions}
            placeholder="Select tags"
            searchPlaceholder="Search tags"
            addLabel="Add Tag"
            emptyText="No matching tags."
            ariaLabel="Tags"
            onChange={(values) => updateBatchValues({ tags: values })}
          />
        );
      case "phoneNumbers":
        return (
          <MultiValueLookup
            values={batchValues.phoneNumbers}
            options={allPhoneNumberOptions}
            placeholder="Select or enter phone numbers"
            searchPlaceholder="Search phone numbers"
            addLabel="Add Phone Number"
            emptyText="No matching phone numbers."
            ariaLabel="Phone Numbers"
            onChange={(values) => updateBatchValues({ phoneNumbers: values })}
          />
        );
      case "emailAddresses":
        return (
          <MultiValueLookup
            values={batchValues.emailAddresses}
            options={allEmailAddressOptions}
            placeholder="Select or enter email addresses"
            searchPlaceholder="Search email addresses"
            addLabel="Add Email Address"
            emptyText="No matching email addresses."
            ariaLabel="Email Addresses"
            onChange={(values) => updateBatchValues({ emailAddresses: values })}
          />
        );
      case "contactPersons":
        return (
          <div className="batch-field-row batch-field-row-wide">
            {batchValues.contactPersons.length > 0 ? (
              <div className="company-detail-address-list">
                {batchValues.contactPersons.map((person, index) => (
                  <article key={`${person.name}-${person.email}-${index}`} className="company-detail-address-card">
                    <div className="company-detail-address-card-header">
                      <div className="company-detail-address-card-heading">
                        <strong>{person.name || `Contact person ${index + 1}`}</strong>
                      </div>
                      <button type="button" className="button button-secondary button-small" onClick={() => removeBatchContactPerson(index)}>Remove</button>
                    </div>
                    <p className="company-detail-address-line">{[person.role, person.email, person.phoneNumber].filter(Boolean).join(" · ") || "No extra details"}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">No contact persons queued for this batch action.</p>
            )}
            <div className="batch-field-grid">
              <label className="form-label batch-field-row">
                Name
                <input className="text-input" value={batchContactPersonDraft.name} onChange={(event) => setBatchContactPersonDraft((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="form-label batch-field-row">
                Role
                <input className="text-input" value={batchContactPersonDraft.role} onChange={(event) => setBatchContactPersonDraft((current) => ({ ...current, role: event.target.value }))} />
              </label>
              <label className="form-label batch-field-row">
                Email
                <input className="text-input" value={batchContactPersonDraft.email} onChange={(event) => setBatchContactPersonDraft((current) => ({ ...current, email: event.target.value }))} />
              </label>
              <label className="form-label batch-field-row">
                Phone
                <input className="text-input" value={batchContactPersonDraft.phoneNumber} onChange={(event) => setBatchContactPersonDraft((current) => ({ ...current, phoneNumber: event.target.value }))} />
              </label>
            </div>
            <div className="batch-inline-add">
              <button type="button" className="button button-secondary" onClick={addBatchContactPerson}>Add Contact Person</button>
            </div>
          </div>
        );
      case "addresses":
        return (
          <div className="batch-field-row batch-field-row-wide">
            {batchValues.addresses.length > 0 ? (
              <div className="company-detail-address-list">
                {batchValues.addresses.map((address, index) => (
                  <article key={`${address.addressName}-${address.streetAddress}-${index}`} className="company-detail-address-card">
                    <div className="company-detail-address-card-header">
                      <div className="company-detail-address-card-heading">
                        <strong>{address.addressName || `Address ${index + 1}`}</strong>
                        {address.isDefaultBilling ? <span className="status-pill status-pill-active status-pill-compact">Billing Default</span> : null}
                        {address.isDefaultShipping ? <span className="status-pill status-pill-active status-pill-compact">Shipping Default</span> : null}
                      </div>
                      <button type="button" className="button button-secondary button-small" onClick={() => removeBatchAddress(index)}>Remove</button>
                    </div>
                    <p className="company-detail-address-line">{formatContactAddress(address) || "-"}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">No addresses queued for this batch action.</p>
            )}
            <div className="batch-field-grid">
              <label className="form-label batch-field-row">
                Address Name
                <input className="text-input" value={batchAddressDraft.addressName} onChange={(event) => setBatchAddressDraft((current) => ({ ...current, addressName: event.target.value }))} />
              </label>
              <label className="form-label batch-field-row">
                Street Address
                <input className="text-input" value={batchAddressDraft.streetAddress} onChange={(event) => setBatchAddressDraft((current) => ({ ...current, streetAddress: event.target.value }))} />
              </label>
              <label className="form-label batch-field-row">
                Address Line 2
                <input className="text-input" value={batchAddressDraft.addressLine2} onChange={(event) => setBatchAddressDraft((current) => ({ ...current, addressLine2: event.target.value }))} />
              </label>
              <label className="form-label batch-field-row">
                Address Line 3
                <input className="text-input" value={batchAddressDraft.addressLine3} onChange={(event) => setBatchAddressDraft((current) => ({ ...current, addressLine3: event.target.value }))} />
              </label>
              <label className="form-label batch-field-row">
                City
                <input className="text-input" value={batchAddressDraft.city} onChange={(event) => setBatchAddressDraft((current) => ({ ...current, city: event.target.value }))} />
              </label>
              <label className="form-label batch-field-row">
                State
                <input className="text-input" value={batchAddressDraft.state} onChange={(event) => setBatchAddressDraft((current) => ({ ...current, state: event.target.value }))} />
              </label>
              <label className="form-label batch-field-row">
                Postcode
                <input className="text-input" value={batchAddressDraft.postcode} onChange={(event) => setBatchAddressDraft((current) => ({ ...current, postcode: event.target.value }))} />
              </label>
              <label className="form-label batch-field-row">
                Country
                <input className="text-input" value={batchAddressDraft.country} onChange={(event) => setBatchAddressDraft((current) => ({ ...current, country: event.target.value }))} />
              </label>
              <label className="batch-field-toggle">
                <input type="checkbox" checked={batchAddressDraft.isDefaultBilling} onChange={(event) => setBatchAddressDraft((current) => ({ ...current, isDefaultBilling: event.target.checked }))} />
                <span>Billing default</span>
              </label>
              <label className="batch-field-toggle">
                <input type="checkbox" checked={batchAddressDraft.isDefaultShipping} onChange={(event) => setBatchAddressDraft((current) => ({ ...current, isDefaultShipping: event.target.checked }))} />
                <span>Shipping default</span>
              </label>
            </div>
            <div className="batch-inline-add">
              <button type="button" className="button button-secondary" onClick={addBatchAddress}>Add Address</button>
            </div>
          </div>
        );
    }

    return null;
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>Contacts</h2>
        </div>
      </header>
      {message ? <HelperText>{message}</HelperText> : null}
      <div className="catalog-toolbar card subtle-card customer-filter-bar">
        <input
          aria-label="Search contacts"
          className="text-input"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search contact name, email, phone, reference, or address"
        />
        <select aria-label="Filter contacts by type" value={contactTypeFilter} onChange={(event) => setContactTypeFilter(event.target.value as Customer["contactType"] | "all")}>
          <option value="all">All contact types</option>
          {contactTypeOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <select aria-label="Filter contacts by contact group" value={contactGroupFilter} onChange={(event) => setContactGroupFilter(event.target.value)}>
          <option value="all">All Groups</option>
          {contactGroups.map((group) => (
            <option key={group.id} value={group.name}>{group.name}</option>
          ))}
        </select>
        <select aria-label="Filter contacts by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as Customer["status"] | "all")}>
          <option value="all">All statuses</option>
          {statusOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <select aria-label="Filter contacts by tags" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
          <option value="all">All tags</option>
          {allTagOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <select aria-label="Filter contacts by company" value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
          <option value="all">All companies</option>
          {companyFilterOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
      <section className="card">
        <div className="card-section-header">
          <div className="section-header-cluster">
            <h3 className="section-title">Saved contacts</h3>
            <div className="page-meta-row page-meta-row-inline" aria-label="Contact summary">
              <div className="page-meta-chips">
                <span className="page-meta-chip">
                  <span className="page-meta-chip-label">Total</span>
                  <strong className="page-meta-chip-value">{items.length}{packageLimit !== null ? ` / ${packageLimitLabel}` : ""}</strong>
                </span>
                <span className="page-meta-chip">
                  <span className="page-meta-chip-label">Email</span>
                  <strong className="page-meta-chip-value">{contactsWithEmail}</strong>
                </span>
                <span className="page-meta-chip">
                  <span className="page-meta-chip-label">Active</span>
                  <strong className="page-meta-chip-value">{activeContacts}</strong>
                </span>
              </div>
            </div>
          </div>
          <div className="contact-page-actions">
            <button type="button" className="button button-secondary" onClick={() => navigate("/contact-groups")}>Contact Groups</button>
            <AddContactMenu
              onAddManually={() => navigate("/customers/new")}
              onImport={() => navigate("/customers/import")}
              onBatchUpdate={openBatchUpdate}
              showBatchUpdate={canManageContacts}
            />
          </div>
        </div>
        {searchQuery || contactTypeFilter !== "all" || contactGroupFilter !== "all" || statusFilter !== "all" ? (
          <HelperText>{`${filteredItems.length} matching contact${filteredItems.length === 1 ? "" : "s"} found.`}</HelperText>
        ) : null}
        {selectedContactIds.length > 0 ? (
          <HelperText>{`${selectedContactIds.length} contact${selectedContactIds.length === 1 ? "" : "s"} selected.`}</HelperText>
        ) : null}
        {error ? <HelperText tone="error">{error}</HelperText> : null}
        <div className="subscription-mobile-list">
          {pagination.pagedItems.map((item) => (
            <article key={item.id} className="subscription-mobile-card">
              <div className="subscription-mobile-card-header">
                <label className="contact-select-control" aria-label={`Select ${item.legalName || item.name}`}>
                  <input
                    type="checkbox"
                    checked={selectedContactIdSet.has(item.id)}
                    onChange={(event) => toggleSelectedContact(item.id, event.target.checked)}
                  />
                </label>
                <div className="subscription-mobile-identity">
                  <strong>{item.legalName || item.name}</strong>
                </div>
                <div className="subscription-mobile-actions">
                  <RowActionMenu items={getCustomerActions(item)} label="More" />
                </div>
              </div>
              <div className="subscription-mobile-summary">
                <div className="subscription-mobile-amount">{item.email || "-"}</div>
                <div className="subscription-mobile-cadence">{item.phoneNumber || "Phone not set"}</div>
              </div>
              <div className="subscription-mobile-card-topline">
                <span className={`status-pill ${getContactStatusClassName(item.status)}`}>{item.status}</span>
                <span className="badge">{parseContactTypes(item.contactType).join(", ") || item.contactType}</span>
              </div>
              <div className="subscription-mobile-meta">
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Type</span>
                  <span className="subscription-mobile-meta-value">{parseContactTypes(item.contactType).join(", ") || item.contactType}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Contact Group</span>
                  <span className="subscription-mobile-meta-value"><ContactGroupPills groups={item.groups} /></span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Status</span>
                  <span className="subscription-mobile-meta-value">{item.status}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Email</span>
                  <span className="subscription-mobile-meta-value">{item.email || "-"}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Phone</span>
                  <span className="subscription-mobile-meta-value">{item.phoneNumber || "Phone not set"}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Contact Person</span>
                  <span className="subscription-mobile-meta-value">{getPrimaryContactPerson(item)}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="subscription-table-shell">
          <div ref={topScrollRef} className="table-scroll table-scroll-top" aria-hidden="true">
            <div ref={topInnerRef} />
          </div>
          <div
            ref={(node) => {
              tableScrollRef.current = node;
              contentScrollRef.current = node;
            }}
            className="table-scroll table-scroll-bounded table-scroll-draggable"
          >
            <table className="catalog-table subscription-table customer-table">
            <thead>
              <tr>
                <th className="contact-select-column">
                  <input
                    type="checkbox"
                    aria-label="Select all filtered contacts"
                    checked={allFilteredSelected}
                    onChange={(event) => toggleAllFiltered(event.target.checked)}
                  />
                </th>
                <th className="sticky-cell sticky-cell-left contact-name-column">Name</th>
                <th className="contact-type-column">Contact Type</th>
                <th className="contact-group-column">Contact Group</th>
                <th className="contact-person-column">Contact Person</th>
                <th className="contact-phone-column">Phone</th>
                <th className="contact-email-column">Email</th>
                <th className="contact-status-column">Status</th>
                <th className="contact-actions-column" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <EmptyTableRow
                  colSpan={9}
                  title="No contacts yet"
                  description="Add customers, suppliers, and employees here so you can manage billing contacts and internal records from one place."
                  actions={(
                    <>
                      <button type="button" className="button button-primary" onClick={() => navigate("/customers/new")}>Add first contact</button>
                      <button type="button" className="button button-secondary" onClick={() => navigate("/help/quick-start")}>Quick Start</button>
                    </>
                  )}
                />
              ) : filteredItems.length === 0 ? (
                <EmptyTableRow
                  colSpan={9}
                  title="No matching contacts"
                  description="Try a different keyword or relax the filters to see more contact records."
                />
              ) : pagination.pagedItems.map((item) => (
                <tr key={item.id}>
                  <td className="contact-select-column">
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.legalName || item.name}`}
                      checked={selectedContactIdSet.has(item.id)}
                      onChange={(event) => toggleSelectedContact(item.id, event.target.checked)}
                    />
                  </td>
                  <td className="sticky-cell sticky-cell-left table-primary-cell">
                    <div className="table-primary-cell-stack">
                      <span>{item.legalName || item.name}</span>
                    </div>
                  </td>
                  <td className="contact-type-column"><span className="badge">{parseContactTypes(item.contactType).join(", ") || item.contactType}</span></td>
                  <td className="contact-group-column"><ContactGroupPills groups={item.groups} /></td>
                  <td className="contact-person-column">{getPrimaryContactPerson(item)}</td>
                  <td className="contact-phone-column">{item.phoneNumber || "Phone not set"}</td>
                  <td className="contact-email-column">{item.email || "-"}</td>
                  <td className="contact-status-column"><span className={`status-pill ${getContactStatusClassName(item.status)}`}>{item.status}</span></td>
                  <td className="actions-cell contact-actions-column"><RowActionMenu items={getCustomerActions(item)} /></td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          <div ref={bottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
            <div ref={bottomInnerRef} />
          </div>
        </div>
        <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
      </section>
      {selectedCustomer ? (
        <div className="modal-backdrop invoice-detail-backdrop" role="presentation" onClick={() => setExpandedId(null)}>
          <div className="card invoice-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="customer-detail-title" onClick={(event) => event.stopPropagation()}>
            <div className="invoice-detail-drawer-header">
              <div>
                <p className="eyebrow">Contact detail</p>
                <h3 id="customer-detail-title">{selectedCustomer.legalName || selectedCustomer.name}</h3>
                <p className="muted">{selectedCustomer.externalReference || selectedCustomer.entityType}</p>
              </div>
              <button type="button" className="button button-secondary button-compact" onClick={() => setExpandedId(null)}>Close</button>
            </div>
            <div className="invoice-detail-drawer-body">
              <div className="invoice-detail-panel">
                <div className="company-detail-sections">
                  <div className="invoice-detail-block">
                    <div className="invoice-detail-block-header"><p className="eyebrow">Basic Information</p></div>
                    <div className="company-detail-grid">
                      <DetailItem label="Entity Type" value={selectedCustomer.entityType} />
                      <DetailItem label="Legal Name" value={selectedCustomer.legalName || selectedCustomer.name} />
                      <DetailItem label="Other Name" value={selectedCustomer.otherName} />
                      <DetailItem label="Registration Number Type" value={selectedCustomer.registrationNumberType} />
                      <DetailItem label="Registration Number" value={selectedCustomer.registrationNumber} />
                      <DetailItem label="Old Registration Number" value={selectedCustomer.oldRegistrationNumber} />
                      <DetailItem label="TIN" value={selectedCustomer.tin} />
                      <DetailItem label="SST Registration Number" value={selectedCustomer.sstRegistrationNumber} />
                    </div>
                  </div>

                  <div className="invoice-detail-block">
                    <div className="invoice-detail-block-header"><p className="eyebrow">Contact Persons</p></div>
                    {selectedCustomer.contactPersons.filter((person) => person.name || person.role || person.email || person.phoneNumber).length > 0 ? (
                      <div className="company-detail-address-list">
                        {selectedCustomer.contactPersons
                          .filter((person) => person.name || person.role || person.email || person.phoneNumber)
                          .map((person, index) => {
                            const nameParts = splitContactPersonName(person);

                            return (
                              <article key={`${person.name}-${person.email}-${index}`} className="company-detail-address-card">
                                <div className="company-detail-address-card-header">
                                  <div className="company-detail-address-card-heading">
                                    <strong>{person.name || `Contact person ${index + 1}`}</strong>
                                  </div>
                                </div>
                                <div className="company-detail-grid">
                                  <DetailItem label="First Name" value={nameParts.firstName} />
                                  <DetailItem label="Last Name" value={nameParts.lastName} />
                                  <DetailItem label="Role" value={person.role} />
                                  <DetailItem label="Email" value={person.email} />
                                  <DetailItem label="Phone" value={person.phoneNumber} />
                                </div>
                              </article>
                            );
                          })}
                      </div>
                    ) : <p className="muted">No contact persons saved.</p>}
                  </div>

                  <div className="invoice-detail-block">
                    <div className="invoice-detail-block-header"><p className="eyebrow">Type & Grouping</p></div>
                    <div className="company-detail-grid">
                      <div className="company-detail-item company-detail-item-wide">
                        <span>Type Selection</span>
                        <div className="contact-detail-chip-row">
                          {(selectedCustomerTypes.length > 0 ? selectedCustomerTypes : [selectedCustomer.contactType]).filter(Boolean).map((type) => (
                            <span key={type} className="status-pill status-pill-active">{type}</span>
                          ))}
                        </div>
                      </div>
                      {selectedCustomerTypes.includes("Customer") ? <DetailItem label="Receivable Account" value={selectedCustomer.receivableAccount} /> : null}
                      {selectedCustomerTypes.includes("Customer") ? <DetailItem label="Credit Limit" value={selectedCustomer.creditLimit == null ? "" : String(selectedCustomer.creditLimit)} /> : null}
                      {selectedCustomerTypes.includes("Supplier") || selectedCustomerTypes.includes("Employee") ? <DetailItem label="Payable Account" value={selectedCustomer.payableAccount} /> : null}
                      <DetailListItem label="Contact Groups" values={selectedCustomer.groups} />
                      <DetailItem label="Price Level" value={selectedCustomer.priceLevel} />
                      <DetailItem label="Status" value={selectedCustomer.status} />
                    </div>
                  </div>

                  <div className="invoice-detail-block">
                    <div className="invoice-detail-block-header"><p className="eyebrow">Contact Information</p></div>
                    <div className="company-detail-grid">
                      <DetailListItem label="Contact Numbers" values={selectedCustomer.phoneNumbers.length > 0 ? selectedCustomer.phoneNumbers : [selectedCustomer.phoneNumber]} />
                      <DetailListItem label="Email Addresses" values={selectedCustomer.emailAddresses.length > 0 ? selectedCustomer.emailAddresses : [selectedCustomer.email]} />
                    </div>
                  </div>

                  <div className="invoice-detail-block">
                    <div className="invoice-detail-block-header"><p className="eyebrow">Contact Addresses</p></div>
                    {selectedCustomerAddresses.length > 0 ? (
                      <div className="company-detail-address-list">
                        {selectedCustomerAddresses.map((address, index) => (
                          <article key={`${address.addressName}-${index}`} className="company-detail-address-card">
                            <div className="company-detail-address-card-header">
                              <div className="company-detail-address-card-heading">
                                <strong>{address.addressName || "Untitled address"}</strong>
                                {address.isDefaultBilling ? <span className="status-pill status-pill-active status-pill-compact">Billing Default</span> : null}
                                {address.isDefaultShipping ? <span className="status-pill status-pill-active status-pill-compact">Shipping Default</span> : null}
                              </div>
                            </div>
                            <p className="company-detail-address-line">{formatContactAddress(address) || "-"}</p>
                          </article>
                        ))}
                      </div>
                    ) : <p className="muted">No addresses saved.</p>}
                  </div>

                  <div className="invoice-detail-block">
                    <div className="invoice-detail-block-header"><p className="eyebrow">Default Settings</p></div>
                    <div className="company-detail-grid">
                      <DetailItem label="Currency" value={selectedCustomer.currency} />
                      <DetailItem label="Payment Term" value={selectedCustomer.paymentTerm} />
                      <DetailItem label="Income Account" value={selectedCustomer.incomeAccount} />
                      <DetailItem label="Expense Account" value={selectedCustomer.expenseAccount} />
                      <DetailItem label="Location" value={selectedCustomer.location} />
                      <DetailListItem label="Tags" values={selectedCustomer.tags} />
                      <DetailItem label="MyInvois Control" value={selectedCustomer.myInvoisControl} />
                      <DetailItem label="External Reference" value={selectedCustomer.externalReference} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {batchOpen ? (
        <div className="modal-backdrop batch-update-backdrop" role="presentation" onClick={closeBatchUpdate}>
          <div className="card batch-grid-modal" role="dialog" aria-modal="true" aria-labelledby="batch-update-title" onClick={(event) => event.stopPropagation()}>
            <div className="batch-update-header">
              <div>
                <p className="eyebrow">Batch Update</p>
                <h3 id="batch-update-title">Contacts</h3>
                <p className="muted">{batchRows.length} rows loaded · {selectedContactIds.length} selected · {unsavedChangeCount} unsaved grid change{unsavedChangeCount === 1 ? "" : "s"}</p>
              </div>
              <div className="batch-grid-header-actions">
                <button
                  type="button"
                  className={`button button-secondary button-compact ${batchView === "operations" ? "page-meta-chip-button-active" : ""}`}
                  onClick={() => setBatchView("operations")}
                  title="Bulk Actions"
                  aria-label="Bulk Actions"
                >
                  Bulk Actions
                </button>
                <button
                  type="button"
                  className={`button button-secondary button-compact ${batchView === "grid" ? "page-meta-chip-button-active" : ""}`}
                  onClick={() => setBatchView("grid")}
                  title="Columns"
                  aria-label="Columns"
                >
                  Columns
                </button>
                <button type="button" className="button button-secondary button-compact" onClick={closeBatchUpdate}>Close</button>
                {batchView === "grid" ? (
                  <button type="button" className="button button-primary button-compact" onClick={saveGridChanges} disabled={isBatchSaving || unsavedChangeCount === 0}>{isBatchSaving ? "Saving..." : "Save"}</button>
                ) : (
                  <button type="button" className="button button-primary button-compact" onClick={applyBatchOperation} disabled={isBatchApplying || selectedContactIds.length === 0}>{isBatchApplying ? "Applying..." : "Apply"}</button>
                )}
              </div>
            </div>
            <div className="batch-grid-toolbar">
              <div className="batch-grid-toolbar-group">
                <button type="button" className="button button-secondary button-small" onClick={() => setSelectedContactIds(batchRows.map((row) => row.id))}>Select All</button>
                <button type="button" className="button button-secondary button-small" onClick={() => setSelectedContactIds([])} disabled={selectedContactIds.length === 0}>Clear Selection</button>
              </div>
              {batchView === "grid" ? (
                <div className="batch-grid-toolbar-group batch-grid-bulk-tools">
                  <span className="muted">Update selected rows</span>
                  <select value={bulkField} onChange={(event) => {
                    setBulkField(event.target.value as BatchGridField);
                    setBulkValue("");
                  }}>
                    {batchGridColumns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
                  </select>
                  {getGridSelectOptions(bulkField).length > 0 ? (
                    <select value={bulkValue} onChange={(event) => setBulkValue(event.target.value)}>
                      <option value="">Select value</option>
                      {getGridSelectOptions(bulkField).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  ) : (
                    <input className="text-input" value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} placeholder="Value" />
                  )}
                  <button type="button" className="button button-secondary button-small" onClick={applyBulkValueToSelectedRows}>Apply</button>
                </div>
              ) : (
                <div className="batch-grid-toolbar-group batch-grid-bulk-tools">
                  <span className="muted">Append, replace, or remove values across every selected contact.</span>
                </div>
              )}
            </div>
            {batchView === "operations" ? (
              <div className="batch-update-body">
                <section className="batch-update-section">
                  <div className="batch-update-section-header">
                    <div>
                      <h4>Selected Contacts</h4>
                      <p className="muted">{selectedContactIds.length} selected from {batchRows.length} loaded rows.</p>
                    </div>
                  </div>
                  <div className="batch-contact-list">
                    {batchRows.map((row) => (
                      <label key={row.id} className="batch-contact-row">
                        <input type="checkbox" checked={selectedContactIdSet.has(row.id)} onChange={(event) => toggleSelectedContact(row.id, event.target.checked)} />
                        <span>{row.legalName || row.name}</span>
                        <small>{row.status}</small>
                      </label>
                    ))}
                    {batchRows.length === 0 ? <p className="muted">No contacts match the current filters.</p> : null}
                  </div>
                </section>
                <section className="batch-update-section">
                  <div className="batch-update-section-header">
                    <div>
                      <h4>Bulk Action</h4>
                      <p className="muted">Choose one field, set the value, then apply it to every selected contact.</p>
                    </div>
                  </div>
                  <div className="batch-field-grid">
                    <label className="form-label batch-field-row batch-field-row-wide">
                      Field
                      <select value={batchField} onChange={(event) => setBatchField(event.target.value as BatchGridField)}>
                        {batchFieldOptions.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
                      </select>
                    </label>
                    {selectedBatchField.kind === "multi" ? (
                      <label className="form-label batch-field-row">
                        Operation
                        <select value={batchListMode} onChange={(event) => setBatchListMode(event.target.value as CustomerBatchUpdateListMode)}>
                          {batchListModeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </label>
                    ) : null}
                    {selectedBatchField.kind === "multi" && batchListMode !== "Append" ? (
                      <div className="batch-field-row batch-field-row-wide">
                        <label className="form-label batch-field-row">
                          Target Value{batchListMode === "Remove" ? "(s)" : "s"}
                          {renderBatchTargetEditor()}
                        </label>
                        <p className="muted">Values are aggregated from the currently selected contacts only.</p>
                      </div>
                    ) : null}
                    {!(selectedBatchField.kind === "multi" && batchListMode === "Remove") ? (
                      <div className="batch-field-row batch-field-row-wide">
                        {selectedBatchField.kind === "multi" ? (
                          <p className="muted">
                            {batchListMode === "Append"
                              ? "New values will be added without touching unrelated records."
                              : "New values will replace only the targeted existing records."}
                          </p>
                        ) : null}
                        {renderBatchFieldEditor()}
                      </div>
                    ) : (
                      <div className="batch-field-row batch-field-row-wide">
                        <p className="muted">Remove will delete only the targeted existing records.</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : (
              <div className="batch-grid-layout">
                <div className="batch-grid-shell" role="grid" aria-label="Editable contact batch update grid">
                  <div className="batch-grid-row batch-grid-header-row" role="row" style={{ gridTemplateColumns: batchGridTemplateColumns }}>
                    <div className="batch-grid-cell batch-grid-select-cell" role="columnheader">
                      <input
                        type="checkbox"
                        aria-label="Select all contacts in grid"
                        checked={batchRows.length > 0 && batchRows.every((row) => selectedContactIdSet.has(row.id))}
                        onChange={(event) => setSelectedContactIds(event.target.checked ? batchRows.map((row) => row.id) : [])}
                      />
                    </div>
                    {batchGridColumns.map((column) => (
                      <div key={column.key} className="batch-grid-cell batch-grid-header-cell" role="columnheader">{column.label}</div>
                    ))}
                  </div>
                  <div className="batch-grid-body">
                    {batchRows.map((row, rowIndex) => (
                      <div key={row.id} className="batch-grid-row" role="row" style={{ gridTemplateColumns: batchGridTemplateColumns }}>
                        <div className="batch-grid-cell batch-grid-select-cell" role="gridcell">
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.legalName || row.name}`}
                            checked={selectedContactIdSet.has(row.id)}
                            onChange={(event) => toggleSelectedContact(row.id, event.target.checked)}
                          />
                        </div>
                        {batchGridColumns.map((column, columnIndex) => {
                          const cellKey = `${row.id}:${column.key}`;
                          const value = getGridCellValue(row, column.key);
                          const selectOptions = getGridSelectOptions(column.key);
                          return (
                            <div key={column.key} className={`batch-grid-cell ${dirtyCells[cellKey] ? "batch-grid-cell-dirty" : ""}`} role="gridcell">
                              {column.editor === "select" ? (
                                <select
                                  data-grid-cell={`${rowIndex}:${columnIndex}`}
                                  value={value}
                                  onKeyDown={(event) => handleGridCellKeyDown(event, rowIndex, columnIndex)}
                                  onChange={(event) => setGridCell(row.id, column.key, event.target.value)}
                                >
                                  <option value="">-</option>
                                  {selectOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </select>
                              ) : (
                                <input
                                  data-grid-cell={`${rowIndex}:${columnIndex}`}
                                  className="batch-grid-input"
                                  type={column.editor === "number" ? "number" : "text"}
                                  value={value}
                                  onKeyDown={(event) => handleGridCellKeyDown(event, rowIndex, columnIndex)}
                                  onPaste={(event) => setGridCell(row.id, column.key, event.clipboardData.getData("text"))}
                                  onChange={(event) => setGridCell(row.id, column.key, event.target.value)}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {batchRows.length === 0 ? <p className="muted batch-grid-empty">No contacts match the current filters.</p> : null}
                  </div>
                </div>
              </div>
            )}
            {error ? <HelperText tone="error">{error}</HelperText> : null}
          </div>
        </div>
      ) : null}
      <ConfirmModal
        open={confirmState !== null}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        confirmLabel={confirmState?.confirmLabel ?? "Confirm"}
        onConfirm={async () => {
          await confirmState?.action();
        }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
