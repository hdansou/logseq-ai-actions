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
