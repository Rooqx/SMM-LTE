import { defineMiddleware } from "astro:middleware";
import { closeRequestAuth, getRequestAuth } from "@/lib/server/request-auth";
import { getServerConfig } from "@/lib/server/config";
import { isCrossOriginMutation } from "@/lib/server/request-origin";
import { applySecurityHeaders } from "@/lib/server/security-headers";

const PUBLIC_PATHS = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/api/health",
]);

/**
 * Browser-requested PWA resources must remain reachable before sign-in. The
 * service worker itself never caches authenticated HTML or API responses.
 */
const PUBLIC_PWA_PATHS = new Set([
  "/manifest.webmanifest",
  "/sw.js",
  "/register-sw.js",
  "/offline.html",
]);

// A valid session should not hide a password-reset link. A signed-in user may
// still need to replace a compromised password using a single-use reset token.
const REDIRECT_IF_AUTHENTICATED = new Set(["/login", "/register", "/forgot-password"]);

function unavailable(pathname: string): Response {
  const api = pathname.startsWith("/api/");
  return applySecurityHeaders(
    new Response(
      api
        ? JSON.stringify({
            error: {
              code: "AUTH_UNAVAILABLE",
              message: "Authentication is temporarily unavailable.",
            },
          })
        : "Authentication is temporarily unavailable. Please try again shortly.",
      {
        status: 503,
        headers: {
          "content-type": api
            ? "application/json; charset=utf-8"
            : "text/plain; charset=utf-8",
        },
      },
    ),
  );
}

export const onRequest = defineMiddleware(async (context, next) => {
  try {
  const pathname = context.url.pathname;
  const authEndpoint = pathname.startsWith("/api/auth/");
  const staticAsset = pathname.startsWith("/_astro/");
  const publicPwaAsset =
    PUBLIC_PWA_PATHS.has(pathname) || pathname.startsWith("/brand/");
  const publicPage = PUBLIC_PATHS.has(pathname);

  context.locals.user = null;
  context.locals.session = null;
  context.locals.authenticated = false;

  if (
    isCrossOriginMutation(
      context.request,
      context.url,
      getServerConfig().AUTH_TRUSTED_ORIGINS,
    )
  ) {
    return applySecurityHeaders(
      new Response("Cross-origin mutation is forbidden.", {
        status: 403,
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
    );
  }

  if (authEndpoint || staticAsset || publicPwaAsset || pathname === "/api/health") {
    return applySecurityHeaders(await next());
  }

  try {
    const auth = await getRequestAuth(context);
    const current = await auth.api.getSession({ headers: context.request.headers });
    if (current?.user.emailVerified) {
      context.locals.user = current.user;
      context.locals.session = current.session;
      context.locals.authenticated = true;
    }
  } catch {
    return unavailable(pathname);
  }

  if (!publicPage && !context.locals.authenticated) {
    if (pathname.startsWith("/api/")) {
      return applySecurityHeaders(
        new Response(
          JSON.stringify({
            error: { code: "UNAUTHENTICATED", message: "Sign in to continue." },
          }),
          {
            status: 401,
            headers: { "content-type": "application/json; charset=utf-8" },
          },
        ),
      );
    }

    const destination = encodeURIComponent(`${pathname}${context.url.search}`);
    return applySecurityHeaders(context.redirect(`/login?next=${destination}`, 303));
  }

  if (REDIRECT_IF_AUTHENTICATED.has(pathname) && context.locals.authenticated) {
    return applySecurityHeaders(context.redirect("/", 303));
  }

  return applySecurityHeaders(await next());
  } finally {
    await closeRequestAuth(context);
  }
});
