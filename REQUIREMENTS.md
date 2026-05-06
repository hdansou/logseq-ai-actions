# `logseq-ai-actions` — Requirements (v1)

Status: **Signed off 2026-04-23. Seed set and output-mode taxonomy extended 2026-04-25** (4 tone-rewrite variants, 2 outline modes + actions, vision support with `kind` field + `picker-replace` mode + 2 vision actions). Changes to this document must land via a PR and be reflected in `CHANGELOG.md`.

## 1. Purpose

A Logseq plugin that runs AI-driven actions on blocks. v1 ships a curated seed set covering text transformation (spellcheck, grammar, rewrite + tone variants, summarize, key-points, nested outlines) and image-asset analysis (title generation, OCR), plus an extension mechanism so new actions can be added without touching plugin source. Privacy-first: targets small, locally-hosted LLMs by default; vision actions work with multimodal models like `qwen3.5:2b`.

**Graph target (v1):** Logseq **DB graphs only.** File-based graph support is out of scope for v1 (revisit in v2 based on user demand). Manifest declares `supportsDbGraph: true` and either omits or explicitly sets `supportsFileGraph: false`.

## 2. Model hosting

- Plugin talks to a **user-run OpenAI-compatible HTTP endpoint**.
- Presets: **LM Studio (primary default)**, **Ollama (secondary)**, **Goose (candidate — verify OpenAI-compat at scaffold time)**, **Custom**.
- No embedded model, no cloud API in v1.
- Behind a single `LLMProvider` interface so future backends (WebLLM, cloud, …) drop in cleanly.

## 3. Entry points

All five Logseq surfaces, driven by one action registry:

