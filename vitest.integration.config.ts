import { defineConfig } from "vitest/config";

// Tier 2 — live LLM endpoint. Run with: TEST_LIVE_LLM=1 pnpm test:integration
export default defineConfig({
  test: { environment: "node", globals: true, include: ["tests/integration/**/*.test.ts"] },
});
