const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Rejects unsafe browser requests that are demonstrably cross-origin.
 *
 * `Origin` is authoritative when present. Fetch Metadata remains a fallback
 * for clients that omit Origin, but it must not override an exact match: some
 * reverse proxies and controlled browsers rewrite `Sec-Fetch-Site` while
 * preserving the original, verifiable Origin header.
 */
export function isCrossOriginMutation(
  request: Request,
  requestUrl: URL,
  trustedOrigins: readonly string[] = [],
): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return false;

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const normalizedOrigin = new URL(origin).origin;
      const allowedOrigins = new Set([
        requestUrl.origin,
        ...trustedOrigins.map((value) => new URL(value).origin),
      ]);
      return !allowedOrigins.has(normalizedOrigin);
    } catch {
      return true;
    }
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite !== "same-origin" && fetchSite !== "none";

  const referer = request.headers.get("referer");
  if (!referer) return false; // Preserve non-browser API and test clients.
  try {
    const refererOrigin = new URL(referer).origin;
    return !new Set([
      requestUrl.origin,
      ...trustedOrigins.map((value) => new URL(value).origin),
    ]).has(refererOrigin);
  } catch {
    return true;
  }
}
