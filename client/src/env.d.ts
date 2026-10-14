/// <reference types="astro/client" />

declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}

declare namespace App {
  interface Locals {
    authenticated: boolean;
    user: import("better-auth").User | null;
    session: import("better-auth").Session | null;
    authRuntime?: {
      auth: import("./lib/server/auth").Auth;
      pool: import("pg").Pool;
    };
  }
}
