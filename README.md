# AI Actions for Logseq

AI-driven actions on Logseq blocks — spellcheck, grammar, rewrite (with tone variants), summarize, key-point extraction, nested outlines, image titling, image OCR — powered by a **small, locally-hosted LLM** you control (LM Studio, Ollama, or any OpenAI-compatible endpoint). Vision actions work with multimodal models like `qwen3.5:2b`, `qwen2.5-vl`, or `llava`.

> **DB graphs only** in v1. File-graph support is on the v2 backlog.
> **Privacy-first**: by default, block content is sent to an endpoint on your own machine (`localhost`). The plugin labels endpoints LOCAL or REMOTE in the settings so you know exactly where your notes are going.

---

## Why

Knowledge-graph notes deserve thoughtful AI assistance — but not at the cost of shipping your private thinking to a third-party cloud. This plugin runs entirely against an LLM server you start yourself. No accounts, no tokens, no egress beyond your machine unless you *explicitly* point it at a remote endpoint.

## Features (v1)

- **Text seed actions** (run on a block or its subtree):
  - `spellcheck` — fix typos. Surgical: preserves proper nouns, code, URLs, wikilinks, tags.
  - `grammar` — fix objective grammatical errors. Logseq-aware: respects bullet-style fragments, contractions, lowercase starts.
  - `rewrite` — rephrase for clarity and concision; review via diff before accepting.
  - `rewrite-formal` / `rewrite-professional` / `rewrite-casual` / `rewrite-friendly` — tone variants. `rewrite-professional` follows "Writing the Amazon Way" (declarative sentences, active voice, no weasel words).
  - `summarize` — TL;DR of a block and its descendants; written into the parent, children preserved.
  - `key-points` — extract bullet-list points; appended as new children under the block.
  - `outline-replace` / `outline-append` — generate a nested outline of a subtree. Replace destroys existing children; Append preserves them. Markdown tables in the LLM output are kept as standalone blocks.
- **Vision seed actions** (run on image asset blocks — blocks tagged `:logseq.class/Asset`):
  - `image-title` — analyze the image and propose three candidate titles in a picker; chosen value writes to `:block/title`.
  - `extract-image-text` — OCR the image and append the extracted text as nested children. Well-formed tables in the source render as standalone markdown-table blocks.
- **Entry points**: slash commands (`/AI <action>`), block context menu, command palette, assignable keyboard shortcuts, toolbar button (action picker).
- **Extensibility**: add your own actions through the **Manage Actions** UI (gallery of cards + inline editor with live validation) or the hand-editable `userActionsJson` setting. Hot-reloads into the registry on save.
- **Trust signals**: every UI surface that shows the configured endpoint labels it `LOCAL` or `REMOTE`. Switching to a non-loopback host triggers a one-time warning.
- **Debug log (opt-in)**: in-memory ring buffer of the last 50 requests (request shape, response preview, duration, error if any), viewable in `/AI Diagnostics`. Never written to disk.

> Planned for v2: whole-page and multi-select scopes, per-invocation scope/output override, form-based settings panel, WebLLM provider, true selection-scope with block-range splicing. See [`tasks.md`](./tasks.md) and [`REQUIREMENTS.md`](./REQUIREMENTS.md).

## Quick start

### 1. Start a local OpenAI-compatible LLM server

| Preset | Default URL | How to start |
|---|---|---|
| **LM Studio** *(primary default)* | `http://localhost:1234/v1` | LM Studio → **Developer** → **Start Server** |
| **Ollama** | `http://localhost:11434/v1` | `ollama serve` (and `ollama pull <model>` for a first model) |
| **Custom** | — | Any server speaking the OpenAI Chat Completions API |

#### CORS — required on Logseq Web; not required on Logseq Desktop

The plugin iframe runs at a different origin from your LLM server, so the browser enforces CORS on every `POST /v1/chat/completions`. Your LLM server must send `Access-Control-Allow-Origin` or the request is blocked *before* it reaches the model. Symptom: a `Failed to fetch` error toast in Logseq and a `No 'Access-Control-Allow-Origin' header is present` message in the browser console.

**On Logseq Desktop (Electron):** plugin HTTP routes through Logseq's main process via `logseq.Request`, which is not subject to browser CORS. No action needed if the plugin is using that path.

