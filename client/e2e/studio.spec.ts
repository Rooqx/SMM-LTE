import { test } from "@playwright/test";

test.describe("Better Auth browser acceptance", () => {
  test.skip(
    "requires the isolated Better Auth fixture migration documented in client/docs/e2e-testing.md",
    async () => {
      // This deliberate skip prevents the retired shared-cookie harness from
      // producing false evidence. Replace it only with the documented real
      // session fixture and deterministic/live test lanes.
    },
  );
});
