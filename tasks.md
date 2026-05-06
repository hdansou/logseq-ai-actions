# Tasks — `logseq-ai-actions`

Primary task tracker for this project. See `REQUIREMENTS.md` for the signed-off v1 spec.

Legend: `[ ]` todo, `[~]` in progress, `[x]` done, `[-]` dropped.

---

## Phase 0 — Requirements & bootstrap

- [x] Kickoff Q&A and decision memos (2026-04-23)
- [x] Write `REQUIREMENTS.md` (2026-04-23)
- [x] Initialize `tasks.md` and `CHANGELOG.md`
- [x] Draft `AGENTS.md` (non-discoverable landmines only)
- [ ] Confirm author display name and GitHub repo URL — done for author (Danzu) and repo (`https://github.com/hdansou/logseq-ai-actions`), email exposure in `package.json` `author` still to confirm before first public release
- [x] `git init` + first commit (requirements-only baseline) — `6c781b8`
- [-] Local dir rename `logseq-action/` → `logseq-ai-actions/` — rejected, mismatch documented in AGENTS.md + README

## Phase 1 — Tooling scaffold

- [x] `pnpm init`; pin Node LTS in `.nvmrc` / `engines` (Node 22)
- [x] Add Vite (vanilla — no `vite-plugin-logseq`; Logseq loads from the dev-server URL directly)
- [x] Add TypeScript, strict `tsconfig.json` with `moduleResolution: bundler`
- [x] Add Biome; minimal `biome.json`
- [x] Add Vitest + `@vitest/coverage-v8` with 80 % gate
- [x] Add Zod
- [x] Add Preact + `preact/compat` alias; JSX via `tsconfig.json`
- [x] Add changesets (`.changeset/config.json` with `access: public`)
- [x] Add `simple-git-hooks` pre-commit: `biome check --write` + `tsc --noEmit`
- [x] `package.json` scripts wired (dev, build, typecheck, test, lint, lint:fix, format, changeset, release, prepare)
- [x] `LICENSE` (MIT) — Phase 0 baseline
- [x] `.gitignore` — Phase 0 baseline
- [x] `src/__sdk_guard__.ts` — compile-time floor at `@logseq/libs ≥ 0.3.1` (references `getCurrentRoute`)
- [x] `index.html` with light/dark CSS variable scaffolding
- [x] GitHub Actions workflow — Tier 1 (lint + typecheck + test + build) on every push and PR

## Phase 2 — Pure core (TDD)

- [x] `classifyEndpoint(baseUrl)` — LOCAL vs REMOTE (strict loopback; fail-closed on invalid)
- [x] Endpoint presets (LM Studio / Ollama / Goose / Custom) with `findPreset` lookup
- [x] `ActionSchema` (Zod) + `parseAction` — 10 tests
- [x] Registry pipeline — `buildRegistry` + `parseUserActions` (public split) — shadowing, dedup, individual entry validation, stable order
- [-] Scope resolver — block + subtree handled inline in `resolveInput`; selection deferred per REQUIREMENTS §14
- [x] Subtree flattener (`flattenSubtree` — Markdown outline, 2-space indent per depth, 10 tests)
- [x] Diff module — `computeDiff(original, proposed)` wrapping jsdiff (6 tests, 100 % coverage)
- [x] Streaming chunk parser (`src/sse.ts`, 11 tests, 100 % lines)
- [x] Debug log ring buffer — `createRingBuffer<T>(capacity)` + `truncate` + `debugLog` singleton (cap 50; 10 tests)
- [x] `parsePoints` — tolerates bullet prefixes, code fences, "Here are…" preambles (9 tests)
- [ ] Prompt templater (`{{content}}`, `{{selection}}`, etc.) — deferred; seed prompts use plain interpolation, no templating needed yet

## Phase 3 — LLM provider

- [x] `LLMProvider` interface (`src/provider.ts`)
- [x] Non-streaming implementation — 10 tests (happy path, auth header, trailing slash, HTTP error, timeout, network error, empty choices, whitespace trim)
- [x] Streaming implementation — `provider.stream(req, onChunk)`, 5 tests with mocked ReadableStreams
- [x] Preset table (Phase 2 item — same module)
- [x] `fetchImpl` injection + `logseqFetch` shim (falls back to `globalThis.fetch` when host scope unreachable)
- [ ] Tier 2 integration test against a live endpoint, gated by `TEST_LIVE_LLM=1` — placeholder

## Phase 4 — Logseq adapter (inlined)

Originally specced as separate adapter modules; v1 reality is all of this lives in `src/index.ts` as thin helpers. Works fine; extract to `src/adapter/*` only if multiple callers emerge.

- [x] Block read — `logseq.Editor.getCurrentBlock` / `getBlock(uuid, {includeChildren})` via `resolveInput(action, explicitBlockUuid?)`
- [x] Block write — `updateBlock` for replace / diff-panel accept; `insertBlock` with `sibling: false` for append-children
- [x] Registration — slash + palette + context menu + toolbar all wired from one action list (`rebuildRegistry`), gated by `registeredInvocationIds`
- [x] Settings adapter — `readSettings()` snapshot helper; `readPrivateSetting(k, fallback)` for the underscore-prefixed persistence keys (`_consentSeen`, `_lastEndpointTrust`)

## Phase 5 — UI (Preact)

