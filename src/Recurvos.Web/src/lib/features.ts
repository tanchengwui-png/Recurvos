import type { FeatureAccess } from "../types";

/** Uses the API's resolved entitlement list, including inherited package benefits. */
export function hasFeature(access: FeatureAccess | null | undefined, featureKey: string): boolean {
  return access?.featureKeys.some((key) => key.toLowerCase() === featureKey.toLowerCase()) ?? false;
}

export function hasAnyFeature(access: FeatureAccess | null | undefined, featureKeys: readonly string[]): boolean {
  return featureKeys.some((featureKey) => hasFeature(access, featureKey));
}
