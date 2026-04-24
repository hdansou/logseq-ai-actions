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

- Preact `DiffPanel` component (`src/ui/DiffPanel.tsx`) — side-by-side Original vs Proposed view with word-level highlights (added in green, removed in red with strikethrough), an optional **Edit** mode (in-place textarea), and **Reject** / **Accept** buttons. Keyboard: `Esc` rejects, `⌘/Ctrl-Enter` accepts. Styling uses the existing light/dark CSS variables (`--success`, `--danger`, …) so it follows the Logseq theme.
- `showDiffPanel(actionTitle, original, proposed)` (`src/ui/show-diff.ts`) — imperatively mounts the `DiffPanel` into the iframe's `#app`, calls `logseq.showMainUI()`, resolves a `Promise<string | null>` on user action (accepted text or `null`), then tears down via `render(null, …)` + `hideMainUI`.
- `index.html`: diff-panel CSS (scoped to `.diff-*` selectors) and a backdrop `body { background: rgba(0,0,0,0.45); display: flex; … }` per the skill's "full-screen modal" template. The iframe is hidden until `showMainUI()` fires, so the backdrop only appears when the panel is actually visible.
- `computeDiff(original, proposed): DiffSegment[]` — pure word-level diff wrapping `jsdiff`'s `diffWords`.
- Debug log ring buffer (`src/debug-log.ts`): `createRingBuffer<T>(capacity)` + `truncate(s, limit)` + module-level `debugLog` singleton (capacity 50). Capacity validated positive-integer-only. `entries()` returns a defensive copy. In-memory only per REQUIREMENTS §8 — never written to disk. 10 tests, 100 % lines.
- Debug-log recording in `runAction`: when `settings.debugLog` is true, every `/AI …` invocation pushes a `DebugLogEntry` (timestamp, action id/title, scope, outputMode, model, baseUrl, truncated request + response previews, durationMs, error?). Privacy-first — when the flag is off, nothing is recorded at all, not just hidden.
- `DiagnosticsPanel` Preact component + `showDiagnostics()` mount helper. Lists entries most-recent-first with per-entry header (id, scope, outputMode, time, duration, model), separate request/response/error blocks. **Copy all** serialises to a paste-into-bug-report-friendly plain-text format; **Clear all** empties the buffer. Keyboard: `Esc` closes.
- Slash command `/AI Diagnostics` opens the panel (registered alongside the four seed actions).

- **New output mode `append-children`** — appends LLM output as new child blocks under the current block (one line per child). Non-destructive; parent and existing children are untouched. Recorded in REQUIREMENTS §6.
- **New seed action `key-points`** (subtree → append-children) — extracts 3–7 discrete key points from the current block + its children, each as its own child block. Prompted to return one point per line with no bullet/numbering; `parsePoints` defensively cleans up any bullet prefixes, code-fence wrappers, or "Here are…" preambles the model sneaks in.
- `parsePoints(raw)` pure module + 9 tests — splits LLM list responses into clean single-line items; tolerates `- `/`* `/`• `/`1. `/`1) ` bullet styles, code fences, and common preambles.
- `ConfirmPanel` Preact component + `showConfirm` mount helper — a lightweight confirm dialog (title + preview pre-formatted + Accept/Reject) used by append-children mode. Same keyboard shortcuts as DiffPanel (`Esc` / `⌘ ↵`).
- `runAction` now branches on `action.outputMode` with three paths: `replace` (direct updateBlock), `diff-panel` (DiffPanel, updateBlock on accept), `append-children` (ConfirmPanel → sequential `logseq.Editor.insertBlock` with `sibling: false` so each parsed line becomes a child block).

- **DiffPanel action bar** — top-of-panel toolbar with one pill button per panel-compatible action (Rewrite, Summarize). Clicking a non-current button re-runs that action against the block's original content and refreshes the Proposed column in place. Current action is highlighted (accent pill) and disabled. Loading state dims the body and shows a "Working…" indicator; buttons disabled during the re-run. Failure surfaces an error indicator in the bar while preserving the previous proposal.
- If the user has typed edits into the Proposed textarea (Edit mode), switching actions shows a browser confirm prompt — "Discard your edits and re-run with a different action?" — so accidental clicks don't wipe WIP text.
- **Re-runs always start from the block's original text**, never the current proposal. "Try Summarize on my block" is the clean mental model; chaining (refine this proposal further) is a v2 concern behind its own button.
- `performLLMCall(action, input, settings)` extracted as a shared helper so the initial action-invocation path and the action-bar re-run path produce identical debug-log entries and go through the same request shape.
- `showDiffPanel` signature switched from positional args to a typed `ShowDiffPanelOptions` bag — no longer positional; requires `{ currentActionId, actionTitle, original, proposed, actions, onReRun }`. Emits a tagged-union stream (`same` / `added` / `removed`) with empty-value segments dropped. Round-trip invariant: concatenating `same + added` reconstructs proposed; `same + removed` reconstructs original. 6 tests.
- GitHub Actions CI workflow (`.github/workflows/ci.yml`): Tier 1 validation on every push + PR. Steps: pnpm install with frozen lockfile, `biome ci` (stricter than local `biome check`), `tsc --noEmit`, Vitest with the 80 % coverage gate, `vite build`. 10-minute timeout. Concurrency group cancels redundant runs on the same ref.

### Changed

- `summarize` now honours its designed `subtree` scope. Invoking `/AI Summarize` on a block fetches it with `includeChildren: true`, flattens the whole subtree into a Markdown outline via `flattenSubtree`, and sends that as the LLM input. The parent block's text is replaced with the summary; children are preserved as supporting detail (so you keep the source material and gain a TL;DR on top).
- `runAction` refactored around a new `resolveInput(action)` helper that dispatches on `action.scope`. `selection` scope falls back to `block` until the selection-range adapter lands.
- `rewrite` and `summarize` now use `outputMode: "diff-panel"` (their originally-designed output mode). After the model returns, the plugin shows a side-by-side diff with word-level highlights; the user can Accept, Reject, or switch to Edit mode to tweak the proposed text before applying. `spellcheck` and `grammar` stay on `replace` for the low-friction copy-edit loop.
- `resolveInput` now returns both `llmInput` (what we send to the model — the flattened outline for subtree scope) and `displayOriginal` (what the diff panel shows as "Original" — the parent block's own text, so subtree scope doesn't produce a useless "every word changed" diff).
- `runAction` branches on `action.outputMode` after the response: `"diff-panel"` invokes `showDiffPanel` and only applies on Accept, `"replace"` writes directly as before.

- `createOpenAIProvider` accepts an optional `fetchImpl` so the transport can be injected. The Logseq adapter wires a `logseqFetch` shim that tries `logseq.Request._request` first (bypasses browser CORS on desktop Electron) and falls back to `globalThis.fetch` on any error. Web Logseq users see no behaviour change; desktop users should stop seeing CORS blocks in most cases.
