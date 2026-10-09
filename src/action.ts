import { z } from "zod";
import type { ActionKind, ActionScope, OutputMode } from "./types";

const SCOPES: readonly ActionScope[] = ["selection", "block", "subtree"];
const OUTPUT_MODES: readonly OutputMode[] = [
  "replace",
  "diff-panel",
  "append-children",
  "outline-replace",
  "outline-append",
  "outline-revise",
  "picker-replace",
];
const KINDS: readonly ActionKind[] = ["text", "vision"];
/** Output modes the image path (`runVisionAction`) implements. */
export const VISION_OUTPUT_MODES: readonly OutputMode[] = [
  "picker-replace",
  "outline-append",
  "diff-panel",
];

/**
 * Canonical Action shape. Single source of truth for both built-in seed
 * actions (TS literals validated at build time) and user-defined actions
 * loaded from JSON at runtime — both paths converge on this schema.
 *
 * See REQUIREMENTS §4–§6 for scope/outputMode semantics.
 */
export const ActionSchema = z
  .object({
    id: z.string().min(1, "id is required"),
    title: z.string().min(1, "title is required"),
    description: z.string().default(""),
    scope: z.enum(SCOPES as [ActionScope, ...ActionScope[]]),
    outputMode: z.enum(OUTPUT_MODES as [OutputMode, ...OutputMode[]]),
    systemPrompt: z.string().min(1, "systemPrompt is required"),
    // `kind` is optional with a default of "text" — every existing action
    // and every existing user-defined action JSON literal stays valid.
    kind: z.enum(KINDS as [ActionKind, ...ActionKind[]]).default("text"),
  })
  .superRefine((action, ctx) => {
    if (action.kind === "vision" && !VISION_OUTPUT_MODES.includes(action.outputMode)) {
      ctx.addIssue({
        code: "custom",
        path: ["outputMode"],
        message: `Image actions support ${VISION_OUTPUT_MODES.join(", ")} (diff-panel writes the whole reply, e.g. a title and a description, into the image block).`,
      });
    }
  });

export type Action = z.infer<typeof ActionSchema>;

/** Parse + validate in one call. Throws a ZodError on failure. */
export function parseAction(raw: unknown): Action {
  return ActionSchema.parse(raw);
}
