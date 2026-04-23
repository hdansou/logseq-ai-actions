import "@logseq/libs";

// Plugin entry point. Keep this module SHALLOW — it is the only place that
// loads `@logseq/libs` for its side-effects. Every other module uses a
// triple-slash `/// <reference types="@logseq/libs" />` so Vitest can import
// them without crashing on the SDK's browser-only bootstrap (runtime-gotchas
// §11). Business logic lives in `src/**` pure modules and the
// `src/adapter/` Logseq wrapper (REQUIREMENTS §9).

async function main(): Promise<void> {
  // Phase 1 scaffold — deliberate no-op entry so `pnpm build` produces a
  // valid bundle. Real bootstrap (theme sync, action registry wiring,
  // settings schema, entry-point registration) lands in Phase 4–5.
  console.info("logseq-ai-actions: scaffold entry loaded");
}

logseq.ready(main).catch((err) => {
  console.error("logseq-ai-actions: failed to start", err);
});
