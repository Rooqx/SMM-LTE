import { describe, expect, it } from "vitest";
import { PRODUCT_CONFIG } from "@/config/product";
import { GET } from "./manifest.webmanifest";

describe("web app manifest", () => {
  it("uses centralized product metadata and installable icon sizes", async () => {
    const response = await GET({} as never);
    const manifest = await response.json();

    expect(response.headers.get("content-type")).toContain("application/manifest+json");
    expect(manifest.name).toBe(PRODUCT_CONFIG.name);
    expect(manifest.short_name).toBe(PRODUCT_CONFIG.shortName);
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", type: "image/png" }),
        expect.objectContaining({ sizes: "512x512", type: "image/png" }),
      ]),
    );
  });
});
