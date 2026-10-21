import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Database tests share one local Supabase, so files run one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
