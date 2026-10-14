import type { APIContext } from "astro";
import { isCrossOriginMutation } from "./request-origin";

export function json(
  data: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

/** Rejects cross-origin mutations even if a browser sends the session cookie. */
export function isSameOrigin(
  context: APIContext,
  trustedOrigins: readonly string[] = [],
): boolean {
  return !isCrossOriginMutation(
    context.request,
    context.url,
    trustedOrigins,
  );
}

export function acceptsJson(request: Request): boolean {
  return (
    request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json") ?? false
  );
}