**On Logseq Web (`yarn watch`, `localhost:3001`):** enable CORS on your LLM server.

| Server | Enable CORS |
|---|---|
| **LM Studio** | Server tab → toggle **Cross-Origin-Resource-Sharing (CORS)** on. Or CLI: `lms server start --cors`. |
| **Ollama** | Start with `OLLAMA_ORIGINS="*" ollama serve` (simplest). Or be specific: `OLLAMA_ORIGINS="http://localhost:3001,http://localhost:8282" ollama serve`. |
| **Custom** | Add `Access-Control-Allow-Origin: *` (or your Logseq + plugin origin) to your server's response headers. Don't forget the `OPTIONS` preflight. |

Allowing `*` is a reasonable default for a server that's already bound to `localhost` — no extra risk beyond what loopback binding already implies.

### 2. Install this plugin

This is pre-release software — no marketplace entry yet. Install from the local dev server:

```bash
git clone https://github.com/hdansou/logseq-ai-actions.git
cd logseq-ai-actions
pnpm install
pnpm exec vite --port 8282 --strictPort
```

Then in Logseq:

1. Enable **Settings → Advanced → Developer mode**.
2. Open **More (⋯) → Plugins**.
3. Click the **three-dot menu** (top-right of the Plugins panel) → **Load plugin from web url**.
4. Enter `http://localhost:8282/` → **Install**.

> If you also run other Logseq plugin dev servers, pick a different port — the workspace convention is `8080`, and Vite's silent fallback can make you install the *wrong* plugin. See [`AGENTS.md`](./AGENTS.md).

### 3. Configure

Open the plugin's settings (gear icon on the plugin card). Pick a preset — `baseUrl` and `model` are auto-filled. Override anything you need. Changing the `baseUrl` away from `localhost` will trigger a one-time REMOTE-endpoint warning.

