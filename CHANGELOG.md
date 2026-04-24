# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release notes are authored via [changesets](https://github.com/changesets/changesets) once the tooling is wired up in Phase 1. Until then, entries under `[Unreleased]` are added by hand.

## [Unreleased]

### Added

- Signed-off v1 requirements (`REQUIREMENTS.md`) covering scope, seed actions, privacy model, testing tiers, and tooling choices.
- Primary task tracker (`tasks.md`) with phased plan from bootstrap through v1.0.0.
- `AGENTS.md` capturing non-discoverable landmines (author name, package-vs-dir naming, thin-adapter rule, SDK import pattern).
- Tooling scaffold: Vite 8, TypeScript 6 (strict + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`), Vitest 4 with `@vitest/coverage-v8` (80 % gate on pure `src/**` modules), Biome 2 for lint + format, Preact 10 + `preact/compat` alias, Zod 4 for schema validation, `@logseq/libs@0.3.2` (DB-graph-capable SDK via the `next` dist-tag).
- `src/__sdk_guard__.ts` compile-time SDK floor so accidental SDK downgrades fail typecheck.
- `index.html` with light/dark CSS variable scaffolding (theme sync via `logseq.App.onThemeModeChanged` lands in Phase 5).
- `simple-git-hooks` pre-commit wired to `biome check --write` + `tsc --noEmit`. Hooks never skipped.
- changesets initialized with `access: public`.
- `classifyEndpoint(baseUrl)` pure module — strict loopback-only classifier (localhost, 127.0.0.1, 0.0.0.0, ::1), fail-closed on invalid input. 100 % line coverage.
- Endpoint presets module: **LM Studio** (primary default, `:1234/v1`), **Ollama** (`:11434/v1`), **Goose** (experimental, unverified), **Custom**. All non-custom preset URLs are loopback — invariant enforced by test.
- Native plugin settings via `logseq.useSettingsSchema`: preset picker, base URL, model, API key, temperature, timeout, debug-log toggle. Picking a new preset auto-fills base URL + model iff the user hadn't customised them.
- `README.md` with quick-start, preset table, privacy note, and development commands.
- Plugin icon: `public/icon.svg` source + 128×128 `public/icon.png` rendered via `rsvg-convert`.
- `ActionSchema` (Zod) + `parseAction` — single source of truth for built-in seed actions (TS literals) and user-defined actions (runtime JSON). Validates id, title, scope (`selection`/`block`/`subtree`), outputMode (`replace`/`diff-panel`), systemPrompt.
- `LLMProvider` interface + `createOpenAIProvider()` — non-streaming OpenAI-compatible completion client. Handles trailing slash in `baseUrl`, optional `Authorization: Bearer <apiKey>` header, `AbortController`-based timeout, trims response whitespace. Errors surface as `LLMProviderError` with HTTP status + body excerpt in `details`. 10 tests with stubbed `fetch`.
- Seed actions (`SEED_ACTIONS`): `spellcheck`, `grammar`, `rewrite`, `summarize`. Each parses-and-freezes against `ActionSchema` at module-load time so schema drift fails on import. Prompts are tuned for small local models (forcing "return only" to suppress the "Here is…" preamble). MVP: all use `block` scope + `replace` mode; `summarize` will move to `subtree` once the flattener lands, `rewrite`/`summarize` to `diff-panel` when Preact UI lands.
- Slash commands: `/AI Spellcheck`, `/AI Grammar`, `/AI Rewrite`, `/AI Summarize`. Each runs the corresponding seed action against the block the cursor is in, reads the current block via `logseq.Editor.getCurrentBlock` (preferring `title` over the deprecated `content` per runtime-gotchas §13), POSTs to the configured endpoint, replaces the block content on success. Shows busy + success/failure toasts. Cmd-Z undoes the replacement.
- README: dedicated **CORS** subsection under Quick start. Documents that Logseq Desktop is not CORS-gated (requests route through Electron's main process) while Logseq Web is, and provides the specific knob for each preset — LM Studio's "Cross-Origin-Resource-Sharing" toggle / `lms server start --cors`, Ollama's `OLLAMA_ORIGINS="*"` env var, Custom-endpoint header guidance.

- GitHub Actions CI workflow (`.github/workflows/ci.yml`): Tier 1 validation on every push + PR. Steps: pnpm install with frozen lockfile, `biome ci` (stricter than local `biome check`), `tsc --noEmit`, Vitest with the 80 % coverage gate, `vite build`. 10-minute timeout. Concurrency group cancels redundant runs on the same ref.

### Changed

- `summarize` now honours its designed `subtree` scope. Invoking `/AI Summarize` on a block fetches it with `includeChildren: true`, flattens the whole subtree into a Markdown outline via `flattenSubtree`, and sends that as the LLM input. The parent block's text is replaced with the summary; children are preserved as supporting detail (so you keep the source material and gain a TL;DR on top).
- `runAction` refactored around a new `resolveInput(action)` helper that dispatches on `action.scope`. `selection` scope falls back to `block` until the selection-range adapter lands.
