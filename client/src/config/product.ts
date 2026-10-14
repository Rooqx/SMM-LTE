/**
 * Authoritative typed product configuration.
 * Consumed across client UI, Astro SSR layouts, Better Auth configuration,
 * auth transactional emails, and document metadata.
 */
export interface ProductConfig {
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  supportEmail: string;
  logo: {
    textMark: string;
    altText: string;
  };
  navigationBrand: {
    title: string;
    badge: string;
  };
}

export const PRODUCT_CONFIG: ProductConfig = {
  name: "Rasm",
  shortName: "Rasm",
  tagline: "Your social presence, intelligently managed.",
  description:
    "An AI social media manager that turns brand context into platform-native strategy and content.",
  // Replace this address only after the final Rasm sending domain is verified.
  supportEmail: "support@rasm.com",
  logo: {
    textMark: "R",
    altText: "Rasm logo",
  },
  navigationBrand: {
    title: "Rasm",
    badge: "BETA",
  },
} as const;
