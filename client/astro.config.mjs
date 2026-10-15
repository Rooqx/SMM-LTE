import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

if (typeof process !== "undefined" && process.on) {
  process.on("uncaughtException", (error) => {
    const isSocketTimeout =
      error?.code === "ETIMEDOUT" ||
      error?.code === "ECONNRESET" ||
      error?.code === "EPIPE" ||
      error?.name === "AggregateError" ||
      String(error?.message).includes("ETIMEDOUT") ||
      String(error?.message).includes("Connection terminated");
    if (isSocketTimeout) {
      console.warn("[Astro Dev Warning] Handled background socket timeout:", error.message || error.code);
      return;
    }
    console.error("[Astro Dev Uncaught Exception]", error);
  });
}

export default defineConfig({
  output: "server",
  session: false,
  adapter: cloudflare({ imageService: "passthrough" }),
  integrations: [react()],
  // The product renders generated Markdown through React Markdown, not Astro's
  // build-time highlighter. Disabling unused Shiki avoids inline-style CSP
  // incompatibility and removes code that no route needs.
  markdown: { syntaxHighlight: false },
  // Astro hashes every generated script and stylesheet. Keeping this policy in
  // the framework avoids the broad `unsafe-inline` exception previously needed
  // by the middleware header.
  security: {
    // Astro rejects a request solely from Sec-Fetch-Site before application
    // middleware runs. Reverse proxies and controlled browsers can rewrite
    // that hint even when Origin is exact. The middleware performs the same
    // protection using the authoritative Origin and URL instead.
    checkOrigin: false,
    csp: {
      algorithm: "SHA-256",
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https://lh3.googleusercontent.com",
        "connect-src 'self'",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self' https://accounts.google.com",
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Private UI source should not be reconstructable from public artifacts.
      sourcemap: false,
    },
  },
});
