# AGENTS.md

Guidance that can't be discovered by reading the repo. For spec and plan see `REQUIREMENTS.md` and `tasks.md`.

## Identity landmines

- **Author display name is `Danzu`.** Do not infer from the email handle (`hdansou@gmail.com`). An earlier attempt to guess "Hermann Dansou" was wrong.
- **Repository URL is unresolved.** Do not guess a GitHub handle. Ask before writing a repo URL into `package.json`, changesets config, or the Logseq plugin manifest.
- **Package name is `logseq-ai-actions`; local directory is `logseq-action/`.** The mismatch is intentional — don't "normalize" either side.

## Working rhythm

- **`tasks.md` is the persistent tracker.** Update it when work lands. Session-level task tools don't replace it.
- **`CHANGELOG.md` is hand-edited until Phase 1 wires up `changesets`.** Don't run `pnpm changeset …` before the scaffold exists.

## Architectural rule (governs the test strategy)

- **Keep the Logseq-touching surface thin.** One adapter module wraps `logseq.Editor.*` / `logseq.App.*`; everything else (registry, scope resolver, endpoint classifier, diff, streaming parser) stays pure so Tier 1 unit tests can reach it. The 80 % coverage gate is only achievable under this rule — a PR that thickens the adapter without a compelling reason should be pushed back on.
