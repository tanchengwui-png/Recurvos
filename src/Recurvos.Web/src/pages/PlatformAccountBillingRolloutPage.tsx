import { useEffect, useState } from "react";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import type { SubscriberAccountBillingRolloutAccount } from "../types";

type RolloutSummary = { accountReadCanaryGloballyEnabled: boolean; totalAccounts: number; accountBillingEnabled: number; reconciled: number; unresolvedWarnings: number };

export function PlatformAccountBillingRolloutPage() {
  const [summary, setSummary] = useState<RolloutSummary | null>(null);
  const [accounts, setAccounts] = useState<SubscriberAccountBillingRolloutAccount[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function load() { try { const [rollout, accountList] = await Promise.all([api.get<RolloutSummary>("/platform/subscriber-account-billing/rollout"), api.get<SubscriberAccountBillingRolloutAccount[]>("/platform/subscriber-account-billing/accounts")]); setSummary(rollout); setAccounts(accountList); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load the billing rollout."); } }
  useEffect(() => { void load(); }, []);
  async function disableCanary(accountId: string) { setSavingId(accountId); try { await api.put(`/platform/subscriber-account-billing/accounts/${accountId}/canary`, { enabled: false }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to update this account."); } finally { setSavingId(null); } }
  return <div className="page"><header className="page-header"><div className="page-header-copy"><h2>Account Billing Rollout</h2><p className="muted">Controlled per-account canary. Legacy Company billing remains the fallback.</p></div></header>{error ? <HelperText tone="error">{error}</HelperText> : null}{summary ? <section className="card subtle-card"><div className="page-meta-chips"><span className="page-meta-chip">Global canary <strong>{summary.accountReadCanaryGloballyEnabled ? "Enabled" : "Disabled"}</strong></span><span className="page-meta-chip">Healthy <strong>{summary.reconciled}/{summary.totalAccounts}</strong></span><span className="page-meta-chip">Warnings <strong>{summary.unresolvedWarnings}</strong></span><span className="page-meta-chip">Canaries <strong>{summary.accountBillingEnabled}</strong></span></div></section> : null}<section className="card"><div className="table-scroll table-scroll-bounded"><table className="catalog-table"><thead><tr><th>Companies</th><th>Health</th><th>Last validated</th><th>Canary</th><th>Action</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.accountId}><td>{account.companies.map((company) => company.companyName).join(", ") || "No subscriber company"}</td><td>{account.health}{account.warning ? ` — ${account.warning}` : ""}</td><td>{account.lastValidatedAtUtc ? new Date(account.lastValidatedAtUtc).toLocaleString() : "Not validated"}</td><td>{account.accountBillingEnabled ? "Enabled" : "Disabled"}</td><td>{account.accountBillingEnabled ? <button type="button" className="button button-secondary" disabled={savingId === account.accountId} onClick={() => void disableCanary(account.accountId)}>{savingId === account.accountId ? "Saving..." : "Disable"}</button> : <span className="muted">Health-gated by API</span>}</td></tr>)}</tbody></table></div></section></div>;
}
