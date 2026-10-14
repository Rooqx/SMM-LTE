/**
 * Product-facing Brand area metadata.
 *
 * Context keys remain backend-owned. This configuration only controls how
 * current canonical items are grouped and described in the human interface.
 * It must never infer new business facts from context prose.
 */
export type BrandAreaKey =
  | "voice"
  | "audience"
  | "positioning"
  | "fundamentals"
  | "strategy"
  | "additional";

export type BrandAreaIcon =
  | "message-circle-heart"
  | "users-round"
  | "target"
  | "fingerprint"
  | "route"
  | "files";

export interface BrandAreaConfig {
  key: BrandAreaKey;
  label: string;
  description: string;
  icon: BrandAreaIcon;
  namespaces: readonly string[];
  terms: readonly string[];
}

export const BRAND_AREA_CONFIG: readonly BrandAreaConfig[] = [
  {
    key: "voice",
    label: "Brand voice",
    description: "The writing personality and language rules applied to generated content.",
    icon: "message-circle-heart",
    namespaces: [],
    terms: ["voice", "tone", "personality", "writing_style"],
  },
  {
    key: "audience",
    label: "Audience blueprint",
    description: "Who the agent writes for and the customer context it should respect.",
    icon: "users-round",
    namespaces: [],
    terms: ["audience", "persona", "customer", "buyer"],
  },
  {
    key: "positioning",
    label: "Positioning",
    description: "The market position, offer, and differentiation that keep content focused.",
    icon: "target",
    namespaces: [],
    terms: ["positioning", "offer", "value_proposition", "differentiation"],
  },
  {
    key: "fundamentals",
    label: "Brand foundation",
    description: "Approved business facts and identity information used across the workflow.",
    icon: "fingerprint",
    namespaces: ["brand"],
    terms: [],
  },
  {
    key: "strategy",
    label: "Current strategy",
    description: "Approved strategic direction and planning context guiding production.",
    icon: "route",
    namespaces: ["strategy", "calendar", "social", "analytics"],
    terms: ["goal", "campaign", "plan", "content_mix"],
  },
] as const;

export const ADDITIONAL_BRAND_AREA: BrandAreaConfig = {
  key: "additional",
  label: "Additional memory",
  description: "Other approved workspace knowledge available to the orchestration.",
  icon: "files",
  namespaces: [],
  terms: [],
};

export const BRAND_AREA_KEYS: readonly BrandAreaKey[] = [
  ...BRAND_AREA_CONFIG.map(({ key }) => key),
  ADDITIONAL_BRAND_AREA.key,
];

export function isBrandAreaKey(value: string | null): value is BrandAreaKey {
  return Boolean(value && BRAND_AREA_KEYS.includes(value as BrandAreaKey));
}