- Block context menu (`"AI: <title>"` per action) — **shipped**
- Slash commands (`/AI <action>`) — **shipped**
- Command palette (`logseq.App.registerCommandPalette`, `"AI: <title>"`) — **shipped**
- Keyboard shortcuts — ships *for free* with palette entries (Logseq's keymap UI lets users bind any palette command); no default bindings
- Toolbar button (✨ → `ActionPickerPanel`) — **shipped**

One `Action` declaration auto-wires every surface. Adding an action is a **single-file change**.

### Entry-point block capture

Entry points that open a picker before running the action (currently only the toolbar button) must **resolve the focused block UUID at click time** and thread it into `runAction(action, ctx, explicitBlockUuid)`. The toolbar click itself blurs the editor (Logseq dismisses edit state on any click outside the editor area), so a synchronous probe inside the click handler usually returns null even when the user clearly had a block focused a moment ago — the bug behind the picker's "Click to run on the current block" promise.

Resolution strategy (defined in `src/adapter/editing-block-cache.ts`):

1. Synchronous three-tier probe at click time: `checkEditing()` → `getCurrentBlock()` → `getSelectedBlocks()[0]`. The first non-null wins.
2. Fallback to a polling cache populated every 500 ms via the same probe. UUID expires after 10 s of inactivity and is cleared on `onRouteChanged` so cross-page leaks are impossible.

Picker behaviour when both the live probe and the cache come back empty:

- All action cards render disabled (greyed, click swallowed) — kept visible for discoverability rather than hidden.
- The header subtitle changes from "Click to run on the current block" to **"Place your cursor in a block first."**
- Footer entries (Close, Diagnostics, Manage actions) stay enabled — they don't need a block.

Slash commands, context-menu items, and assignable shortcuts already carry their own block context (cursor-in-block invariant for slash; explicit UUID for context menu) and are unaffected. Same constraint applies to any future entry that funnels through a picker.

### Toolbar picker layout

Actions in the toolbar picker are grouped into five fixed categories so all built-in seed actions plus typical user actions fit one viewport without scrolling:

- **Fix** — `spellcheck`, `grammar`, or any id starting with `spellcheck-` / `grammar-`.
- **Rewrite** — `rewrite` or any id starting with `rewrite-` (matches the diff-panel action bar's Rewrite dropdown grouping).
- **Transform** — `summarize`, `key-points`, or any id starting with `summarize-` / `key-points-` / `outline-`.
- **Vision** — any action with `kind: "vision"` (id-pattern checks above are skipped — vision dispatch is a runtime concern, not a label).
- **Custom** — anything else (typically user-defined actions that don't follow a built-in naming convention).

User-defined actions auto-route into a built-in category when their id matches a prefix above, so a user-authored `rewrite-snarky` lives next to the seed Rewrite tones rather than in a separate Custom bucket. To keep authorship legible inside built-in categories, **user-defined cards carry an additional `custom` pill** alongside the scope/mode pills; built-in cards are unmarked. Cards in the Custom category also carry the pill (consistent rule: any user action shows it regardless of section).

Visual contract:

- Each non-empty category renders as a section: small uppercase header with a count, followed by a 2-column grid of compact cards.
- Card content: title + 1–2 monospace pills (scope + output mode; vision pill highlighted) + optional `custom` pill.
- Full description is rendered as a hover tooltip (HTML `title` attribute), not inline — keeps cards single-row.
- Empty categories are not rendered.
- Empty-state behaviour from the previous subsection still applies: cards disabled, subtitle changes to "Place your cursor in a block first."

Manage Actions remains the surface where users browse full descriptions and edit user actions.

## 4. Action scopes (v1)

- `selection` (highlighted text in a block)
- `block` (current block)
- `subtree` (block + descendants, flattened with indent markers)
- **Not in v1:** whole-page, multi-select.
- **Fixed per-action defaults.** No per-invocation override in v1.

## 5. Seed actions

| Action | Scope | Kind | Output mode | Notes |
|---|---|---|---|---|
| `spellcheck` | block | text | diff-panel | Surgical: preserves proper nouns, code, URLs, wikilinks, tags. |
| `grammar` | selection → block | text | diff-panel | Logseq-aware: respects bullet fragments, contractions, lowercase starts. |
| `rewrite` | selection → block | text | diff-panel | Streaming. |
| `rewrite-formal` | block | text | diff-panel | Formal / business register. |
| `rewrite-professional` | block | text | diff-panel | "Writing the Amazon Way" — declarative, active voice, no weasel words. |
| `rewrite-casual` | block | text | diff-panel | Conversational. |
| `rewrite-friendly` | block | text | diff-panel | Warm without forced enthusiasm. |
| `summarize` | subtree | text | diff-panel | TL;DR; written into parent, children preserved. Streaming. |
| `key-points` | subtree | text | append-children | 3–7 points as new children. |
| `outline-replace` | subtree | text | outline-replace | Destructive: deletes existing children before inserting the generated outline tree. |
| `outline-append` | subtree | text | outline-append | Non-destructive: appends the generated outline alongside existing children. |
| `image-title` | block | vision | picker-replace | Image asset blocks only. Three candidate titles; chosen value writes to `:block/title`. |
| `extract-image-text` | block | vision | outline-append | Image asset blocks only. OCR; preserves well-formed markdown tables as standalone blocks. |

## 6. Output handling

Six output modes; each action declares its default:

- **`replace`** — overwrite the block's text with the LLM output.
- **`diff-panel`** — show a side panel with original vs proposed; user accepts / rejects / edits before applying. Modal is height-capped to the viewport with header, action bar, and Reject / Edit / Accept footer all pinned; only the diff body scrolls. Action bar collapses related text-transform tones (currently the four `rewrite-*` variants alongside the bare `rewrite`) into a single dropdown chip so the row stays scannable as more actions are added.
- **`append-children`** — append the LLM output as *new child blocks* under the current block (one line per child). Non-destructive.
- **`outline-replace`** — parse the LLM output as a nested markdown outline (with table-block support); delete the block's existing direct children; insert the parsed tree as the block's new subtree. Block's own text is preserved. Destructive — confirm panel warns.
- **`outline-append`** — same parser as `outline-replace`, but appends without deleting. Non-destructive. Used for OCR output and for the non-destructive outline action.
- **`picker-replace`** — show the LLM-returned candidates in a `ChoicePanel` (1/2/3 hotkeys, Esc cancels). On accept, replace the block's text with the chosen candidate. Generic — first user is `image-title`, but reusable for text-action flows that want "show N options, user picks one".

Additional behaviours:

- One-click undo (in-session revert of pre-action content).
- Streaming updates live into block (replace mode) or into "proposed" side (diff panel).
- Vision-kind actions take an entirely separate runtime path (`runVisionAction`) that reads asset bytes from `assets/<uuid>.<ext>`, base64-encodes them, and POSTs an OpenAI-multimodal `messages` body to the same `/v1/chat/completions` endpoint. They dispatch on `outputMode` for the write step (picker-replace vs. outline-append at present).
- The asset-byte loader (`src/adapter/image-loader.ts`) routes through `logseq.Request._request({ url, returnType: "base64" })` on Desktop. `Assets.makeUrl` returns `file:///abs/path` on Electron (`logseq/src/main/frontend/handler/assets.cljs:154`), and the plugin iframe runs at the `lsp://logseq.io/...` origin (`logseq/src/electron/electron/core.cljs:97-105`), so `fetch(file://)` and `<img src="file://">` both hit Chromium's "Not allowed to load local resource". `_request` IPCs to the main process (`logseq/src/electron/electron/handler.cljs:353-389`), which uses `node-fetch` (`utils.cljs:47-50` — supports `file://`) and base64-encodes server-side. This is the canonical, documented-in-source path; renderer-side `fetch` and `<img>+canvas` are kept only as fallbacks for Logseq Web (where host scope is unreachable and `makeUrl` returns a `blob:` URL that direct `fetch` can read).
- Returns a discriminated `{ ok: true, … } | { ok: false, reason, hint? }` (reasons: `no-path`, `no-type`, `unsupported-mime`, `makeurl-failed`, `fetch-failed`, `decode-failed`) so `runVisionAction`'s toast names the actual failure instead of the generic "path or asset type unrecognised". Pure `describeOriginMismatch(origin, url)` adds a last-resort hint when every read path fails and the plugin is on an HTTP origin reading a `file://` URL. **Lesson from v1.0.1 (superseded by v1.0.2):** the SDK does have a documented bytes-read path — `Request._request` with `returnType: "base64"`. Earlier we claimed `IAssetsProxy` was the only surface and shipped a fetch + `<img>+canvas` strategy; both paths are blocked on Desktop and the "empirical verification" was wrong (canvas fallback never had a chance). Always read Logseq's source, not just the plugin SDK `.d.ts`, when an SDK guarantee looks too thin.

## 7. Extensibility

- **Hybrid.** Built-in seed actions in TS source; user-defined actions stored as a JSON array in the plugin's `userActionsJson` setting. The file-in-graph path (`logseq/plugins/logseq-action/actions.json`) is deferred behind a Desktop-Electron adapter — the settings-stored approach works identically on Logseq Web and Desktop today.
- Both share the same **Zod schema** (`ActionSchema`).
- Two authoring surfaces, round-tripping through the same setting:
  1. **`ManageActionsPanel`** (primary) — opened via `/AI Manage Actions`, the palette entry, or the toolbar picker's footer. **Gallery design (Mockup C, redesigned 2026-04-25):** card grid of all actions with built-ins shown read-only at top and user actions below; toolbar with search (filters by title / id / description / prompt), `+ New action`, `Import JSON`, and `Copy all`; clicking a built-in opens a read-only inspect view with a `⧉ Duplicate as user action` button that auto-increments the new id; clicking a user card opens the inline editor (shared form for Create / Update / View) with pill-style scope and kind selectors, output-mode dropdown, validation summary at the top after a save attempt and per-field red borders live; delete is an in-modal confirmation overlay.
  2. **Native settings textarea** (power-user) — the `userActionsJson` field in the plugin's gear settings. Useful for scripting, migration, or hand-editing.
- Plugin rebuilds the registry on `onSettingsChanged` when `userActionsJson` changes. Editing an existing action's title / prompt / scope hot-reloads — the slash handler looks up its action by id at invocation time. Adding or removing an entry still requires a plugin toggle (Logseq has no slash-command deregister API).
- A user action whose `id` matches a built-in **shadows** the built-in (swap in-place at same slash-menu slot; Manage UI shows a "shadowed by user" badge).

## 8. Privacy, consent, endpoint trust

- **One-time first-run consent modal.** Plain language; one "Got it" button.
- **LOCAL/REMOTE endpoint labeling** everywhere the endpoint is visible.
  - Pure `classifyEndpoint(baseUrl)` — loopback (`localhost`, `127.0.0.1`, `::1`, `0.0.0.0`) → LOCAL, anything else → REMOTE (strict for v1; LAN ranges are REMOTE).
  - Colored badge (green LOCAL, amber REMOTE), same component everywhere.
  - One-time warning modal on LOCAL → REMOTE endpoint change.
- **Debug log.** Off by default. When enabled: in-memory ring buffer of last 50 requests, viewable in settings, "copy to clipboard" for bug reports. **Never written to disk.**
- **Redaction / content filtering.** Not in v1. README warns users not to invoke on content they don't want sent to their configured endpoint.

## 9. Testing (TDD)

| Tier | Purpose | Stack | Gate |
|---|---|---|---|
| 1 — Unit | Pure logic (registry, scope, classifier, diff, parsing) | **Vitest** + stubbed `fetch` | **80 % coverage, CI-blocking** |
| 2 — Integration | Live LLM endpoint; hot-reload; graph file watcher | Vitest, gated by `TEST_LIVE_LLM=1` | Nightly CI, no coverage gate |
| 3 — E2E | Slash → diff → accept golden paths in real Logseq | **Playwright** + MSW mock LLM | PRs to `main`, golden paths only |

**Discipline rule.** The Logseq-touching adapter stays **thin**; everything else is pure so Tier 1 covers it. A PR that adds Logseq-API-touching code without respecting this boundary should be rejected on review.

## 10. Tooling

- **Build:** Vite 8, vanilla config. `vite-plugin-logseq` is not needed — Logseq loads the plugin directly from the dev-server URL.
- **Package manager:** pnpm.
- **Lint + format:** Biome (single binary, replaces ESLint + Prettier).
- **UI framework:** Preact (React-compatible API, tiny runtime).
- **Validation:** Zod (runtime + inferred types).
- **Release:** changesets → automated `CHANGELOG.md` + versioning.
- **CI:** GitHub Actions.
- **Pre-commit:** `biome check --write` + `tsc --noEmit` via `simple-git-hooks` (or husky). Hooks never skipped.

## 11. Project hygiene

- `tasks.md` at repo root — primary task tracker.
- `CHANGELOG.md` — Keep a Changelog format, driven by changesets.
- `README.md` — setup, preset table, CORS guide, privacy note, user-actions primer pointing at the Manage UI.
- ~~`actions.example.json`~~ — superseded by the Manage Actions UI + README example snippet. Dropped.
- MIT license.
- Semantic versioning. **v1.0.0 release gate** — every runtime feature (seed actions, diff panel, preset picker, LOCAL/REMOTE label, first-run modal, Manage UI, streaming, all five entry points) is **shipped**. Remaining blockers: Tier 3 e2e tests (Phase 9) and release-prep checklist (Phase 10 — author + repo confirmation, first changeset, tag, marketplace submission).

## 12. Identity

- npm / marketplace name: `logseq-ai-actions`
- plugin id: `logseq-ai-actions`
- display title: **AI Actions**
- local dir: `logseq-action/` (intentional mismatch; documented in README)
- author: `Danzu <hdansou@gmail.com>` *(email exposure to be confirmed before release)*
- repo: `https://github.com/hdansou/logseq-ai-actions`
- license: MIT

## 13. Explicitly out of scope for v1

- Whole-page and multi-select scopes
- Per-invocation scope or output-mode override
- ~~Form-based settings UI for user actions~~ — shipped (`ManageActionsPanel`, redesigned to gallery + inline editor 2026-04-25).
- Replacing the native gear-icon plugin settings with a custom Preact settings panel (would enable inline LOCAL/REMOTE preview and prettier validation across all settings, not just user actions)
- Cloud LLM provider
- Embedded WebLLM provider
- Redaction / content filtering
- Action history panel (may piggyback on the debug ring buffer later)
- Per-action vision-model override (today there's one global `visionModel` setting; per-action overrides would let, say, `extract-image-text` use a larger model than `image-title`)
- Variable substitution in user prompts (`{{block_text}}`, `{{selection}}`, etc. — the Manage UI hints at it but the runtime doesn't substitute)
- **True `selection` scope with block-range splicing** — see §14 for the full memo.

## 14. Deferred — true `selection` scope with block-range splicing

Grammar and Rewrite are specced (§5) to operate on the user's highlighted text when present, falling back to block content when not. In v1 the fallback is the only path — `selection`-scoped actions always resolve to block scope in practice. This section captures why, and what a future implementation would need.

### The pain

Every invocation path we've shipped destroys or can't read the DOM text selection before our handler sees it:

| Entry point | Fate of the selection |
|---|---|
| **Slash command** (`/AI Grammar`) | Typing `/` into Logseq's block editor *replaces the active selection* with the `/` character. By the time the slash handler fires, selection is gone. Unrecoverable. |
| **Command palette** (`logseq.App.registerCommandPalette`, shipped in v1) | Cmd-K opens a modal overlay — no typing into the block, so the DOM selection is preserved in the underlying contenteditable. **But reading it is the hard part** (see below). |
| **Block context menu** (not yet registered) | Right-click preserves selection through the menu. Same "reading it" problem. |
| **Keyboard shortcut** (bindable via Logseq keymap) | Same as palette — preserves selection, but reading it is still the blocker. |

The blocker for all the non-slash surfaces is **reading the selection from the plugin iframe**:

- **Logseq Desktop (Electron):** the plugin iframe is same-origin with the host. `window.parent.getSelection()?.toString()` *should* work. **Unverified empirically — confirm before building.**
- **Logseq Web (shadow-cljs watch, the current user's environment):** the plugin iframe is served from `localhost:8282` while Logseq is at `localhost:3001` — cross-origin. `parent.getSelection()` throws `SecurityError` and is unrecoverable without new SDK support.

### What the SDK exposes today (as of `@logseq/libs@0.3.2`)

- `logseq.Editor.getEditingCursorPosition()` → `{ top, left, pos, rect, dir } | null` — **integer cursor position only, no anchor/focus range**.
- `logseq.Editor.getCurrentBlock()` / `getEditingBlockContent()` → block text; no selection metadata.
- No method returns a selection range.

Until Logseq adds one, Web-build users have no path to selection-scope support.

### What a workable v2 implementation looks like

1. **Verify empirically** on Logseq Desktop that a command-palette handler (or a block-context-menu item) can read `window.parent.getSelection()` and extract the selected substring + its offsets within the block. Sanity check that the block's `:title` contains the substring at those offsets (handles block vs. page-title edge cases).
2. Add `src/selection.ts` pure module:
   - `spliceText(content: string, range: { start: number; end: number }, replacement: string): string` — TDD'd; maps (fullBlockContent, range, llmOutput) → updated block content. Straightforward.
3. Adapter changes:
   - Add a `detectSelection()` helper that tries `parent.getSelection()` inside try/catch. Returns `{ text, range: {start, end}, blockUuid } | null`.
   - Extend `ResolvedInput` with optional `selectionRange` + `fullBlockContent`.
   - `resolveInput(action, options?)` — when `action.scope === "selection"` and `options.invocationPath !== "slash"`, call `detectSelection()`. If it returns a range *and* the selected text is a substring of the current block's content at the expected offsets, use it; otherwise fall back to block scope silently.
   - `runAction`'s apply path (both `replace` and `diff-panel` accept) switches on `input.selectionRange`: when set, `spliceText` before `updateBlock`; when absent, `updateBlock` with the full output as today.
4. DiffPanel's `Original` column shows just the selected substring when `selectionRange` is set. User iterates on the highlighted phrase, not the whole block. The accept splice handles the surrounding content.
5. Slash-command invocations keep falling back silently — the slash path never gets a selection, and that's documented user behaviour.

### What the SDK would need to unblock Logseq Web

Either of these unlocks Web:

- `logseq.Editor.getEditingSelection(): { start: number; end: number; blockUuid: string } | null` — block-relative offsets of the current selection, same RPC treatment as `getEditingCursorPosition`.
- A context parameter on command-palette / context-menu handlers that includes a selection snapshot captured at invocation time.

**Action item when we return**: raise this as an upstream issue in `logseq/logseq` before investing in the desktop-only version — the SDK design might shift the implementation shape meaningfully.

### Acceptance criteria (when revisited)

- [ ] Palette-triggered Grammar / Rewrite on highlighted text (Logseq Desktop) shows a diff panel whose Original column is the *selection*, not the full block.
- [ ] Accepting replaces only the selection range; rest of the block untouched.
- [ ] No active selection → falls back to block scope silently, no error toast.
- [ ] Slash-command invocations still fall back to block (no regression).
- [ ] Logseq Web behaviour: either (a) SDK gained a selection API and Web works too, or (b) one-time notice on first selection-scoped invocation explaining "selection scope is Desktop-only for now," mirroring the LOCAL→REMOTE warning pattern.
- [ ] `spliceText` pure helper TDD'd to 100 % line coverage, including empty ranges and edge offsets (start === 0, end === content.length).

## 15. Theme integration

The plugin runs inside a cross-origin iframe; Logseq does not propagate its `--ls-*` CSS variables into plugin documents. The plugin defines its own token set (`--bg`, `--fg`, `--accent`, …) with light- and dark-mode defaults that reference `var(--ls-*, fallback)` — the references stay in case Logseq adds propagation later, but the **fallbacks are what render today**.

Light/dark follows the host:

- On boot, probe `logseq.App.getStateFromStore('ui/theme')`. If it returns nothing or throws, fall back to `window.matchMedia('(prefers-color-scheme: dark)').matches`. Final fallback: light.
- The resolved mode toggles `html.dark` on the iframe's `document.documentElement`; the existing `html.dark` CSS overrides do the rest.
- `logseq.App.onThemeModeChanged` keeps the toggle in sync as the user changes mode inside Logseq.

Custom community-theme palettes (themes/plugins that override `--ls-*` on the main app) are **not** mirrored in v1 — the cross-origin iframe blocks propagation and the SDK doesn't expose a per-token API. Users on custom themes see the plugin's stock light/dark palette. Revisit if Logseq adds a propagation channel.
