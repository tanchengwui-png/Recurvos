import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { RowActionMenu } from "../components/RowActionMenu";
import { TablePagination } from "../components/TablePagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import type { ProductGroup, ProductGroupProductLookup } from "../types";

type YesNoFilter = "all" | "yes" | "no";

type EditorState = {
  id: string | null;
  name: string;
  description: string;
  selectedProductIds: string[];
};

function emptyEditor(): EditorState {
  return {
    id: null,
    name: "",
    description: "",
    selectedProductIds: [],
  };
}

function matchesBooleanFilter(value: boolean, filter: YesNoFilter) {
  if (filter === "all") {
    return true;
  }

  return filter === "yes" ? value : !value;
}

export function ProductGroupsPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [products, setProducts] = useState<ProductGroupProductLookup[]>([]);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [error, setError] = useState("");
  const [productNameSearch, setProductNameSearch] = useState("");
  const [productCodeSearch, setProductCodeSearch] = useState("");
  const [barcodeSearch, setBarcodeSearch] = useState("");
  const [sellingFilter, setSellingFilter] = useState<YesNoFilter>("all");
  const [buyingFilter, setBuyingFilter] = useState<YesNoFilter>("all");
  const [inventoryFilter, setInventoryFilter] = useState<YesNoFilter>("all");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  async function load() {
    const [groupList, productList] = await Promise.all([
      api.get<ProductGroup[]>("/product-groups"),
      api.get<ProductGroupProductLookup[]>("/product-groups/products"),
    ]);

    setGroups(groupList);
    setProducts(productList);
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedProductIdSet = useMemo(() => new Set(editor.selectedProductIds), [editor.selectedProductIds]);
  const expandedGroup = expandedGroupId ? groups.find((group) => group.id === expandedGroupId) ?? null : null;
  const expandedGroupProducts = expandedGroup
    ? products.filter((product) => expandedGroup.productIds.includes(product.id))
    : [];

  const filteredProducts = products.filter((product) => {
    if (showSelectedOnly && !selectedProductIdSet.has(product.id)) {
      return false;
    }

    if (productNameSearch.trim() && !product.name.toLowerCase().includes(productNameSearch.trim().toLowerCase())) {
      return false;
    }

    if (productCodeSearch.trim() && !product.code.toLowerCase().includes(productCodeSearch.trim().toLowerCase())) {
      return false;
    }

    if (barcodeSearch.trim() && !(product.barcode ?? "").toLowerCase().includes(barcodeSearch.trim().toLowerCase())) {
      return false;
    }

    if (!matchesBooleanFilter(product.isSelling, sellingFilter)) {
      return false;
    }

    if (!matchesBooleanFilter(product.isBuying, buyingFilter)) {
      return false;
    }

    if (!matchesBooleanFilter(product.trackInventory, inventoryFilter)) {
      return false;
    }

    return true;
  });

  const pagination = useClientPagination(
    filteredProducts,
    [filteredProducts.length, productNameSearch, productCodeSearch, barcodeSearch, sellingFilter, buyingFilter, inventoryFilter, showSelectedOnly, editor.selectedProductIds.join(",")],
    10,
  );

  const pageFullySelected = pagination.pagedItems.length > 0 && pagination.pagedItems.every((item) => selectedProductIdSet.has(item.id));

  function openCreate() {
    setEditor(emptyEditor());
    setError("");
    setIsEditorOpen(true);
  }

  function openEdit(group: ProductGroup) {
    setEditor({
      id: group.id,
      name: group.name,
      description: group.description,
      selectedProductIds: [...group.productIds],
    });
    setExpandedGroupId(group.id);
    setError("");
    setIsEditorOpen(true);
  }

  function openDetails(group: ProductGroup) {
    setExpandedGroupId((current) => current === group.id ? null : group.id);
  }

  function resetEditor() {
    setEditor(emptyEditor());
    setProductNameSearch("");
    setProductCodeSearch("");
    setBarcodeSearch("");
    setSellingFilter("all");
    setBuyingFilter("all");
    setInventoryFilter("all");
    setShowSelectedOnly(false);
    setIsEditorOpen(false);
  }

  function toggleProduct(productId: string, checked: boolean) {
    setEditor((current) => ({
      ...current,
      selectedProductIds: checked
        ? [...current.selectedProductIds, productId].filter((value, index, values) => values.indexOf(value) === index)
        : current.selectedProductIds.filter((id) => id !== productId),
    }));
  }

  function togglePageSelection(checked: boolean) {
    setEditor((current) => ({
      ...current,
      selectedProductIds: checked
        ? [...new Set([...current.selectedProductIds, ...pagination.pagedItems.map((item) => item.id)])]
        : current.selectedProductIds.filter((id) => !pagination.pagedItems.some((item) => item.id === id)),
    }));
  }

  function selectAllFiltered() {
    setEditor((current) => ({
      ...current,
      selectedProductIds: [...new Set(filteredProducts.map((product) => product.id))],
    }));
  }

  async function submit() {
    setError("");
    const payload = {
      name: editor.name.trim(),
      description: editor.description.trim(),
      productIds: editor.selectedProductIds,
    };

    if (!payload.name) {
      setError("Product group name is required.");
      return;
    }

    try {
      if (editor.id) {
        await api.put(`/product-groups/${editor.id}`, payload);
      } else {
        await api.post("/product-groups", payload);
      }

      await load();
      resetEditor();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save product group.");
    }
  }

  function requestDelete(group: ProductGroup) {
    setConfirmState({
      title: "Delete product group",
      description: `Delete ${group.name}? Products will remain in the catalog.`,
      action: async () => {
        await api.delete(`/product-groups/${group.id}`);
        await load();
        if (editor.id === group.id) {
          resetEditor();
        }
        if (expandedGroupId === group.id) {
          setExpandedGroupId(null);
        }
      },
    });
  }

  function getGroupActions(group: ProductGroup) {
    return [
      { label: expandedGroupId === group.id ? "Hide details" : "View details", onClick: () => openDetails(group) },
      { label: "Edit group", onClick: () => openEdit(group) },
      { label: "Delete group", onClick: () => requestDelete(group) },
    ];
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>Product Groups</h2>
          <p className="muted">Create reusable product groups, manage membership, and assign them from the product form.</p>
        </div>
        <button type="button" className="button button-primary" onClick={openCreate}>Add product group</button>
      </header>
      {error ? <HelperText tone="error">{error}</HelperText> : null}

      <section className="card">
        <div className="card-section-header">
          <div className="section-header-cluster">
            <h3 className="section-title">Saved product groups</h3>
          </div>
          <div className="page-meta-row page-meta-row-inline">
            <div className="page-meta-chips">
              <span className="page-meta-chip">
                <span className="page-meta-chip-label">Groups</span>
                <strong className="page-meta-chip-value">{groups.length}</strong>
              </span>
              <span className="page-meta-chip">
                <span className="page-meta-chip-label">Selected</span>
                <strong className="page-meta-chip-value">{editor.selectedProductIds.length}</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="subscription-mobile-list">
          {groups.map((group) => (
            <article key={group.id} className="subscription-mobile-card">
              <div className="subscription-mobile-card-header">
                <div className="subscription-mobile-identity">
                  <strong>{group.name}</strong>
                  <div className="eyebrow">{group.productsCount} product{group.productsCount === 1 ? "" : "s"}</div>
                </div>
                <div className="subscription-mobile-actions">
                  <RowActionMenu items={getGroupActions(group)} label="More" />
                </div>
              </div>
              <div className="subscription-mobile-meta">
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Description</span>
                  <span className="subscription-mobile-meta-value">{group.description || "-"}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Created</span>
                  <span className="subscription-mobile-meta-value">{new Date(group.createdAtUtc).toLocaleDateString()}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Updated</span>
                  <span className="subscription-mobile-meta-value">{group.updatedAtUtc ? new Date(group.updatedAtUtc).toLocaleDateString() : "-"}</span>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table customer-table">
            <thead>
              <tr>
                <th>Group Name</th>
                <th>Description</th>
                <th>Number of Products</th>
                <th>Created Date</th>
                <th>Last Updated</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <EmptyTableRow
                  colSpan={6}
                  title="No product groups yet"
                  description="Create groups to organize products and reuse those selections in the product form."
                  actions={<button type="button" className="button button-primary" onClick={openCreate}>Create first product group</button>}
                />
              ) : groups.map((group) => (
                <tr key={group.id}>
                  <td>{group.name}</td>
                  <td>{group.description || "-"}</td>
                  <td>{group.productsCount}</td>
                  <td>{new Date(group.createdAtUtc).toLocaleDateString()}</td>
                  <td>{group.updatedAtUtc ? new Date(group.updatedAtUtc).toLocaleDateString() : "-"}</td>
                  <td className="actions-cell"><RowActionMenu items={getGroupActions(group)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {expandedGroup ? (
        <section className="card">
          <div className="card-section-header">
            <div className="section-header-cluster">
              <h3 className="section-title">Product group details</h3>
            </div>
          </div>
          <div className="company-detail-grid">
            <div className="company-detail-item">
              <span>Group Name</span>
              <strong>{expandedGroup.name}</strong>
            </div>
            <div className="company-detail-item">
              <span>Description</span>
              <strong>{expandedGroup.description || "-"}</strong>
            </div>
            <div className="company-detail-item">
              <span>Number of Products</span>
              <strong>{expandedGroup.productsCount}</strong>
            </div>
            <div className="company-detail-item">
              <span>Created Date</span>
              <strong>{new Date(expandedGroup.createdAtUtc).toLocaleDateString()}</strong>
            </div>
            <div className="company-detail-item">
              <span>Last Updated</span>
              <strong>{expandedGroup.updatedAtUtc ? new Date(expandedGroup.updatedAtUtc).toLocaleDateString() : "-"}</strong>
            </div>
          </div>

          <div className="invoice-detail-block">
            <div className="invoice-detail-block-header">
              <p className="eyebrow">Products</p>
            </div>
            {expandedGroupProducts.length === 0 ? (
              <p className="muted">No products are assigned to this group.</p>
            ) : (
              <div className="table-scroll table-scroll-bounded">
                <table className="catalog-table customer-table">
                  <thead>
                    <tr>
                      <th>Product Name</th>
                      <th>SKU / Code</th>
                      <th>Barcode</th>
                      <th>Company</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expandedGroupProducts.map((product) => (
                      <tr key={product.id}>
                        <td>{product.name}</td>
                        <td>{product.code}</td>
                        <td>{product.barcode || "-"}</td>
                        <td>{product.companyName || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {isEditorOpen ? (
        <section className="card contact-group-editor-card">
          <div className="card-section-header">
            <div className="section-header-cluster">
              <h3 className="section-title">{editor.id ? "Edit product group" : "Create product group"}</h3>
            </div>
            <div className="contact-page-actions">
              <button type="button" className="button button-secondary" onClick={resetEditor}>Cancel</button>
              <button type="button" className="button button-primary" onClick={() => void submit()}>{editor.id ? "Update group" : "Save group"}</button>
            </div>
          </div>

          <div className="company-profile-fields-grid">
            <label className="form-label company-profile-field">
              Product Group Name
              <input className="text-input" value={editor.name} onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))} placeholder="Enter group name" />
            </label>
            <label className="form-label company-profile-field company-profile-field-wide">
              Description
              <textarea className="text-input" rows={3} value={editor.description} onChange={(event) => setEditor((current) => ({ ...current, description: event.target.value }))} placeholder="Optional description" />
            </label>
          </div>

          <section className="contact-selection-panel">
            <div className="company-profile-address-header">
              <h4 className="section-title">Products</h4>
              <p className="muted">Search, filter, and assign multiple products to this group.</p>
            </div>

            <div className="catalog-toolbar card subtle-card contact-selection-toolbar">
              <input
                aria-label="Search products by name"
                className="text-input"
                value={productNameSearch}
                onChange={(event) => setProductNameSearch(event.target.value)}
                placeholder="Product Name"
              />
              <input
                aria-label="Search products by code"
                className="text-input"
                value={productCodeSearch}
                onChange={(event) => setProductCodeSearch(event.target.value)}
                placeholder="SKU / Code"
              />
              <input
                aria-label="Search products by barcode"
                className="text-input"
                value={barcodeSearch}
                onChange={(event) => setBarcodeSearch(event.target.value)}
                placeholder="Barcode"
              />
              <select aria-label="Filter products by selling status" value={sellingFilter} onChange={(event) => setSellingFilter(event.target.value as YesNoFilter)}>
                <option value="all">Is Selling: All</option>
                <option value="yes">Is Selling: Yes</option>
                <option value="no">Is Selling: No</option>
              </select>
              <select aria-label="Filter products by buying status" value={buyingFilter} onChange={(event) => setBuyingFilter(event.target.value as YesNoFilter)}>
                <option value="all">Is Buying: All</option>
                <option value="yes">Is Buying: Yes</option>
                <option value="no">Is Buying: No</option>
              </select>
              <select aria-label="Filter products by inventory tracking" value={inventoryFilter} onChange={(event) => setInventoryFilter(event.target.value as YesNoFilter)}>
                <option value="all">Track Inventory: All</option>
                <option value="yes">Track Inventory: Yes</option>
                <option value="no">Track Inventory: No</option>
              </select>
              <label className="contact-selection-toggle">
                <input type="checkbox" checked={showSelectedOnly} onChange={(event) => setShowSelectedOnly(event.target.checked)} />
                <span>Show only selected</span>
              </label>
              <button type="button" className="button button-secondary" onClick={selectAllFiltered}>Select all</button>
              <button type="button" className="button button-secondary" onClick={() => setEditor((current) => ({ ...current, selectedProductIds: [] }))}>Clear selection</button>
            </div>

            <div className="table-scroll table-scroll-bounded">
              <table className="catalog-table customer-table contact-selection-table">
                <thead>
                  <tr>
                    <th>
                      <input type="checkbox" aria-label="Select all products on this page" checked={pageFullySelected} onChange={(event) => togglePageSelection(event.target.checked)} />
                    </th>
                    <th>Product Name</th>
                    <th>SKU / Code</th>
                    <th>Barcode</th>
                    <th>Is Selling</th>
                    <th>Is Buying</th>
                    <th>Track Inventory</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <EmptyTableRow
                      colSpan={7}
                      title="No products available"
                      description="Create products first before assigning them to a group."
                      actions={<button type="button" className="button button-primary" onClick={() => navigate("/products/new")}>Add product</button>}
                    />
                  ) : filteredProducts.length === 0 ? (
                    <EmptyTableRow
                      colSpan={7}
                      title="No matching products"
                      description="Try a different search term or filter to find products for this group."
                    />
                  ) : pagination.pagedItems.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <input type="checkbox" checked={selectedProductIdSet.has(product.id)} onChange={(event) => toggleProduct(product.id, event.target.checked)} aria-label={`Select ${product.name}`} />
                      </td>
                      <td>{product.name}</td>
                      <td>{product.code}</td>
                      <td>{product.barcode || "-"}</td>
                      <td>{product.isSelling ? "Yes" : "No"}</td>
                      <td>{product.isBuying ? "Yes" : "No"}</td>
                      <td>{product.trackInventory ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
          </section>
        </section>
      ) : null}

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
