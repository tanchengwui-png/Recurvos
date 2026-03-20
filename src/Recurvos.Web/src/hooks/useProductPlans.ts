import { api } from "../lib/api";
import type { PagedResult, ProductPlan } from "../types";

export type ProductPlanFilters = {
  productId?: string;
  billingType: "all" | "OneTime" | "Recurring";
  isActive: "all" | "active" | "inactive";
  page: number;
  pageSize: number;
};

export async function fetchProductPlans(filters: ProductPlanFilters) {
  const params = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });

  if (filters.productId) {
    params.set("productId", filters.productId);
  }

  if (filters.billingType !== "all") {
    params.set("billingType", filters.billingType);
  }

  if (filters.isActive !== "all") {
    params.set("isActive", String(filters.isActive === "active"));
  }

  return api.get<PagedResult<ProductPlan>>(`/product-plans?${params.toString()}`);
}

export function fetchPlansForProduct(productId: string) {
  return api.get<ProductPlan[]>(`/products/${productId}/plans`);
}
