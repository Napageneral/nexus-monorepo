import { verifyPasswordHash } from "./crypto.js";
import type { FrontdoorConfig, Principal } from "./types.js";

export function authenticatePassword(params: {
  config: FrontdoorConfig;
  username: string;
  password: string;
}): Principal | null {
  const username = params.username.trim().toLowerCase();
  if (!username) {
    return null;
  }
  const user = params.config.usersByUsername.get(username);
  if (!user || user.disabled) {
    return null;
  }
  if (!verifyPasswordHash({ password: params.password, encoded: user.passwordHash })) {
    return null;
  }
  return {
    userId: user.id,
    tenantId: user.tenantId,
    entityId: user.entityId,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    roles: [...user.roles],
    scopes: [...user.scopes],
    amr: ["pwd"],
  };
}
