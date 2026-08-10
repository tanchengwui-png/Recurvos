import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import type { SearchableSelectOption } from "../../lib/localeOptions";
import type { Account } from "../../types";
import { SearchableSelect } from "./SearchableSelect";

export type AccountSelectKind = "inventory" | "income" | "expense";

type AccountSelectProps = {
  value: string;
  onChange: (value: string) => void;
  kind: AccountSelectKind;
  ariaLabel: string;
  placeholder: string;
  searchPlaceholder: string;
  clearable?: boolean;
};

const accountTypeByKind: Record<AccountSelectKind, Account["type"]> = {
  inventory: "Asset",
  income: "Revenue",
  expense: "Expense",
};

const emptyTextByKind: Record<AccountSelectKind, string> = {
  inventory: "No inventory accounts found.",
  income: "No income accounts found.",
  expense: "No expense accounts found.",
};

function accountOptions(accounts: Account[], kind: AccountSelectKind): SearchableSelectOption[] {
  const requiredType = accountTypeByKind[kind];

  return accounts
    .filter((account) => account.isActive && account.type === requiredType)
    .map((account) => ({
      value: account.code,
      label: `${account.code} - ${account.name}`,
      keywords: [account.code, account.name, account.type, account.currencyCode, account.description ?? ""],
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function AccountSelect({ value, onChange, kind, ariaLabel, placeholder, searchPlaceholder, clearable = false }: AccountSelectProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        isActive: "true",
        type: accountTypeByKind[kind],
      });
      setAccounts(await api.get<Account[]>(`/master-data/accounts?${query}`));
    } catch (loadError) {
      setAccounts([]);
      setError(loadError instanceof Error ? loadError.message : "Unable to load accounts.");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  useEffect(() => {
    const refreshAccounts = () => void loadAccounts();
    window.addEventListener("recurvos:accounts-changed", refreshAccounts);
    return () => window.removeEventListener("recurvos:accounts-changed", refreshAccounts);
  }, [loadAccounts]);

  const options = useMemo(() => accountOptions(accounts, kind), [accounts, kind]);

  return <SearchableSelect value={value} onChange={onChange} options={options} placeholder={placeholder} searchPlaceholder={searchPlaceholder} emptyText={emptyTextByKind[kind]} ariaLabel={ariaLabel} clearable={clearable} loading={loading} error={error} />;
}
