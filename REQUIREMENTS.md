# `logseq-ai-actions` — Requirements (v1)

Status: **Signed off 2026-04-23.** Changes to this document must land via a PR and be reflected in `CHANGELOG.md`.

## 1. Purpose

A Logseq plugin that runs AI-driven actions on blocks. v1 ships a seed set (spellcheck, grammar, rewrite, summarize) and an extension mechanism so new actions can be added without touching plugin source. Privacy-first: targets small, locally-hosted LLMs by default.

**Graph target (v1):** Logseq **DB graphs only.** File-based graph support is out of scope for v1 (revisit in v2 based on user demand). Manifest declares `supportsDbGraph: true` and either omits or explicitly sets `supportsFileGraph: false`.

## 2. Model hosting

- Plugin talks to a **user-run OpenAI-compatible HTTP endpoint**.
- Presets: **LM Studio (primary default)**, **Ollama (secondary)**, **Goose (candidate — verify OpenAI-compat at scaffold time)**, **Custom**.
- No embedded model, no cloud API in v1.
- Behind a single `LLMProvider` interface so future backends (WebLLM, cloud, …) drop in cleanly.

## 3. Entry points

All five Logseq surfaces, driven by one action registry:

- Block context menu (`AI → <action>`) — *not yet shipped*
- Slash commands (`/AI <action>`) — **shipped**
- Command palette (`logseq.App.registerCommandPalette`, `"AI: <title>"`) — **shipped**
- Keyboard shortcuts — ships *for free* with palette entries (Logseq's keymap UI lets users bind any palette command); no default bindings
- Toolbar button (action picker) — *not yet shipped*

One `Action` declaration auto-wires every surface. Adding an action is a **single-file change**.

## 4. Action scopes (v1)

- `selection` (highlighted text in a block)
- `block` (current block)
- `subtree` (block + descendants, flattened with indent markers)
- **Not in v1:** whole-page, multi-select.
- **Fixed per-action defaults.** No per-invocation override in v1.

## 5. Seed actions

| Action | Scope | Output mode |
|---|---|---|
| `spellcheck` | block | replace |
| `grammar` | selection → block | replace |
| `rewrite` | selection → block | diff-panel |
| `summarize` | subtree | diff-panel |
| `key-points` | subtree | append-children |

## 6. Output handling

Three output modes; each action declares its default:

- **`replace`** — overwrite the block's text with the LLM output.
- **`diff-panel`** — show a side panel with original vs proposed; user accepts / rejects / edits before applying.
- **`append-children`** — append the LLM output as *new child blocks* under the current block (one line per child). Non-destructive: the parent and existing children are untouched. Used by list-producing actions (e.g. Key Points).

Additional behaviours:

- One-click undo (in-session revert of pre-action content).
- Streaming updates live into block (replace mode) or into "proposed" side (diff panel).

## 7. Extensibility

- **Hybrid.** Built-in seed actions in TS source; user-defined actions authored as a JSON array in the plugin's `userActionsJson` setting (textarea). The file-in-graph path (`logseq/plugins/logseq-action/actions.json`) is deferred behind a Desktop-Electron adapter — the settings-stored approach works identically on Logseq Web and Desktop today.
- Both share the same **Zod schema** (`ActionSchema`).
- Plugin rebuilds the registry on `onSettingsChanged` when `userActionsJson` changes. Editing an existing action's title / prompt / scope hot-reloads — the slash handler looks up its action by id at invocation time. Adding or removing an entry still requires a plugin toggle (Logseq has no slash-command deregister API).
- No form-based UI in v1.
- A user action whose `id` matches a built-in **shadows** the built-in (swap in-place at same slash-menu slot).

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

- **Build:** Vite + `vite-plugin-logseq` (verify exact package at scaffold time).
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
- `README.md` — setup, preset table, LOCAL/REMOTE warning, "don't invoke on sensitive content", example user `actions.json`.
- `actions.example.json` — reference for user-defined actions.
- MIT license.
- Semantic versioning. **v1.0.0 ships only** when the seed actions + diff panel + preset picker + LOCAL/REMOTE label + first-run modal are implemented and covered by Tier 1 + Tier 3 tests.

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
- Form-based settings UI for user actions
- Cloud LLM provider
- Embedded WebLLM provider
- Redaction / content filtering
- Action history panel (may piggyback on the debug ring buffer later)
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
