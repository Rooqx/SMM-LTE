import type pg from "pg";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";
import { describe, expect, it, vi } from "vitest";
import {
  createAssertionVerifier,
  UserIdentityService,
} from "../src/auth/user-identity.js";
import { loadConfig } from "../src/config.js";

const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const claims = {
  sub: userId,
  sessionId,
  email: "owner@example.com",
  emailVerified: true as const,
  name: "Owner",
};

describe("UserIdentityService", () => {
  it("accepts only short-lived EdDSA assertions with the configured issuer and audience", async () => {
    const config = loadConfig({ NODE_ENV: "test" });
    const { publicKey, privateKey } = await generateKeyPair("EdDSA");
    const publicJwk = await exportJWK(publicKey);
    const resolver = createLocalJWKSet({
      keys: [{ ...publicJwk, alg: "EdDSA", kid: "test-key", use: "sig" }],
    });
    const verify = createAssertionVerifier(config, resolver);
    const assertion = await new SignJWT({
      sessionId,
      email: claims.email,
      emailVerified: true,
      name: claims.name,
    })
      .setProtectedHeader({ alg: "EdDSA", kid: "test-key", typ: "JWT" })
      .setSubject(userId)
      .setIssuer(config.AUTH_TOKEN_ISSUER)
      .setAudience(config.AUTH_TOKEN_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("60s")
      .sign(privateKey);

    await expect(verify(assertion)).resolves.toMatchObject(claims);

    const wrongAudience = await new SignJWT({
      sessionId,
      email: claims.email,
      emailVerified: true,
      name: claims.name,
    })
      .setProtectedHeader({ alg: "EdDSA", kid: "test-key", typ: "JWT" })
      .setSubject(userId)
      .setIssuer(config.AUTH_TOKEN_ISSUER)
      .setAudience("wrong-audience")
      .setIssuedAt()
      .setExpirationTime("60s")
      .sign(privateKey);
    await expect(verify(wrongAudience)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("derives the account from authoritative session and membership rows", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        user_id: userId,
        session_id: sessionId,
        email: claims.email,
        name: claims.name,
        organization_id: organizationId,
      }],
    });
    const pool = { query } as unknown as pg.Pool;
    const service = new UserIdentityService(
      pool,
      loadConfig({ NODE_ENV: "test" }),
      async () => claims,
    );

    await expect(service.authenticate("assertion")).resolves.toMatchObject({
      kind: "user",
      userId,
      sessionId,
      organizationId,
      email: claims.email,
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it("fails closed when the session is revoked or the email is unverified", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as pg.Pool;
    const service = new UserIdentityService(
      pool,
      loadConfig({ NODE_ENV: "test" }),
      async () => claims,
    );

    await expect(service.authenticate("assertion")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("creates one personal owner account when no membership exists", async () => {
    const poolQuery = vi.fn().mockResolvedValue({
      rows: [{
        user_id: userId,
        session_id: sessionId,
        email: claims.email,
        name: claims.name,
        organization_id: null,
      }],
    });
    const clientQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({
        rows: [{ name: claims.name, email: claims.email, organization_id: null }],
      })
      .mockResolvedValueOnce({ rows: [{ id: organizationId }] })
      .mockResolvedValueOnce({ rows: [] }) // membership
      .mockResolvedValueOnce({ rows: [] }) // audit
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    const release = vi.fn();
    const pool = {
      query: poolQuery,
      connect: vi.fn().mockResolvedValue({ query: clientQuery, release }),
    } as unknown as pg.Pool;
    const service = new UserIdentityService(
      pool,
      loadConfig({ NODE_ENV: "test" }),
      async () => claims,
    );

    await expect(service.authenticate("assertion")).resolves.toMatchObject({
      organizationId,
    });
    expect(clientQuery.mock.calls.some(([sql]) =>
      String(sql).includes("INSERT INTO account_memberships"))).toBe(true);
    expect(release).toHaveBeenCalledOnce();
  });
});
