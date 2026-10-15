import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function titleCase(value: string): string {
  return value
    .replace(/[-_.]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

type DateValue = string | number | Date | null | undefined;

export function formatDate(
  value?: DateValue,
  timeZone = "UTC",
  locale = "en",
): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date);
  }
}

export function formatDateOnly(
  value?: DateValue,
  timeZone = "UTC",
  locale = "en",
): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(date);
  }
}

export function isRunActive(status: string): boolean {
  return status === "queued" || status === "running";
}

/**
 * Accepts only paths on this application. Backslashes are rejected because
 * browsers can normalize them into protocol-relative URLs during navigation.
 */
export function safeLocalPath(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return "/";

  try {
    const base = new URL("https://signal-studio.invalid");
    const candidate = new URL(value, base);
    return candidate.origin === base.origin
      ? `${candidate.pathname}${candidate.search}${candidate.hash}`
      : "/";
  } catch {
    return "/";
  }
}

/** Prevents backend-provided slugs from becoming surprising download names. */
export function markdownFilename(value: string): string {
  const safeStem = value
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return `${safeStem || "artifact"}.md`;
}

/**
 * Generates a RFC4122 v4 UUID safely across all environments.
 * crypto.randomUUID is only available in Secure Contexts (HTTPS/localhost);
 * on mobile devices connecting over local HTTP (e.g. 172.20.10.3), crypto.randomUUID
 * is undefined and throws TypeError. This fallback provides a valid v4 UUID.
 */
export function safeRandomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
