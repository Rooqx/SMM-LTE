import axe, { type Result } from "axe-core";

/**
 * Runs deterministic DOM-level accessibility checks in JSDOM. Color contrast
 * remains part of the manual browser audit because JSDOM has no layout engine.
 */
export async function findAccessibilityViolations(
  container: Element,
): Promise<Result[]> {
  const result = await axe.run(container, {
    rules: {
      "color-contrast": { enabled: false },
    },
  });
  return result.violations;
}
