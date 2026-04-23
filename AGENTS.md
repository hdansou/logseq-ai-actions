# AGENTS.md

Guidance that can't be discovered by reading the repo. For spec and plan see `REQUIREMENTS.md` and `tasks.md`.

## Identity landmines

- **Author display name is `Danzu`** (GitHub handle `hdansou`; email `hdansou@gmail.com`). Do not re-derive the display name from the email handle — an earlier guess of "Hermann Dansou" was wrong.
- **Package name is `logseq-ai-actions`; local directory is `logseq-action/`.** The mismatch is intentional — don't "normalize" either side.

## Working rhythm

- **`tasks.md` is the persistent tracker.** Update it when work lands. Session-level task tools don't replace it.
- **User-visible changes require a `pnpm changeset`.** The `[Unreleased]` section of `CHANGELOG.md` is no longer hand-edited — changesets owns it.
- **Pre-commit hook runs `biome check --write` + `tsc --noEmit`.** Never use `--no-verify`. If the hook fails, fix the cause.

## Architectural rules

- **Keep the Logseq-touching surface thin.** One adapter module wraps `logseq.Editor.*` / `logseq.App.*`; everything else (registry, scope resolver, endpoint classifier, diff, streaming parser) stays pure so Tier 1 unit tests can reach it. The 80 % coverage gate is only achievable under this rule — a PR that thickens the adapter without a compelling reason should be pushed back on.
- **Only `src/index.ts` does `import "@logseq/libs"`.** Every other module that needs the `logseq` global uses `/// <reference types="@logseq/libs" />` for types only. Vitest crashes on the SDK's browser-only bootstrap (`ReferenceError: self is not defined`) otherwise — see the `logseq-plugin-dev` skill's `runtime-gotchas.md §11`.
- **SDK pinned via the `next` dist-tag at `^0.3.2`.** Public npm `latest` points at the legacy `0.0.17` line. Do not run `pnpm update @logseq/libs` without checking the dist-tag.
