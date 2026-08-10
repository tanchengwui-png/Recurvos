import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { fetchProduct } from "../hooks/useProducts";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { ProductDetails } from "../types";

function DetailField({ label, value }: { label: string; value?: ReactNode }) {
  return <div className="product-detail-field"><span>{label}</span><strong>{value || "—"}</strong></div>;
}

function DetailSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="card product-detail-section"><div className="product-detail-section-heading"><div><h3>{title}</h3>{description ? <p>{description}</p> : null}</div></div>{children}</section>;
}

function formatQuantity(value?: number | null) {
  return value == null ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
}

export function ProductDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<ProductDetails | null>(null);
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    if (!id) return;
    void fetchProduct(id).then(setProduct);
  }, [id]);

  useEffect(() => {
    if (!id || !product?.hasImage) {
      setImageUrl("");
      return;
    }

    let active = true;
    let objectUrl = "";
    void api.download(`/products/${id}/image`)
      .then((file) => {
        objectUrl = URL.createObjectURL(file.blob);
        if (active) setImageUrl(objectUrl);
      })
      .catch(() => { if (active) setImageUrl(""); });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, product?.hasImage]);

  if (!product) {
    return <div className="page"><section className="card"><p className="muted">Loading product details...</p></section></div>;
  }

  const customPriceGroups: Array<{ kind: "Sales" | "Purchase"; prices: ProductDetails["customSalesPrices"] }> = [
    { kind: "Sales", prices: product.customSalesPrices },
    { kind: "Purchase", prices: product.customPurchasePrices },
  ];

  return (
    <div className="page product-details-page">
      <header className="page-header">
        <div className="page-header-copy product-details-title">
          <p className="eyebrow">Products / {product.code}</p>
          <div className="product-details-title-row">
            <div className="product-details-image">{imageUrl ? <img src={imageUrl} alt={`${product.name} product`} /> : <span aria-hidden="true">▧</span>}</div>
            <div><h2>{product.name}</h2><p>{product.description || "No product description added."}</p></div>
          </div>
        </div>
        <div className="product-details-actions"><Button variant="secondary" onClick={() => navigate("/products")}>Back to products</Button><Button onClick={() => navigate(`/products/${product.id}/edit`)}>Edit product</Button></div>
      </header>

      <div className="product-details-status-row">
        <span className={`status-pill ${product.isActive ? "status-pill-active" : "status-pill-inactive"}`}>{product.isActive ? "Active" : "Inactive"}</span>
        {product.trackInventory ? <span className="status-pill">Inventory tracked</span> : <span className="status-pill status-pill-inactive">Inventory not tracked</span>}
        {product.isSelling ? <span className="status-pill">For sale</span> : null}
        {product.isBuying ? <span className="status-pill">For purchase</span> : null}
      </div>

      <div className="product-details-layout">
        <DetailSection title="Product information" description="Identity, classification and catalogue details.">
          <div className="product-detail-grid">
            <DetailField label="Company" value={product.companyName} />
            <DetailField label="Product code" value={product.code} />
            <DetailField label="Barcode" value={product.barcode} />
            <DetailField label="Classification code" value={product.category} />
            <DetailField label="Product groups" value={product.productGroups.length ? product.productGroups.join(", ") : undefined} />
            <DetailField label="Bin location" value={product.binLocation} />
            <DetailField label="Created" value={new Date(product.createdAtUtc).toLocaleDateString()} />
            <DetailField label="Last updated" value={product.updatedAtUtc ? new Date(product.updatedAtUtc).toLocaleDateString() : undefined} />
          </div>
        </DetailSection>

        <DetailSection title="Inventory" description="Stock-tracking, opening balances and inventory account.">
          {product.trackInventory ? <div className="product-detail-grid">
            <DetailField label="Inventory account" value={product.inventoryAccount} />
            <DetailField label="Reorder level" value={formatQuantity(product.reorderLevel)} />
            <DetailField label="Opening quantity" value={formatQuantity(product.openingQuantity)} />
            <DetailField label="Opening cost" value={product.openingCost == null ? undefined : formatCurrency(product.openingCost)} />
          </div> : <p className="product-details-empty">Inventory tracking is not enabled for this product.</p>}
        </DetailSection>

        <DetailSection title="Sales" description="Sales pricing, tax and revenue settings.">
          {product.isSelling ? <div className="product-detail-grid">
            <DetailField label="Sales price" value={product.salesPrice == null ? undefined : formatCurrency(product.salesPrice)} />
            <DetailField label="Sales tax" value={product.salesTaxCode} />
            <DetailField label="Income account" value={product.incomeAccount} />
            <DetailField label="Sales description" value={product.salesDescription} />
          </div> : <p className="product-details-empty">Selling is not enabled for this product.</p>}
        </DetailSection>

        <DetailSection title="Purchases" description="Purchase cost, tax, expense and supplier settings.">
          {product.isBuying ? <div className="product-detail-grid">
            <DetailField label="Purchase price / cost" value={product.purchasePrice == null ? undefined : formatCurrency(product.purchasePrice)} />
            <DetailField label="Purchase tax" value={product.purchaseTaxCode} />
            <DetailField label="Expense account" value={product.expenseAccount} />
            <DetailField label="Preferred supplier" value={product.preferredSupplierName} />
            <DetailField label="Purchase description" value={product.purchaseDescription} />
          </div> : <p className="product-details-empty">Buying is not enabled for this product.</p>}
        </DetailSection>

        <DetailSection title="Units of measurement" description="Base unit and available conversions.">
          <div className="product-detail-grid product-detail-grid-compact"><DetailField label="Base unit" value={product.baseUnitLabel} /><DetailField label="Multiple units" value={product.hasMultipleUoms ? "Enabled" : "Disabled"} /></div>
          {product.hasMultipleUoms && product.uomConversions.length ? <div className="table-scroll product-detail-table"><table><thead><tr><th>Unit</th><th>Factor</th><th>Sales price</th><th>Purchase price</th><th>Defaults</th></tr></thead><tbody>{product.uomConversions.map((uom) => <tr key={`${uom.label}-${uom.factor}`}><td>{uom.label}</td><td>{formatQuantity(uom.factor)}</td><td>{uom.salePrice == null ? "—" : formatCurrency(uom.salePrice)}</td><td>{uom.purchasePrice == null ? "—" : formatCurrency(uom.purchasePrice)}</td><td>{[uom.isDefaultSalesUom ? "Sales" : "", uom.isDefaultPurchaseUom ? "Purchase" : ""].filter(Boolean).join(", ") || "—"}</td></tr>)}</tbody></table></div> : null}
        </DetailSection>

        <DetailSection title="Custom pricing" description="Contact, group and price-level overrides.">
          <div className="product-custom-pricing-summary"><span>Sales overrides <strong>{product.customSalesPrices.length}</strong></span><span>Purchase overrides <strong>{product.customPurchasePrices.length}</strong></span></div>
          {customPriceGroups.map(({ kind, prices }) => prices.length ? <div key={kind} className="product-detail-price-list"><h4>{kind} prices</h4><div className="table-scroll product-detail-table"><table><thead><tr><th>Applies to</th><th>Period</th><th>Min. quantity</th><th>UOM</th><th>Unit price</th></tr></thead><tbody>{prices.map((price, index) => <tr key={`${kind}-${index}`}><td>{price.targetType === "Contact" ? price.contactName : price.targetType === "ContactGroup" ? price.contactGroup : price.priceLevel}</td><td>{price.dateFromUtc ? `${new Date(price.dateFromUtc).toLocaleDateString()} – ${price.dateToUtc ? new Date(price.dateToUtc).toLocaleDateString() : "Open ended"}` : "Always"}</td><td>{formatQuantity(price.minQuantity)}</td><td>{price.uom || "—"}</td><td>{formatCurrency(price.unitPrice)}</td></tr>)}</tbody></table></div></div> : null)}
          {!product.customSalesPrices.length && !product.customPurchasePrices.length ? <p className="product-details-empty">No custom prices have been configured.</p> : null}
        </DetailSection>
      </div>
    </div>
  );
}
