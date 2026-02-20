import type { FrontdoorConfig, Principal, TenantConfig } from "./types.js";

export function resolveTenant(config: FrontdoorConfig, principal: Principal): TenantConfig {
  const tenant = config.tenants.get(principal.tenantId);
  if (!tenant) {
    throw new Error(`tenant not found for principal: ${principal.tenantId}`);
  }
  return tenant;
}