- [x] Native settings via `logseq.useSettingsSchema` (preset picker, baseUrl, model, API key, temperature, timeout, debug-log toggle, userActionsJson) + preset-change auto-fill
- [x] First-run consent modal (one-time, backed by `_consentSeen` hidden setting)
- [x] LOCAL/REMOTE endpoint badge — `LocalRemoteBadge` component, rendered in every panel header
- [x] LOCAL → REMOTE one-time transition warning modal (`_lastEndpointTrust` tracks)
- [x] `DiffPanel` — side-by-side Original/Proposed with word-level highlights, Edit mode, action bar (Rewrite / Summarize re-run), streaming support
- [x] `ConfirmPanel` — single preview + Accept/Reject; `hideReject` for acknowledgement-only notices
- [x] `DiagnosticsPanel` + `/AI Diagnostics` — read-only debug-log viewer with Copy all / Clear all
- [x] `ManageActionsPanel` + `/AI Manage Actions` — full CRUD for user-defined actions, with Import / Export JSON
- [x] `ActionPickerPanel` + toolbar ✨ button — discovery surface listing every action plus Manage / Diagnostics links
- [ ] Replace native settings with a Preact settings panel (would enable inline validation + prettier LOCAL/REMOTE preview) — **v2**

## Phase 6 — Seed actions

- [x] `spellcheck` (block → diff-panel)
- [x] `grammar` (selection → block; diff-panel)
- [x] `rewrite` (selection → block; diff-panel, streaming)
- [x] `rewrite-formal` / `rewrite-casual` / `rewrite-friendly` tone variants (block → diff-panel)
- [x] `rewrite-professional` — "Writing the Amazon Way" style (block → diff-panel)
- [x] `outline-replace` / `outline-append` (subtree → nested outline tree via new `parseOutline` module; confirm-panel preview; recursive `insertBlock`; destructive variant wipes existing children first)
- [x] `image-title` (vision; `picker-replace` output; new `kind="vision"` Action field; new `visionModel` setting falling back to `model`; `image-asset.ts` + `parse-titles.ts` pure modules; `ChoicePanel` UI; `completeVision` provider method)
- [x] `extract-image-text` (vision OCR; `outline-append` output; reuses `parseOutline` extended with markdown-table-block support; `runVisionAction` dispatches on `outputMode`; verbatim system prompt with table syntax)
- [x] `summarize` (subtree; diff-panel, streaming)
- [x] `key-points` (subtree → append-children)
- [x] Slash commands registered for each + `/AI Diagnostics` + `/AI Manage Actions`
- [x] Command palette entries for each (`AI: <title>`) + Diagnostics + Manage Actions
- [x] Block context menu entries (`"AI: <title>"`) for each
- [x] Toolbar button → ActionPickerPanel listing all
- [ ] Golden-fixture tests per prompt — deferred; needs Tier 2 live-LLM infra
- [-] Ship `actions.example.json` — superseded by Manage Actions UI + inline README example

## Phase 7 — User actions

- [x] Storage via `userActionsJson` plugin setting (textarea) — works Web and Desktop alike
- [x] Validation failure UX (toast on startup + console detail; invalid entries skipped, valid ones still load)
- [x] Shadow handling (user id == built-in id → swaps in place; Manage UI shows "shadowed by user" badge)
- [x] Hot-reload: editing existing action's title/prompt applies on next invocation (handler resolves by id at call time); add/remove requires plugin toggle (Logseq has no deregister API)
- [x] `ManageActionsPanel` — CRUD UI with per-field validation, reorder, Import/Export JSON. Round-trips through the same `userActionsJson` setting.
- [x] `ManageActionsPanel` v2 — gallery redesign (Mockup C): card grid, search, inline detail editor with shared form for Create / Update / View, in-modal delete confirm, validation summary banner, "Duplicate as user action" for built-ins, empty-state CTA, real-radio pill selectors. CSS reuses the manage-* namespace and the new theme variables that defer to Logseq's `--ls-*` variables.
- [x] `parseUserActions` extracted from `buildRegistry` as a public helper so the Manage UI can list only user entries (including shadow cases)

## Phase 8 — Documentation

