import { PRODUCT_CONFIG } from "./product";

export interface SeoConfig {
  defaultTitle: string;
  themeColor: string;
  titleTemplate: (pageTitle?: string) => string;
  defaultDescription: string;
  robots: {
    authenticated: string;
    public: string;
  };
}

export const SEO_CONFIG: SeoConfig = {
  defaultTitle: `${PRODUCT_CONFIG.name} — Autonomous Social Media Management`,
  themeColor: "#090b12",
  titleTemplate: (pageTitle?: string) =>
    pageTitle ? `${pageTitle} · ${PRODUCT_CONFIG.name}` : `${PRODUCT_CONFIG.name} — Autonomous Social Media Management`,
  defaultDescription: PRODUCT_CONFIG.description,
  robots: {
    authenticated: "noindex, nofollow",
    public: "index, follow",
  },
} as const;