**Vision model (optional).** Vision actions (`image-title`, `extract-image-text`) need a multimodal model. If your **Model** setting is already a unified multimodal model (e.g. `qwen3.5:2b` — Alibaba's natively-multimodal line), leave **Vision model** empty and the same model handles both text and vision. Run a smaller text-only model alongside a separate vision model? Set **Vision model** explicitly. Confirmed working: `qwen3.5:2b`, `qwen3.5:0.8b`, `qwen2.5-vl`, `llava`. Quality scales with model size — clean printed text OCRs well at 2B; dense or low-contrast pages benefit from a larger model.

### 4. (Optional) Add your own actions

The plugin ships 13 built-in actions. You can add unlimited custom ones.

**Primary way — the Manage Actions panel.** Run `/AI Manage Actions` (or Cmd-K → `AI: Manage Actions`). You'll see a gallery of cards: built-ins at the top (read-only — click any to inspect the prompt, with a `⧉ Duplicate as user action` button to make an editable copy), and your user actions below (hover for edit / delete icons). The toolbar has search, `+ New action`, `Import JSON`, and `Copy all`. Clicking a user card or `+ New` opens the inline editor — pill-style scope and kind selectors, dropdown for output mode, large prompt textarea with a char/line counter. Fields validate as you type; the top of the form summarises any blocking issues on Save. Delete asks for confirmation in an in-modal overlay (and reminds you that slash/palette entries persist until plugin reload).

**Alternative — hand-edited JSON.** The gear-icon plugin settings still include a **User-defined actions (JSON)** textarea. The Manage panel round-trips through the same setting, so either authoring path works and you can switch between them. The textarea is useful for scripting or migrating — but for interactive editing the panel is less error-prone.

Each entry, regardless of how you author it, satisfies the same schema:

```json
[
  {
    "id": "action-items",
    "title": "Action Items",
    "description": "Extract TODO items from meeting notes.",
    "scope": "subtree",
    "outputMode": "append-children",
    "systemPrompt": "Extract concrete action items from the notes. Return ONLY a list, one action per line, no bullet characters, no numbering, no preamble. Each item should start with a verb and be short enough to copy into a TODO list."
  },
  {
    "id": "simplify",
    "title": "Simplify",
    "description": "Rewrite using simpler vocabulary.",
    "scope": "block",
    "outputMode": "diff-panel",
    "systemPrompt": "Rewrite the text using simpler vocabulary, shorter sentences, and a more direct tone. Preserve meaning and any Markdown/wiki syntax. Return ONLY the rewritten text."
  },
  {
    "id": "elaborate",
    "title": "Elaborate",
    "description": "Expand a terse note into fuller prose.",
    "scope": "block",
    "outputMode": "diff-panel",
    "systemPrompt": "Expand the text into fuller prose while preserving the author's voice and meaning. Add concrete detail only where implied by the source. Do not invent facts. Return ONLY the expanded text."
  }
]
```

Each entry needs:

| Field | Values |
|---|---|
| `id` | Unique identifier. Matching a built-in id (any of `spellcheck`, `grammar`, `rewrite`, `rewrite-formal`, `rewrite-professional`, `rewrite-casual`, `rewrite-friendly`, `summarize`, `key-points`, `outline-replace`, `outline-append`, `image-title`, `extract-image-text`) **shadows** it — the user version takes the slot in every menu surface. |
| `title` | Display name in the slash menu (prefixed with `AI `). |
| `scope` | `block` \| `subtree` \| `selection` (selection falls back to block in v1; see REQUIREMENTS §14) |
| `outputMode` | `replace` (overwrite block) \| `diff-panel` (review side-by-side) \| `append-children` (add as new children, one per line) \| `outline-replace` (replace existing children with a generated nested outline) \| `outline-append` (append a generated nested outline) \| `picker-replace` (show N candidates, user picks one) |
| `kind` | `text` (default) \| `vision` (sends an image asset to a multimodal model — only valid on `:logseq.class/Asset` blocks with raster image type) |
| `systemPrompt` | The LLM system prompt. Tune for your model — small models need explicit "return ONLY …" instructions. |
| `description` | Optional, one-line. Shown in the gallery card and the diff-panel header. |

**Hot reload:** editing an existing entry's title or prompt takes effect on the next invocation. Adding or removing entries **requires toggling the plugin off and on** — Logseq has no way to deregister a slash command from a plugin API call.

**Validation:** invalid entries are skipped silently (your other actions still load); a warning toast + console entry tell you how many were skipped, with the failing index and id. Full detail lives in the console.

## Privacy & data egress

- The plugin sends **exactly the scope of content the action is configured for** (selection / block / block + children) to the configured endpoint, nothing more.
- No telemetry. No background requests. Nothing leaves this plugin unless you invoke an action.
- **Do not invoke actions on content you don't want sent to the configured endpoint.** Especially if the endpoint is labeled `REMOTE`.
- The debug log, when enabled, lives only in memory and is cleared when Logseq restarts. Upstream HTTP error excerpts (up to 200 chars) are captured to help diagnose 401/CORS failures — if you share screenshots from `/AI Diagnostics`, treat them as sensitive.
- **API keys (when set) are stored UNENCRYPTED** in Logseq's plugin-settings file on disk. LM Studio and Ollama don't need a key — leave the field blank. Only paste a credential you'd be comfortable storing in a plain-text config file.

See [`REQUIREMENTS.md` §8](./REQUIREMENTS.md) for the full privacy model.

## Development

```bash
pnpm install                        # first time only
pnpm exec vite --port 8282 --strictPort   # dev server (HMR)
pnpm test                           # Vitest (Tier 1 unit) with coverage gate
pnpm test:watch                     # interactive TDD loop
pnpm build                          # production bundle into dist/
pnpm typecheck                      # tsc --noEmit
pnpm lint                           # Biome check (lint + format)
pnpm lint:fix                       # Biome auto-fix
```

Pre-commit runs `biome check --write` + `tsc --noEmit` via `simple-git-hooks`. Do not use `--no-verify`.

The project follows TDD for all pure-logic modules (see [`REQUIREMENTS.md` §9](./REQUIREMENTS.md)). Coverage gate is 80 % on `src/**`, excluding the thin Logseq adapter (`src/adapter/**`), Preact UI (`src/ui/**`), the plugin entry (`src/index.ts`), and the compile-time SDK guard.

## Contributing

Not accepting external PRs yet — the plugin is pre-v1. File issues at <https://github.com/hdansou/logseq-ai-actions/issues>.

## License

MIT — see [`LICENSE`](./LICENSE).
