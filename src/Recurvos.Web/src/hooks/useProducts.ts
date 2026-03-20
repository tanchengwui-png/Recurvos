import { api } from "../lib/api";
import type { PagedResult, Product, ProductDetails } from "../types";

export type ProductFilters = {
  search: string;
  companyId?: string;
  isActive: "all" | "active" | "inactive";
  page: number;
  pageSize: number;
};

export async function fetchProducts(filters: ProductFilters) {
  const params = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });

  if (filters.search.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.companyId) {
    params.set("companyId", filters.companyId);
  }

  if (filters.isActive !== "all") {
    params.set("isActive", String(filters.isActive === "active"));
  }

  return api.get<PagedResult<Product>>(`/products?${params.toString()}`);
}

export function fetchProduct(id: string) {
  return api.get<ProductDetails>(`/products/${id}`);
}
