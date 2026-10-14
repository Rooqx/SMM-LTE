const FRAME_POLICY =
  "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self' https://accounts.google.com";

/**
 * Applies response-wide protections, including redirects and error responses.
 * Astro owns hashed resource directives; this header supplies directives that
 * cannot be enforced reliably from a CSP meta element.
 */
export function applySecurityHeaders(
  response: Response,
  production = import.meta.env.PROD,
): Response {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Content-Security-Policy", FRAME_POLICY);
  if (production) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  return response;
}
