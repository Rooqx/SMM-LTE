import type { APIRoute } from "astro";
import { getRequestAuth } from "@/lib/server/request-auth";

const SENSITIVE_RESPONSE_FIELDS = new Set([
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "password",
]);

function withoutSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSensitiveFields);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_RESPONSE_FIELDS.has(key))
      .map(([key, entry]) => [key, withoutSensitiveFields(entry)]),
  );
}

/** Removes database/session credentials that Better Auth includes in JSON DTOs. */
async function safeBrowserResponse(response: Response): Promise<Response> {
  if (
    [204, 205, 304].includes(response.status) ||
    !response.headers.get("content-type")?.includes("application/json")
  ) {
    return response;
  }

  const parsed = await response.clone().json().catch(() => undefined);
  if (parsed === undefined) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify(withoutSensitiveFields(parsed)), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const ALL: APIRoute = async (context) => {
  // The JWT plugin endpoint exists for server-to-server assertion exchange.
  // Astro calls `auth.api.getToken()` directly; browser JavaScript must never
  // receive the resulting Fastify bearer assertion.
  const normalizedPath = context.url.pathname.replace(/\/+$/, "");
  if (normalizedPath === "/api/auth/token") {
    return new Response(null, { status: 404 });
  }

  const headers = new Headers(context.request.headers);
  // Never trust a browser-supplied forwarding chain for auth rate limits.
  let clientAddress = context.request.headers.get("cf-connecting-ip");
  if (!clientAddress) {
    try {
      clientAddress = context.clientAddress;
    } catch {
      clientAddress = "0.0.0.0";
    }
  }
  headers.set("x-forwarded-for", clientAddress || "0.0.0.0");
  headers.delete("x-forwarded-host");
  headers.delete("x-forwarded-proto");
  const auth = await getRequestAuth(context);
  const response = await auth.handler(new Request(context.request, { headers }));
  return safeBrowserResponse(response);
};
