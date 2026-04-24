# AI Actions for Logseq

AI-driven actions on Logseq blocks — spellcheck, grammar, rewrite, summarize — powered by a **small, locally-hosted LLM** you control (LM Studio, Ollama, or any OpenAI-compatible endpoint).

> **DB graphs only** in v1. File-graph support is on the v2 backlog.
> **Privacy-first**: by default, block content is sent to an endpoint on your own machine (`localhost`). The plugin labels endpoints LOCAL or REMOTE in the settings so you know exactly where your notes are going.

---

## Why

Knowledge-graph notes deserve thoughtful AI assistance — but not at the cost of shipping your private thinking to a third-party cloud. This plugin runs entirely against an LLM server you start yourself. No accounts, no tokens, no egress beyond your machine unless you *explicitly* point it at a remote endpoint.

## Features (v1)

- **Seed actions**
  - `spellcheck` — fix typos in the current block.
  - `grammar` — fix grammar in the current block (or selection).
  - `rewrite` — rephrase the current block (or selection); review via a side-panel diff before accepting.
  - `summarize` — produce a summary of a block and its children; review via diff.
- **Entry points**: slash commands (`/ai-*`), block context menu, command palette, assignable keyboard shortcuts, toolbar.
- **Extensibility**: define your own actions in `logseq/plugins/logseq-action/actions.json` — hot-reloaded into the registry.
- **Trust signals**: every UI surface that shows the configured endpoint labels it `LOCAL` or `REMOTE`. Switching to a non-loopback host triggers a one-time warning.
- **Debug log (opt-in)**: in-memory ring buffer of the last 50 requests, viewable in settings. Never written to disk.

> Planned for v2: whole-page and multi-select scopes, per-invocation scope/output override, form-based action editor, WebLLM provider. See [`tasks.md`](./tasks.md) and [`REQUIREMENTS.md`](./REQUIREMENTS.md).

## Quick start

### 1. Start a local OpenAI-compatible LLM server

| Preset | Default URL | How to start |
|---|---|---|
| **LM Studio** *(primary default)* | `http://localhost:1234/v1` | LM Studio → **Developer** → **Start Server** |
| **Ollama** | `http://localhost:11434/v1` | `ollama serve` (and `ollama pull <model>` for a first model) |
| **Goose** *(unverified)* | `http://localhost:3000/v1` | Experimental — OpenAI-compatibility not yet verified |
| **Custom** | — | Any server speaking the OpenAI Chat Completions API |

#### CORS — required on Logseq Web; not required on Logseq Desktop

The plugin iframe runs at a different origin from your LLM server, so the browser enforces CORS on every `POST /v1/chat/completions`. Your LLM server must send `Access-Control-Allow-Origin` or the request is blocked *before* it reaches the model. Symptom: a `Failed to fetch` error toast in Logseq and a `No 'Access-Control-Allow-Origin' header is present` message in the browser console.

**On Logseq Desktop (Electron):** plugin HTTP routes through Logseq's main process via `logseq.Request`, which is not subject to browser CORS. No action needed if the plugin is using that path.

**On Logseq Web (`yarn watch`, `localhost:3001`):** enable CORS on your LLM server.

| Server | Enable CORS |
|---|---|
| **LM Studio** | Server tab → toggle **Cross-Origin-Resource-Sharing (CORS)** on. Or CLI: `lms server start --cors`. |
| **Ollama** | Start with `OLLAMA_ORIGINS="*" ollama serve` (simplest). Or be specific: `OLLAMA_ORIGINS="http://localhost:3001,http://localhost:8282" ollama serve`. |
| **Goose** | CORS support is unverified (same status as its OpenAI-compat surface — see preset note above). |
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

### 4. (Optional) Add your own actions

The plugin ships five built-in actions. You can add unlimited custom ones.

**Primary way — the Manage Actions panel.** Run `/AI Manage Actions` (or Cmd-K → `AI: Manage Actions`). You'll see a CRUD UI that lists built-ins at the top (read-only, shown with a "shadowed by user" label if you've overridden them) and your user actions below, with Up / Down reorder, Edit, and Delete controls. Click **+ New action** to add one; fields validate live, Save requires no errors. **Import JSON** and **Copy all** buttons let you paste in a list from another machine or copy your current list to share.

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
| `id` | Unique identifier. Matching a built-in id (`spellcheck`, `grammar`, `rewrite`, `summarize`, `key-points`) **shadows** it. |
| `title` | Display name in the slash menu (prefixed with `AI `). |
| `scope` | `block` \| `subtree` \| `selection` |
| `outputMode` | `replace` \| `diff-panel` \| `append-children` |
| `systemPrompt` | The LLM system prompt. Tune for your model — small models need explicit "return ONLY …" instructions. |
| `description` | Optional, one-line. |

**Hot reload:** editing an existing entry's title or prompt takes effect on the next invocation. Adding or removing entries **requires toggling the plugin off and on** — Logseq has no way to deregister a slash command from a plugin API call.

**Validation:** invalid entries are skipped silently (your other actions still load); a warning toast + console entry tell you how many were skipped, with the failing index and id. Full detail lives in the console.

## Privacy & data egress

- The plugin sends **exactly the scope of content the action is configured for** (selection / block / block + children) to the configured endpoint, nothing more.
- No telemetry. No background requests. Nothing leaves this plugin unless you invoke an action.
- **Do not invoke actions on content you don't want sent to the configured endpoint.** Especially if the endpoint is labeled `REMOTE`.
- The debug log, when enabled, lives only in memory and is cleared when Logseq restarts.

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
