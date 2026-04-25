// Shared runtime types. Keep this module PURE — no `@logseq/libs` import,
// no DOM, no side effects. It must be importable from unit tests and from
// Logseq-runtime code alike.

/** Where an action reads its input from. See REQUIREMENTS §4. */
export type ActionScope = "selection" | "block" | "subtree";

/** How the LLM output is applied. See REQUIREMENTS §6. */
export type OutputMode =
  | "replace"
  | "diff-panel"
  | "append-children"
  | "outline-replace"
  | "outline-append"
  | "picker-replace";

/**
 * Input modality of an action. `text` actions consume the resolved block /
 * subtree text (the existing path); `vision` actions consume an image asset
 * referenced by the block + a short text prompt and require a multimodal
 * provider call.
 */
export type ActionKind = "text" | "vision";

/** Trust classification of the configured LLM endpoint. See REQUIREMENTS §8. */
export type EndpointTrust = "local" | "remote";
