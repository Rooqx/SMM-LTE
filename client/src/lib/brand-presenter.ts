import {
  ADDITIONAL_BRAND_AREA,
  BRAND_AREA_CONFIG,
  type BrandAreaConfig,
  type BrandAreaKey,
} from "@/config/brand";
import type { ContextItem } from "@/lib/contracts";
import { formatDateOnly, titleCase } from "@/lib/utils";

export interface BrandArea {
  config: BrandAreaConfig;
  items: ContextItem[];
  latestUpdatedAt?: string | undefined;
}

function normalizedKey(key: string): string {
  return key.trim().toLowerCase().replace(/[.-]+/g, "_");
}

function namespaceOf(key: string): string {
  return key.trim().toLowerCase().split(".")[0] ?? "";
}

function configForItem(item: ContextItem): BrandAreaConfig {
  const key = normalizedKey(item.key);
  const namespace = namespaceOf(item.key);

  return (
    BRAND_AREA_CONFIG.find(
      (config) =>
        config.terms.some((term) => key.includes(term)) ||
        config.namespaces.includes(namespace),
    ) ?? ADDITIONAL_BRAND_AREA
  );
}

function latestTimestamp(items: ContextItem[]): string | undefined {
  return items
    .map((item) => item.updated_at ?? item.created_at)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
}

/**
 * Groups current canonical context without interpreting Markdown or inventing
 * domain fields. Configuration determines presentation; the backend data stays
 * intact and visible with its original key and version.
 */
export function buildBrandAreas(items: ContextItem[]): BrandArea[] {
  const grouped = new Map<BrandAreaKey, { config: BrandAreaConfig; items: ContextItem[] }>();

  for (const item of items) {
    const config = configForItem(item);
    const current = grouped.get(config.key) ?? { config, items: [] };
    current.items.push(item);
    grouped.set(config.key, current);
  }

  const order = [...BRAND_AREA_CONFIG, ADDITIONAL_BRAND_AREA].map(({ key }) => key);
  return [...grouped.values()]
    .map(({ config, items: areaItems }) => {
      const sortedItems = [...areaItems].sort((left, right) =>
        left.key.localeCompare(right.key),
      );
      return {
        config,
        items: sortedItems,
        latestUpdatedAt: latestTimestamp(sortedItems),
      };
    })
    .sort(
      (left, right) =>
        order.indexOf(left.config.key) - order.indexOf(right.config.key),
    );
}

export function contextItemLabel(key: string): string {
  const meaningfulPart = key.split(".").filter(Boolean).at(-1) ?? key;
  return titleCase(meaningfulPart.replace(/[_-]+/g, " "));
}

export function formatContextDate(
  value: string | undefined,
  timezone: string,
): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  return formatDateOnly(date, timezone);
}
