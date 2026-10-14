import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Astro compiles route islands on demand in development. The first browser
  // test can therefore be considerably slower than subsequent warm runs.
  timeout: 90_000,
  expect: { timeout: 25_000 },
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:4321",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
  // A later browser task owns starting the isolated database, backend, worker,
  // and Astro server. Keeping secrets out of this file prevents accidental
  // fallback to the retired shared-password harness.
});
