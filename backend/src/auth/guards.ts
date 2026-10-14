import type { FastifyReply, FastifyRequest } from "fastify";
import { API_KEY_PREFIX, type ApiKeyService, type Scope } from "./api-keys.js";
import type { UserIdentityService } from "./user-identity.js";
import { forbidden, unauthorized } from "../domain/errors.js";

function bearerToken(header: string | undefined): string {
  const match = /^Bearer ([^\s]+)$/.exec(header ?? "");
  if (!match?.[1]) throw unauthorized();
  return match[1];
}

export function authenticationHook(
  apiKeys: ApiKeyService,
  userIdentities: UserIdentityService,
) {
  return async (request: FastifyRequest): Promise<void> => {
    if (!request.url.startsWith("/v1/")) return;
    const token = bearerToken(request.headers.authorization);
    request.principal = token.startsWith(API_KEY_PREFIX)
      ? await apiKeys.authenticate(token)
      : await userIdentities.authenticate(token);
  };
}

export function requireScope(scope: Scope) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.principal) throw unauthorized();
    if (!request.principal.scopes.has(scope)) throw forbidden();
  };
}

/** Approval decisions require an individually attributable human session. */
export async function requireUser(request: FastifyRequest): Promise<void> {
  if (!request.principal) throw unauthorized();
  if (request.principal.kind !== "user") throw forbidden();
}

/** The raw skill-run endpoint is compatibility-only and never a browser contract. */
export async function requireService(request: FastifyRequest): Promise<void> {
  if (!request.principal) throw unauthorized();
  if (request.principal.kind !== "service") throw forbidden();
}

export function principal(request: FastifyRequest) {
  if (!request.principal) throw unauthorized();
  return request.principal;
}
