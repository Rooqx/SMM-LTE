import type { APIRoute } from "astro";
import { PRODUCT_CONFIG } from "@/config/product";
import { SEO_CONFIG } from "@/config/seo";

// Keep this as a tiny server route. Prerendering imports the authentication
// middleware into Astro's isolated build process, where runtime secrets are
// intentionally unavailable.
export const prerender = false;

/**
 * Build the install manifest from the same product configuration as the UI so
 * renaming the product cannot leave stale browser-install metadata behind.
 */
export const GET: APIRoute = () => {
  const manifest = {
    id: "/",
    name: PRODUCT_CONFIG.name,
    short_name: PRODUCT_CONFIG.shortName,
    description: PRODUCT_CONFIG.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: SEO_CONFIG.themeColor,
    theme_color: SEO_CONFIG.themeColor,
    categories: ["business", "productivity", "social"],
    icons: [
      {
        src: "/brand/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
      {
        src: "/brand/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
    shortcuts: [
      {
        name: "Today",
        short_name: "Today",
        description: "Open the current orchestration task",
        url: "/",
      },
      {
        name: "Library",
        short_name: "Library",
        description: "Open approved posts and deliverables",
        url: "/library",
      },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: { "content-type": "application/manifest+json; charset=utf-8" },
  });
};
