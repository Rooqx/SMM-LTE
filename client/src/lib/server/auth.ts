import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import type pg from "pg";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/config/auth";
import { PRODUCT_CONFIG } from "@/config/product";
import { enqueueAuthEmail } from "./auth-email";
import { getServerConfig } from "./config";

const config = getServerConfig();

const googleProvider = config.GOOGLE_ENABLED
  ? {
      google: {
        clientId: config.GOOGLE_CLIENT_ID as string,
        clientSecret: config.GOOGLE_CLIENT_SECRET as string,
        prompt: "select_account" as const,
      },
    }
  : {};

export function createAuth(pool: pg.Pool) {
  return betterAuth({
  appName: PRODUCT_CONFIG.name,
  baseURL: config.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: config.BETTER_AUTH_SECRET,
  database: pool,
  trustedOrigins: [...config.AUTH_TRUSTED_ORIGINS],
  advanced: {
    cookiePrefix: "smm",
    useSecureCookies: config.NODE_ENV === "production",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.NODE_ENV === "production",
      path: "/",
    },
    database: {
      generateId: "uuid",
      joins: true,
      validateSchema: false,
    },
  },
  account: {
    encryptOAuthTokens: true,
    storeStateStrategy: "database",
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
      allowDifferentEmails: false,
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    resetPasswordTokenExpiresIn: 30 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await enqueueAuthEmail(pool, {
        kind: "password_reset",
        recipient: user.email,
        recipientName: user.name,
        actionUrl: url,
      });
    },
  },
  emailVerification: {
    expiresIn: 60 * 60,
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }) => {
      await enqueueAuthEmail(pool, {
        kind: "email_verification",
        recipient: user.email,
        recipientName: user.name,
        actionUrl: url,
      });
    },
  },
  socialProviders: googleProvider,
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 10,
    deferSessionRefresh: config.DEPLOY_TARGET !== "cloudflare",
  },
  rateLimit: {
    enabled: true,
    storage: "memory",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 5 },
      "/send-verification-email": { window: 60, max: 5 },
    },
  },
  plugins: [
    jwt({
      disableSettingJwtHeader: true,
      jwks: {
        keyPairConfig: { alg: "EdDSA", crv: "Ed25519" },
        rotationInterval: 60 * 60 * 24 * 30,
        gracePeriod: 60 * 60 * 24 * 7,
      },
      jwt: {
        issuer: config.BETTER_AUTH_URL,
        audience: config.SMM_API_AUDIENCE,
        expirationTime: "60s",
        definePayload: ({ user, session }) => ({
          sessionId: session.id,
          email: user.email,
          emailVerified: user.emailVerified,
          name: user.name,
        }),
      },
    }),
  ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
