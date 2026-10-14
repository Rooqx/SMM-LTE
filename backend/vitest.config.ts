import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // PostgreSQL suites intentionally share one disposable database and some
    // tests retain immutable release fixtures for later assertions. Running
    // files sequentially prevents cross-suite cleanup/queue races; concurrency
    // behavior is exercised explicitly within the relevant integration tests.
    fileParallelism: false,
  },
});