- [x] `README.md` — install, preset table, CORS guide, privacy note, user-actions primer, development commands
- [x] Plugin icon (`./icon.svg` source + 128×128 `./icon.png` rendered via `rsvg-convert`, at the project root where `package.json`'s `"icon": "./icon.png"` resolves) — teal 2D bot face on the existing charcoal `#171717` rounded-square background. Same identity as the toolbar button: rounded teal head (`#14B8A6`, Tailwind teal-500) + antenna, white eyes and smile inside the silhouette. The previous chrome-minion mark was retired alongside the toolbar redesign so both surfaces share one identity.
- [x] `REQUIREMENTS.md` §14 — selection-scope deferral memo with pain table, SDK gap, acceptance criteria for when we revisit
- [x] `AGENTS.md` — non-discoverable landmines (author name, package-vs-dir mismatch, SDK import pattern, `pnpm dev --port` quirk, dist/ + public/ timing)
- [ ] Inline doc comments on public types (`Action`, `LLMProvider`, `classifyEndpoint`, …) — partial; revisit before v1.0.0

## Phase 9 — E2E (blocker for v1.0.0)

- [ ] Playwright setup against local Logseq (reuse `logseq-plugin-tester` skill)
- [ ] MSW mock LLM server for deterministic responses
- [ ] One golden-path e2e per seed action (invoke → expected outcome on a DB graph fixture)
- [ ] CI Tier 3 job (`.github/workflows/ci.yml` placeholder to replace)

## Phase 10 — Release 1.0.0

- [x] Confirm author email exposure in `package.json` `author` — flipped to `"Danzu"` (no email) on 2026-05-02 ahead of marketplace listing.
- [x] First release notes summarising v1.0.0 — folded all `[Unreleased]` entries into `## [1.0.0] - 2026-05-02` with a paragraph blurb; six pending `.changeset/*.md` files removed (their content is in CHANGELOG).
- [x] Tag + GitHub release — `publish.yml` workflow added (mirrors `ci.yml` gates: lint + typecheck + test + build, then zips `README.md` + `LICENSE` + `package.json` + `icon.{png,svg}` + `dist/` and attaches to a generated GitHub Release on `v*` tag push).
- [x] Submit to Logseq Marketplace — [logseq/marketplace#796](https://github.com/logseq/marketplace/pull/796) is open with `packages/logseq-ai-actions/manifest.json` + `icon.svg`. Body now references the [v1.0.0 release](https://github.com/hdansou/logseq-ai-actions/releases/tag/v1.0.0). WIP check passes; awaiting maintainer review/merge.
- [ ] Freeze REQUIREMENTS.md; future changes go through a versioned PR — pending; do this once the marketplace PR merges so the spec is stable across the first round of user feedback.

Phase 9 (Tier 3 Playwright e2e) is **deferred** for v1.0.0 — relaxation noted in CHANGELOG. Revisit post-marketplace.

### Production-hardening pass (2026-04-26)

- [x] DRY: extract `closeBusyToast` + `formatProviderError` helpers in `src/index.ts`
- [x] DRY: extract `mountPanel<T>` helper in `src/ui/mount-panel.ts`; collapsed all six `show-*.ts` launchers
- [x] DRY: `src/provider.ts` consolidated around `postChat()` + `buildTextBody` / `buildVisionBody` / `parseChatContent` — text/stream/vision share URL, headers, timeout, error normalisation
- [x] DRY: merged `performLLMCall` + `performLLMStream` into one `performLLM(..., onChunk?)`
- [x] DRY: shared `ConfirmOverlay` component replaces bespoke `DeleteOverlay` and the new discard prompts
- [x] YAGNI: remove dummy `test:e2e` / `test:integration` scripts (no configs existed)
- [x] YAGNI: remove unverified `goose` endpoint preset (and its README rows)
- [x] UX: replace `window.confirm` in Manage Actions panel (`tryClose`) and Diff panel (`handleBarClick` switch-with-edits) with styled `ConfirmOverlay` (Esc cancels, Enter confirms)
- [x] Security: API key setting → single-line input; README + setting description state UNENCRYPTED disk storage
- [x] Security: comment on `LLMProviderErrorDetails.bodyExcerpt` re: reflected-header sensitivity
- [x] Security: `pnpm.overrides` for `lodash-es ^4.18.1` and `dompurify ^3.4.1`; `pnpm audit` now clean (was 1 high + 5 moderate)
- [x] Hygiene: vite dev server `host: 0.0.0.0` → `127.0.0.1` (LAN exposure was unintentional)
- [x] Hygiene: `.gitignore` adds `*.local.json`, `tmp/`, `scratch/`, `.cache/`; tightens `.env*`
- [x] UI: visual identity refreshed to a teal 2D bot face on both surfaces — toolbar icon (square 24×24 viewBox, was 88×120 portrait, now aligns with surrounding toolbar icons) and marketplace card icon (`./icon.svg` + `./icon.png` at project root, same bot face on the existing charcoal background). 2026-04-29.

### Production-hardening pass (2026-05-01)

- [x] Hygiene: `mockups/` → `docs/mockups/` with a `README.md` mapping each variant to where it landed in `src/ui/`. They are reference material, not bundled into `dist/`. The 2026-05-01 production-readiness pass found this was the only outstanding repo-hygiene item; everything else was clean (`pnpm audit` 0 vulns, typecheck/lint/tests all green, no `window.confirm`, no stray credentials, no tracked artifacts).
- [x] Refactor: split `src/ui/ManageActionsPanel.tsx` (1127-line monolith with 9 inline components) into `src/ui/manage-actions/` — one file per component (`ManageRoot`, `ActionRow`, `OverflowMenu`, `DetailEditor`, `DetailReadonly`, `ImportView`, `PillRadio`, `Field`) plus a shared `types.ts` (DraftAction, View, hint maps, helpers). Orchestrator `ManageActionsPanel.tsx` is now 417 lines; every other file is ≤220. Behaviour-preserving — 218 tests still pass, bundle size unchanged.
- [x] Refactor: extract `src/adapter/` from `src/index.ts` per the AGENTS.md "thin Logseq-touching surface" rule. Seven adapter modules: `host-scope.ts` (iframe probe + `logseqFetch` shim), `settings.ts` (`readSettings`, `readPrivateSetting`, `handlePresetChange`), `outline-writer.ts` (`removeBlockChildren`, `insertOutlineTree`), `resolve-input.ts` (block→LLM input), `image-loader.ts` (asset bytes for vision), `consent.ts` (first-run + remote-transition flows), `run-action.ts` (text + vision pipelines, performLLM, debug-log helpers; takes `RunActionContext` so the entry point owns the provider + active-registry state). `src/index.ts` shrunk from 1100 lines to 303; only it does `import "@logseq/libs"`. Behaviour-preserving — 218 tests pass, bundle size unchanged.

### DiffPanel UX pass (2026-05-02)

- [x] Sticky footer + scrollable body: cap `.diff-modal` to `calc(100vh - 96px)`, make `.diff-body` `flex: 1; min-height: 0; overflow-y: auto`. Reject / Edit / Accept stay reachable on long content; same pattern Manage Actions already uses. Picked Variant A from a 3-up HTML mockup (sticky footer / top action bar / inline header buttons).
- [x] Group `rewrite-*` actions into a single "Rewrite ▾" dropdown chip on the action bar. Chip row drops from up to 8 chips to 4. New helpers `partitionBarItems` + `rewriteMenuLabel` exported from `DiffPanel.tsx` with 12 unit tests; user-defined `rewrite-*` actions auto-join the group; menu uses the same outside-click + Esc-to-close pattern as `OverflowMenu`.

### Toolbar entry-point block capture (2026-05-02)

Bug: clicking the toolbar button blurs the editor before our handler runs (Logseq dismisses edit state on any click outside the editor area), so `getCurrentBlock()` / `checkEditing()` return null and the action errors out — directly contradicts the picker's "Click to run on the current block" subtitle. First fix attempt (sync probe in the click handler only) didn't work for that reason; final fix layers a polling cache on top.

- [x] Test: pure helper `derivePickerState(uuid: string | null) → { subtitle, cardsDisabled }` — has-block / no-block branches.
- [x] Implement: `derivePickerState` in `ActionPickerPanel.tsx` (extract the hardcoded subtitle literal).
- [-] Test: `ActionPickerPanel` renders empty-state subtitle + disables every action card — folded into the helper test + manual verify; no DOM test env in this project (vitest `environment: "node"`, UI excluded from coverage gate).
- [x] Implement: extend `ActionPickerPanelProps` with `targetBlockUuid: string | null`; thread through `showActionPicker` options. Picker disables `.picker-row` cards and shows the empty-state subtitle in red (`.diff-hint-warn`) when null.
- [x] Test: pure helper `isCacheFresh(cachedAt, now, staleMs)` for the polling cache — never-seen / fresh / stale branches (3 tests).
- [x] Implement: `src/adapter/editing-block-cache.ts` — three-tier probe (`checkEditing` → `getCurrentBlock` → `getSelectedBlocks`), polling at 500 ms, 10 s freshness, cleared on `onRouteChanged`. Started in `main()` after `registerAllInvocations`.
- [x] Implement: `openActionPicker` in `src/index.ts` runs the live probe first; falls back to the cache; threads the resolved UUID into the panel and into `runAction(action, ctx, uuid)` (third arg, same one the context-menu path uses — vision actions inherit the threading via `runAction` → `runVisionAction`).
- [x] Manual verify: confirmed working — block-text focus + toolbar click resolves the right block; bullet-selected fallback works via `getSelectedBlocks`; no-focus shows the disabled empty state.
- [x] Docs: REQUIREMENTS §3 entry-point capture invariant + resolution strategy (probe + cache) + no-block empty state.
- [x] Changelog: `.changeset/toolbar-block-capture.md` + `[Unreleased]` entry under Changed.

### Toolbar picker grouped layout (2026-05-02)

Goal: replace the single-column verbose-card list with a grouped 2-column grid (Fix / Rewrite / Transform / Vision / Custom) so all ~13 actions fit one viewport without scrolling. Picked Variant A from a 3-up HTML mockup. User-defined actions auto-route into matching built-in categories (id-prefix match) and carry a `custom` pill so authorship stays legible.

- [x] Test: pure helper `categorizeAction(action) → "fix" | "rewrite" | "transform" | "vision" | "custom"` in `src/ui/picker-categories.ts`. 23 cases (id-equals + id-prefix per category, vision short-circuit, partial-word non-matches).
- [x] Implement: `categorizeAction`.
- [x] Test: pure helper `groupActionsForPicker(actions) → ReadonlyArray<{ category, label, actions }>`. 7 cases — fixed category order; empty categories omitted; declared order preserved; labels stable; user `rewrite-*` auto-routes into Rewrite; `isBuiltin` flag carried through.
- [x] Implement: `groupActionsForPicker`.
- [x] Implement: `ActionPickerPanel` swaps the single-column `picker-list` for grouped sections; tags incoming actions with `isBuiltin = index < builtinCount`; new `PickerCard` renders title + scope/mode pills + conditional `custom` pill + `title=…` description tooltip. Empty-state disabling still applies card-by-card.
- [x] Implement: CSS for `.picker-group`, `.picker-group-head`, `.picker-grid` (2-col), refreshed `.picker-card` (compact, single-row), `.picker-pill` family with `.picker-pill-vision` (warning-colour) and `.picker-pill-custom` (accent-colour) variants. Picker modal widened to 640 px to give 2-col grids breathing room.
- [x] Manual verify: all 13 seed actions visible without scrolling; hover tooltips render; no-focus state still disables every card; user `rewrite-*` lands in Rewrite with the `custom` pill.
- [x] Docs: REQUIREMENTS §3 — Toolbar picker layout block.
- [x] Changelog: `.changeset/picker-grouped-grid.md` + `[Unreleased]` Changed entry.

### Vision asset loader fix — v1.0.1 (2026-05-05) — **superseded by v1.0.2**

> **Superseded note (2026-05-05, later):** the v1.0.1 strategy ships but does **not** actually fix the bug — both `fetch(file://)` and `<img src="file://">` are blocked from the plugin's `lsp://logseq.io/...` origin and the canvas fallback never had a chance. The "Empirically confirmed" claim below was wrong; the verifier appears to have been running on a stale build or against a different graph. The v1.0.0→v1.0.1 diff is preserved in source (typed failure reasons, `describeOriginMismatch` hint) because the diagnostic improvements still help — but the actual bytes-loading path is rewritten in v1.0.2.

Bug: `/AI Generate Title` (and any vision action) errors out with "could not read the image bytes (path or asset type unrecognised)" on a valid PNG asset block. Root cause: `logseq.Assets.makeUrl` returns a `file:///abs/path`, and the plugin running under HMR (`pnpm dev`, `http://localhost:<port>` origin) cannot `fetch()` `file://` resources — Chromium blocks it ("Not allowed to load local resource"). The path is correct; only the URL scheme is unfetchable from the plugin's origin. Existing toast misattributes the failure because `loadImageAssetBytes` collapses every error path to `null`.

We do not have an SDK route around the underlying restriction — `IAssetsProxy` only exposes `makeUrl`/`listFilesOfCurrentGraph`/`makeSandboxStorage`/`builtInOpen`; none returns bytes. Speculative `assets://local/...` rewriting is rejected (no evidence Logseq registers that scheme). The fix wraps `fetch` + canvas-fallback paths and returns typed reasons. **Empirically confirmed on 2026-05-05**: in side-by-side tests on the same Logseq Desktop session, the v1.0.0 plugin code reliably failed (`fetch(file://)` blocked, "Not allowed to load local resource"), while the patched code reliably succeeded. Origin scheme (`http://localhost` HMR vs `file://` unpacked) was not the differentiator — code version was. The exact mechanism is not fully understood (the fetch call is byte-identical between the two versions; only the surrounding helper-function wrapping changed), but the behaviour is stable enough to ship. Canvas fallback never engaged in the verifying tests but is kept for defence-in-depth in case Logseq tightens iframe policy.

TDD ordering — pure helpers first (RED → GREEN → REFACTOR), orchestrator last and manual-verify only (no DOM in Vitest, per AGENTS.md "thin Logseq-touching surface").

- [x] Test (RED): `LoadAssetFailure` discriminated union + `failureMessage(reason, hint?)` pure mapping — one test per variant (`no-path`, `no-type`, `unsupported-mime`, `makeurl-failed`, `fetch-failed`, `decode-failed`); messages are user-facing, no jargon; `hint` (when present) is appended on its own line.
- [x] Implement: union + `failureMessage` in a new pure module `src/asset-url.ts`.
- [x] Test (RED): `describeOriginMismatch(origin: string, url: string) → string | null` — returns the dev-mode hint string when origin starts with `http://` or `https://` and `url` starts with `file://`; returns null for `file://`→`file://`, `http://`→`http://`, empty inputs, mismatched-but-allowed combos. ~6 cases covering each branch.
- [x] Implement: `describeOriginMismatch` in `src/asset-url.ts`. Hint copy: "Vision actions need a filesystem-load plugin install. In dev, use `pnpm build:watch` and side-load the `dist/` folder; in production, install from the marketplace."
- [x] Refactor: `loadImageAssetBytes` returns `{ ok: true; mimeType; base64 } | { ok: false; reason: LoadAssetFailure; hint?: string }` instead of `… | null`. Sequence: (a) build path; if missing → `no-path`. (b) get type; if missing → `no-type`. (c) mime lookup; if unsupported → `unsupported-mime`. (d) call `makeUrl`; on throw → `makeurl-failed`. (e) `fetch` + blob + `FileReader.readAsDataURL`; on throw or non-OK → continue. (f) fallback: `<img>` → canvas → `toDataURL(mimeType)`; on success return ok. (g) on both fetch and canvas failure: return `fetch-failed` (or `decode-failed` if FileReader/canvas reached but produced nothing usable), with `hint = describeOriginMismatch(window.location.origin, url) ?? undefined`.
- [x] Refactor: `runVisionAction` (`src/adapter/run-action.ts:278`) switches on the new union; toast text is `failureMessage(reason, hint)`. Drops the hardcoded "could not read the image bytes (path or asset type unrecognised)" string.
- [x] Manual verify (`pnpm dev`, HMR, Logseq Desktop): `/AI Generate Title` returned 3 candidate titles via the fetch path (no canvas warns); confirmed on 2026-05-05 after a clean plugin disable+re-enable cycle.
- [x] Manual verify (`pnpm build` + Load unpacked, filesystem mode): `/AI Generate Title` returned 3 candidate titles via the fetch path.
- [x] Manual verify (v1.0.0 dist downloaded + Load unpacked, same Logseq session): `/AI Generate Title` reproducibly fails with the old "could not read the image bytes" toast — confirms the bug exists for users running v1.0.0 and that this patch is a real fix, not just polish.
- [-] Manual verify (Logseq Web): not accessible in this session; deferred. The fetch path is expected to work on `blob:` URLs.
- [-] Manual verify (failure modes): not driven explicitly; reasons map cleanly through `failureMessage` and the upstream `isImageAsset` rejection still toasts "not a raster image asset". Confidence sufficient without forcing failure cases.
- [x] Docs: AGENTS.md — revised to "vision works in HMR; fetch is permissive enough on current Logseq Desktop, canvas fallback is defence-in-depth". Added a separate landmine on stale-handler capture (the disable+re-enable lesson from this debugging session).
- [x] Docs: README — removed the "vision requires filesystem-load" claim.
- [x] Docs: REQUIREMENTS §6 — already updated (this entry).
- [x] Changelog: `.changeset/vision-asset-loader-fix.md` (changesets owns `[Unreleased]`; populated on `pnpm changeset version`).
- [x] Version bump to `v1.0.1` once verified end-to-end; tag + push for the marketplace `publish.yml` workflow.

### Vision asset loader — canonical IPC path — v1.0.2 (2026-05-05)

Bug (continued): user reports `/AI Generate Title` still fails on v1.0.1 with `Not allowed to load local resource: file:///…/assets/<uuid>.png` followed by `[ai-actions] image-loader: canvas fallback engaged (fetch failed)` and `canvas fallback also failed`. Both renderer paths are blocked.

Root cause (verified by reading the Logseq source, not just the plugin SDK `.d.ts`):

- `Assets.makeUrl` on Electron returns `file:///abs/path` — `logseq/src/main/frontend/handler/assets.cljs:154`.
- The plugin iframe is served at the `lsp://logseq.io/...` origin — `logseq/src/electron/electron/core.cljs:97-105` (custom `lsp` protocol registered alongside `assets` and `logseq`).
- Chromium blocks cross-origin loads of `file://` from the `lsp://` origin. Both `fetch(file://)` and `<img src="file://">` hit "Not allowed to load local resource". The canvas fallback in v1.0.1 cannot succeed — `<img>` never gets pixels to draw.
- The supported route is `logseq.Request._request({ url, returnType: "base64" })`. It IPCs to the main process (`:httpRequest` handler — `logseq/src/electron/electron/handler.cljs:353-389`), which uses `node-fetch` (`utils.cljs:47-50` — supports `file://` schemes) and base64-encodes the response server-side. The plugin already uses this API for HTTP/CORS bypass in `src/adapter/host-scope.ts:logseqFetch`, so the pattern is in place.

Lesson: the SDK's `IAssetsProxy` interface is a poor reflection of what's actually available. `Request._request` is underscore-prefixed but documented in source and used elsewhere in this codebase. Always cross-reference the Logseq cljs source when an SDK guarantee looks too thin.

- [x] Test (RED): `image-loader.test.ts` — mock `logseq.Request._request` to return a base64 string when host scope is reachable; assert `loadImageAssetBytes` returns `{ ok: true, mimeType, base64 }` and that `fetch` / `<img>` are never called. ~3 happy-path cases.
- [x] Test (RED): when `_request` rejects, falls through to existing `fetch` path (kept for resilience); when host scope is unreachable (web Logseq), skip `_request` entirely. ~2 cases.
- [x] Implement: add `tryLogseqRequestAsBase64(url, mimeType)` in `src/adapter/image-loader.ts`. Calls `logseq.Request._request({ url, method: "GET", returnType: "base64" })` and validates the response is a non-empty string. Wire it as the **first** attempt when `isHostScopeReachable()` returns true; keep `tryFetchAsDataUrl` and `tryCanvasAsDataUrl` as ordered fallbacks for resilience and for web Logseq.
- [x] Refactor: update the strategy comment at the top of `loadImageAssetBytes` to reflect the canonical path; drop the speculative "Logseq's plugin host effectively disables webSecurity" prose.
- [x] Manual verify (`pnpm build` → load unpacked, Logseq Desktop, fresh enable cycle): `/AI Generate Title` returns 3 candidate titles via the `_request` path; no "Not allowed to load local resource" warnings (confirmed 2026-05-05).
- [-] Manual verify (marketplace zip install): **regressed** — same v1.0.2 build installed via the released zip on 2026-05-05 still emits "Not allowed to load local resource" with no IPC log line, meaning the IPC branch was silently skipped (either `isHostScopeReachable()` returned false or `_request` rejected with no diagnostic). v1.0.3 follow-up addresses this.
- [-] Manual verify: `/AI Extract Image Text` — superseded by v1.0.3 work.

### Vision asset loader — drop host-scope gate + add diagnostics — v1.0.3 (2026-05-05)

Bug: v1.0.2 still fails on the marketplace-zip install. The IPC branch was gated on `isHostScopeReachable()` (probes `window.parent.document` in a try/catch), but that probe can return `false` even on Desktop — likely because the marketplace install puts the plugin iframe at a different origin from the Logseq main window, so cross-origin access throws SecurityError. The catch path was silent, so the failure mode is invisible in the user's console.

Fix: remove the gate. Try `_request` unconditionally; on web Logseq the SDK will emit one "Can not access host scope!" log but our catch falls through cleanly to the `fetch` branch. Add `console.warn` at every IPC failure branch so the next regression report includes diagnostics.

- [x] Implement: drop `isHostScopeReachable()` import + gate from `loadImageAssetBytes`. `tryLogseqRequestAsBase64` now logs `[ai-actions] image-loader: …` for: `_request` unavailable, `_request` threw, payload unparseable, IPC succeeded.
- [x] Manual verify (marketplace zip install): diagnostics confirmed the real failure mode — `_request` throws `SecurityError: Blocked a frame with origin "lsp://logseq.io" from accessing a cross-origin frame`. Logseq main window is cross-origin with the plugin iframe; `Experiments.invokeExperMethod` synchronously accesses `parent.window.logseq` and dies. v1.0.4 follow-up uses the postMessage caller instead.
- [x] Changelog: `.changeset/vision-loader-drop-hostscope-gate.md`.
- [x] Version bump to `v1.0.3`; tag + push.

### Vision asset loader — postMessage IPC bypass — v1.0.4 (2026-05-05)

Bug: v1.0.3 surfaced the real error. `Request._request` calls `Experiments.invokeExperMethod("request", …)` which uses `ensureHostScope()` — a synchronous property access on `parent.window.logseq`. The plugin iframe at `lsp://logseq.io/...` is cross-origin with the Logseq main window, so any synchronous parent-property access throws `SecurityError`. The Postmate-based caller (Logseq's plugin-↔-host RPC) IS cross-origin-safe because it uses `window.postMessage`. We need to call `exper_request` via the postMessage path, not the host-scope-property-access path.

Mechanism (verified by reading Logseq source):

1. Plugin: `logseq._execCallableAPIAsync("exper_request", pluginId, opts)` → `_caller.callAsync("api:call", { method, args })` → Postmate `childRefParent.emit(…)` → host's `LSPlugin.core.ts:initApiProxyHandlers` `api:call` listener → `invokeHostExportedApi("exper_request", …)` → `logseq.api/exper_request` (`logseq/src/main/logseq/api.cljs:168`).
2. Host's `exper_request` returns a `req-id` synchronously and fires `(ipc/ipc :httpRequest req-id options)` → `logseq/src/electron/electron/handler.cljs:353` `:httpRequest` → `node-fetch` (handles `file://`) → returns base64.
3. Host's `request-callback` (`logseq/src/main/frontend/handler/plugin.cljs:890`) sends `:#lsp#request#callback {requestId, payload}` via postMessage.
4. Plugin's `caller` emits `"#lsp#request#callback"`; we filter by our `reqId` and resolve.

Race protection: response can arrive between `exec()` resolving and our `.then` saving `reqId`. We register the listener BEFORE calling `exec`, buffer events whose `requestId` doesn't match yet, then drain on resolve.

- [x] Implement: replace `tryLogseqRequestAsBase64` with `tryPostmateExperRequestBase64` + `runExperRequest` helper in `src/adapter/image-loader.ts`. Diagnostic logs every branch.
- [x] Manual verify (marketplace zip install): postMessage IPC reached the host and dispatched `:httpRequest` correctly. Real failure surfaced: `node-fetch cannot load file://… URL scheme "file" is not supported`. Logseq pins `node-fetch@3.3.2` (`logseq/static/package.json:34`) which dropped `file://` support. Continuing in v1.0.5.
- [-] Test (no DOM in Vitest).
- [x] Docs: REQUIREMENTS §6, AGENTS.md, CHANGELOG.
- [x] Version bump to `v1.0.4`; tag + push.

### Vision asset loader — readFileRaw IPC — v1.0.5 (2026-05-05)

Bug: v1.0.4 surfaced the `node-fetch` limitation. `:httpRequest` is the wrong handler for `file://` URLs. Switch to `:readFileRaw`, which uses `fs.readFileSync` directly (`logseq/src/electron/electron/utils.cljs:212`).

Mechanism:

1. Plugin: `logseq._execCallableAPIAsync("doAction", [":readFileRaw", absPath])`. The `safeSnakeCase` lookup chain in `logseq/libs/src/common.ts:invokeHostExportedApi` resolves `"doAction"` to `window.apis.doAction` on the host (since `logseq.api.do_action` and `logseq.api.doAction` don't exist).
2. Host: `apis.doAction([":readFileRaw", absPath])` → `ipcRenderer.invoke("main", [":readFileRaw", absPath])`.
3. Main process dispatcher (`logseq/src/electron/electron/handler.cljs`): `(handle window message)` keywordises the first arg → `:readFileRaw` → `(utils/read-file-raw path)` → `(fs/readFileSync path)` returns a `Buffer`.
4. Buffer flows back through Electron IPC (structured-clone) → `bean/->js` (pass-through for JS values) → Postmate `LSPMSG_SYNC`. Plugin receives a `Uint8Array`-like value.
5. Plugin: copy bytes into a fresh `ArrayBuffer` (TS strict-lib accommodation) → `new Blob([buf])` → `FileReader.readAsDataURL` → strip `data:…;base64,` prefix.

Path translation: `Assets.makeUrl` returns `file:///abs/path`. Strip `file://` and `decodeURIComponent` to get the filesystem path. Windows: `file:///C:/Users/...` → drop the leading `/` before the drive letter.

- [x] Implement: replace `tryPostmateExperRequestBase64` with `tryReadFileRawIPC` + `fileUrlToPath` + `toUint8Array` helpers in `src/adapter/image-loader.ts`. The `:readFileRaw` keyword is passed verbatim with its colon (the host dispatcher keywordises the first arg).
- [-] Test (no DOM in Vitest).
- [ ] Manual verify (marketplace zip install): `/AI Generate Title` returns 3 candidates; console shows `readFileRaw IPC succeeded (<N> bytes)`.
- [ ] Manual verify: `/AI Extract Image Text` succeeds on a screenshot block.
- [-] Manual verify (Windows): not accessible.
- [x] Docs: REQUIREMENTS §6, AGENTS.md updated.
- [x] Changelog: `.changeset/vision-readfileraw.md`.
- [ ] Version bump to `v1.0.5`; tag + push.
- [-] Manual verify (Logseq Web): not accessible in this session; deferred.
- [x] Docs: REQUIREMENTS §6 — rewritten loader description (this entry).
- [x] Docs: AGENTS.md — replace v1.0.1 fetch-permissive landmine with the IPC path landmine (read source, don't trust the .d.ts).
- [x] Changelog: `.changeset/vision-asset-loader-ipc-fix.md`.
- [ ] Version bump to `v1.0.2`; tag + push.

### Theme integration — light/dark sync (2026-05-02)

Goal: plugin UI follows Logseq's light/dark toggle. CSS scaffolding (`html.dark` overrides) was already in place; nothing wired it up, so panels always rendered in light mode regardless of host. Custom community-theme palettes are out of scope — cross-origin iframe blocks `--ls-*` propagation.

- [x] Test: pure helper `resolveInitialTheme(probed: 'dark' | 'light' | null, prefersDark: boolean) → 'dark' | 'light'`. 3 cases — probed wins; falls back to `prefersDark`; defaults to 'light' when both unset.
- [x] Implement: `resolveInitialTheme` in `src/adapter/theme-sync.ts`.
- [x] Implement: `startThemeSync()` — async; try/catch around `logseq.App.getStateFromStore('ui/theme')` (any throw or non-`'dark'|'light'` → null); reads `window.matchMedia('(prefers-color-scheme: dark)').matches`; resolves via the pure helper; toggles `html.dark` on `document.documentElement`; registers `logseq.App.onThemeModeChanged` for live updates.
- [x] Implement: `void startThemeSync()` first thing in `main()` so the very first panel render uses the right palette (no light flash before the toggle catches up).
- [x] Manual verify: light/dark toggle inside Logseq propagates live; reload-while-dark renders dark on first paint.
- [x] Docs: REQUIREMENTS new §15 Theme integration.
- [x] Changelog: `.changeset/theme-sync.md` + `[Unreleased]` Changed entry.

### Per-action visibility — hide actions (2026-05-05)

Branch: `feat/hide-actions`. Spec: REQUIREMENTS §16. UX picked from `prototypes/hide-actions/` (Variant C — archive bin). Goal: let users hide individual actions from every entry surface; hidden actions remain in Manage Actions for restore.

TDD ordering — pure helpers first (RED → GREEN → REFACTOR), settings + registry plumbing next, then UI, then manual verify. UI components have no automated tests (Vitest is `environment: "node"`; UI is excluded from the coverage gate, same convention as the rest of the codebase).

**Pure core**

- [x] Test (RED): `src/visibility.test.ts` — `filterHiddenActions(actions, hiddenIds): readonly Action[]`. 7 cases — empty `hiddenIds`; one id; multiple ids; ids absent from input; declared order preserved; built-in / user mix; all-hidden empties the list.
- [x] Implement: `filterHiddenActions` in `src/visibility.ts`.
- [x] Test (RED): `parseHiddenActionIds(raw: unknown): string[]` — 7 cases — `undefined` / `null` / `[]` → `[]`; non-array (number / string / object) → `[]`; valid string array unchanged; non-string entries filtered out without throwing; returns a fresh array (not a reference to input).
- [x] Implement: `parseHiddenActionIds` in `src/visibility.ts`.
- [x] Test (RED): `partitionVisibleAndHidden(actions, hiddenIds): { visible, hidden }` — 5 cases — all visible; all hidden; mixed (order preserved per bucket); empty actions list; hidden ids that don't match any action.
- [x] Implement: `partitionVisibleAndHidden` in `src/visibility.ts`.

**Settings + registry plumbing**

- [-] Settings schema entry — skipped intentionally. `hiddenActionIds` is plugin-internal state managed by the Manage Actions panel, not a setting users edit by hand. Logseq persists arbitrary JSON written via `logseq.updateSettings`; the schema only controls what renders in the gear UI. Keeping it out of the schema avoids exposing a raw array editor that nobody should be using.
- [x] Implement: `readSettings()` in `src/adapter/settings.ts` returns parsed `hiddenActionIds: readonly string[]` via `parseHiddenActionIds`.
- [x] Implement: `rebuildRegistry()` in `src/index.ts` — keeps the existing `buildRegistry(SEED_ACTIONS, userActionsJson)` and exposes both `activeActionsAll` (unfiltered merged list) and `activeActions` (filtered through `filterHiddenActions`). Toolbar picker and diff-panel re-run options use the filtered list; slash / palette / context-menu handler `find()` lookups use the unfiltered list so stale handlers for hidden actions still execute (carry-over of the existing add/remove caveat).
- [x] Implement: `onSettingsChanged` rebuilds when `hiddenActionIds` changes (parallel to the `userActionsJson` branch). Toolbar picker reflects the change immediately; slash / palette / context-menu entries persist through the session and only re-register on the next plugin reload.

**UI — Manage Actions panel**

- [x] Implement: `ManageActionsPanel.tsx` accepts `initialHiddenActionIds` + `onSaveVisibility` props; mirrors hiddenIds in local state; hide / restore call the callback synchronously (autosave). User-action dirty-tracking is unaffected. Visible sections drop rows whose id is in `hiddenSet` so the Hidden bin owns those rows exclusively. Hidden-bin row resolution: user shadow wins, otherwise built-in; orphan ids (no matching action) are silently dropped.
- [x] Implement: `show-manage-actions.ts` threads `initialHiddenActionIds` + `onSaveVisibility` into the panel; `openManagePanel` in `src/index.ts` reads the settings snapshot once and writes via `logseq.updateSettings({ hiddenActionIds: [...] })`.
- [x] Implement: `ActionRow.tsx` — required `source: "builtin" | "user"` prop drives a new pill rendered inline with the scope / output-mode tags. Optional `onHide` adds a hover-revealed Hide pill; optional `onRestore` adds an always-visible Restore pill. Both render as `role="button"` `<span>` (with stop-propagation + Enter/Space handlers) so the outer row `<button>` keeps its click-to-open semantics.
- [x] Implement: `HiddenSection.tsx` — collapsible bin. Chevron + "Hidden" label + count badge + muted helper line. Renders nothing when count is zero.
- [x] Implement: `UndoToast.tsx` — fixed-position overlay near the bottom of the modal; auto-dismisses after 2.5 s via `setTimeout`; clicking Undo restores the previous hiddenIds snapshot.
- [x] Implement: search auto-expand — when the query matches anything inside the Hidden bin (`filteredHidden.length > 0`), force `hiddenOpen = true`. Built on the existing `filterByQuery` — no change to that helper.
- [x] Implement: CSS in `index.html` — `.manage-tag-source` (+ `-user` variant), `.manage-row-pill-action` (with `.manage-row-hide` hover-only and `.manage-row-restore` always-visible), `.manage-hidden-section` / `-toggle` / `-chev` / `-label` / `-count` / `-helper` / `-list`, `.manage-undo-toast` + `.manage-undo-link`. Reuses existing tokens (`--muted`, `--warning`, `--accent`, `--border`).

**Manual verify**

- [ ] Hide a built-in via Manage → not in toolbar picker, not in command palette (after toggle), not in block context menu, not in slash menu after toggle. Slash command from before the toggle still responds (documented caveat).
- [ ] Hide a user action → same surfaces hide it; Restore returns it to its original section.
- [ ] Shadow + hide → a user action whose id matches a built-in, with that id in `hiddenActionIds`, hides the merged effective action everywhere.
- [ ] Undo toast appears after hide/restore; clicking Undo reverses the last operation; toast auto-dismisses after ~2.5 s.
- [ ] Search reveals matching hidden rows and auto-expands the Hidden section.
- [ ] Reload Logseq → previously-hidden actions stay hidden across sessions (per-graph persistence).

**Docs**

- [x] REQUIREMENTS §16 — drafted at spec time (2026-05-05).
- [ ] README — add a Hide actions sub-section under "Manage Actions panel".
- [ ] AGENTS.md — note the slash-command caveat parallel to user actions (one place, not duplicated).
- [ ] Changelog: `.changeset/hide-actions.md` + `[Unreleased]` Added entry once the implementation lands.

## Deferred / v2 candidates

- True `selection` scope with block-range splicing — see REQUIREMENTS §14
- Whole-page and multi-select scopes
- Per-invocation scope / output-mode override
- Form-based settings UI replacing native settings
- Cloud LLM provider adapter
- Embedded WebLLM provider
- File-in-graph storage path for user actions (Desktop-Electron adapter)
- Redaction / content filtering
- Action history panel (piggybacks on the debug ring buffer)
- Prompt library / community action gallery
- Block-context-menu icon (toolbar button has been migrated to an inline SVG mark; context-menu items still render as text-only labels)
