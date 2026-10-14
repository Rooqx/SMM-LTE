import type { Scope } from "./api-keys.js";

type PrincipalBase = {
  organizationId: string;
  name: string;
  scopes: ReadonlySet<Scope>;
};

export type ServicePrincipal = PrincipalBase & {
  kind: "service";
  keyId: string;
};

export type UserPrincipal = PrincipalBase & {
  kind: "user";
  userId: string;
  sessionId: string;
  email: string;
};

export type Principal = ServicePrincipal | UserPrincipal;

/** Stable, non-secret attribution stored in audit rows. */
export function actorFor(principal: Principal): string {
  return principal.kind === "user"
    ? `user:${principal.userId}`
    : `api-key:${principal.keyId}`;
}
