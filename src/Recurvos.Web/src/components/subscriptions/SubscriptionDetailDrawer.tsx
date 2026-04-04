import { formatCurrency } from "../../lib/format";
import type { Subscription } from "../../types";

type Props = {
  selectedSubscription: Subscription;
  onClose: () => void;
  onEditPricing: () => void;
  onMigrateItem: (subscriptionItemId: string, currentPlanId: string, currentPlanName: string) => void;
};

export function SubscriptionDetailDrawer({ selectedSubscription, onClose, onEditPricing, onMigrateItem }: Props) {
  return (
    <div className="modal-backdrop subscription-detail-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card subscription-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscription-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="subscription-detail-header">
          <div>
            <p className="eyebrow">Subscription detail</p>
            <h3 id="subscription-detail-title">{selectedSubscription.customerName}</h3>
            <p className="muted">{selectedSubscription.companyName}</p>
          </div>
          <button type="button" className="button button-secondary button-compact" onClick={onClose}>Close</button>
        </div>
        <div className="subscription-detail-body">
          <div className="subscription-detail-summary">
            <div className="subscription-detail-stat">
              <p className="eyebrow">Status</p>
              <strong>{selectedSubscription.status}</strong>
            </div>
            <div className="subscription-detail-stat">
              <p className="eyebrow">Next Invoice</p>
              <strong>{selectedSubscription.nextBillingUtc ? new Date(selectedSubscription.nextBillingUtc).toLocaleDateString() : "-"}</strong>
            </div>
            <div className="subscription-detail-stat">
              <p className="eyebrow">Effective Billing</p>
              <strong>{formatCurrency(selectedSubscription.effectiveBillingAmount, selectedSubscription.currency)}</strong>
            </div>
            <div className="subscription-detail-stat">
              <p className="eyebrow">Trial</p>
              <strong>{selectedSubscription.isTrialing && selectedSubscription.trialEndUtc ? `Ends ${new Date(selectedSubscription.trialEndUtc).toLocaleDateString()}` : "No active trial"}</strong>
            </div>
          </div>

          <div className="subscription-detail-section">
            <div className="subscription-detail-section-header">
              <div>
                <p className="eyebrow">Overview</p>
                <h4>Billing and lifecycle</h4>
              </div>
            </div>
            <div className="subscription-details-grid subscription-details-grid-drawer">
              <div className="subscription-detail-panel">
                <p className="eyebrow">Billing Snapshot</p>
                <p>{selectedSubscription.hasMixedBillingIntervals ? "This subscription contains multiple billing cadences. See item schedules below." : `${formatCurrency(selectedSubscription.unitPrice, selectedSubscription.currency)} | ${selectedSubscription.intervalUnit === "None" ? "One-time" : `${selectedSubscription.intervalCount} ${selectedSubscription.intervalUnit}`} | Quantity ${selectedSubscription.quantity}`}</p>
              </div>
              <div className="subscription-detail-panel">
                <p className="eyebrow">Current Period</p>
                <p>{selectedSubscription.currentPeriodStartUtc && selectedSubscription.currentPeriodEndUtc ? `${new Date(selectedSubscription.currentPeriodStartUtc).toLocaleDateString()} to ${new Date(selectedSubscription.currentPeriodEndUtc).toLocaleDateString()}` : "-"}</p>
              </div>
              <div className="subscription-detail-panel">
                <p className="eyebrow">Auto Renew</p>
                <p>{selectedSubscription.autoRenew ? "Yes" : "No"}</p>
              </div>
              <div className="subscription-detail-panel">
                <p className="eyebrow">Cancel At Period End</p>
                <p>{selectedSubscription.cancelAtPeriodEnd ? "Yes" : "No"}</p>
              </div>
              <div className="subscription-detail-panel">
                <p className="eyebrow">Effective Cancel Date</p>
                <p>{selectedSubscription.cancelAtPeriodEnd && selectedSubscription.currentPeriodEndUtc ? new Date(selectedSubscription.currentPeriodEndUtc).toLocaleDateString() : "-"}</p>
              </div>
              <div className="subscription-detail-panel">
                <p className="eyebrow">Ended At</p>
                <p>{selectedSubscription.endedAtUtc ? new Date(selectedSubscription.endedAtUtc).toLocaleString() : "-"}</p>
              </div>
            </div>
          </div>

          <div className="subscription-detail-section">
            <div className="subscription-detail-section-header">
              <div>
                <p className="eyebrow">Timeline</p>
                <h4>Audit trail</h4>
              </div>
            </div>
            <div className="subscription-details-grid subscription-details-grid-drawer">
              <div className="subscription-detail-panel">
                <p className="eyebrow">Canceled At</p>
                <p>{selectedSubscription.canceledAtUtc ? new Date(selectedSubscription.canceledAtUtc).toLocaleString() : "-"}</p>
              </div>
              <div className="subscription-detail-panel">
                <p className="eyebrow">Cancellation Reason</p>
                <p>{selectedSubscription.cancellationReason || "No reason recorded."}</p>
              </div>
              <div className="subscription-detail-panel">
                <p className="eyebrow">Created</p>
                <p>{new Date(selectedSubscription.createdAtUtc).toLocaleString()}</p>
              </div>
              <div className="subscription-detail-panel">
                <p className="eyebrow">Updated</p>
                <p>{selectedSubscription.updatedAtUtc ? new Date(selectedSubscription.updatedAtUtc).toLocaleString() : "-"}</p>
              </div>
              <div className="subscription-detail-panel">
                <p className="eyebrow">Notes</p>
                <p>{selectedSubscription.notes || "No internal notes."}</p>
              </div>
            </div>
          </div>

          <div className="subscription-detail-section">
            <div className="subscription-detail-section-header">
              <div>
                <p className="eyebrow">Items</p>
                <h4>Billing schedules</h4>
              </div>
            </div>
            <div className="stack dashboard-list">
              {selectedSubscription.items.map((child) => (
                <div key={child.id} className="dashboard-list-item subscription-detail-list-item">
                  <div>
                    <strong>{child.productPlanName}</strong>
                    <p className="muted">{`${formatCurrency(child.unitAmount, child.currency)} x ${child.quantity} | ${child.intervalUnit === "None" ? "One-time" : `${child.intervalCount} ${child.intervalUnit}`} | Auto renew: ${child.autoRenew ? "Yes" : "No"}`}</p>
                  </div>
                  <div className="dashboard-list-metric">
                    <strong>{child.nextBillingUtc ? new Date(child.nextBillingUtc).toLocaleDateString() : "-"}</strong>
                    <p className="muted">{child.currentPeriodStartUtc && child.currentPeriodEndUtc ? `${new Date(child.currentPeriodStartUtc).toLocaleDateString()} to ${new Date(child.currentPeriodEndUtc).toLocaleDateString()}` : "No active period"}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="subscription-detail-section">
            <div className="subscription-detail-section-header">
              <div>
                <p className="eyebrow">Actions</p>
                <h4>Future billing changes</h4>
              </div>
            </div>
            <div className="subscription-detail-action-grid">
              <div className="subscription-detail-action-card">
                <div>
                  <p className="eyebrow">Future Billing Price</p>
                  <p>{selectedSubscription.items.length === 1 ? "Affects next renewal only. Historical invoices stay unchanged." : "Single-item subscriptions only for now."}</p>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={selectedSubscription.items.length !== 1}
                  onClick={onEditPricing}
                >
                  Edit pricing
                </button>
              </div>
              <div className="subscription-detail-action-card">
                <div>
                  <p className="eyebrow">Plan Migration</p>
                  <p>Move one item to a different active plan. Historical invoices stay unchanged.</p>
                </div>
              </div>
            </div>
            <div className="stack dashboard-list subscription-detail-migration-list">
              {selectedSubscription.items.map((child) => (
                <div key={`${child.id}-migration`} className="dashboard-list-item subscription-detail-list-item">
                  <div>
                    <strong>{child.productPlanName}</strong>
                    <p className="muted">{`${formatCurrency(child.unitAmount, child.currency)} x ${child.quantity} | ${child.intervalUnit === "None" ? "One-time" : `${child.intervalCount} ${child.intervalUnit}`} | Next invoice: ${child.nextBillingUtc ? new Date(child.nextBillingUtc).toLocaleDateString() : "-"}`}</p>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => onMigrateItem(child.id, child.productPlanId, child.productPlanName)}
                  >
                    Migrate item
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
