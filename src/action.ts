import { z } from "zod";
import type { ActionScope, OutputMode } from "./types";

const SCOPES: readonly ActionScope[] = ["selection", "block", "subtree"];
const OUTPUT_MODES: readonly OutputMode[] = ["replace", "diff-panel"];

/**
 * Canonical Action shape. Single source of truth for both built-in seed
 * actions (TS literals validated at build time) and user-defined actions
 * loaded from JSON at runtime — both paths converge on this schema.
 *
 * See REQUIREMENTS §4–§6 for scope/outputMode semantics.
 */
export const ActionSchema = z.object({
  id: z.string().min(1, "id is required"),
  title: z.string().min(1, "title is required"),
  description: z.string().default(""),
  scope: z.enum(SCOPES as [ActionScope, ...ActionScope[]]),
  outputMode: z.enum(OUTPUT_MODES as [OutputMode, ...OutputMode[]]),
  systemPrompt: z.string().min(1, "systemPrompt is required"),
});

export type Action = z.infer<typeof ActionSchema>;

/** Parse + validate in one call. Throws a ZodError on failure. */
export function parseAction(raw: unknown): Action {
  return ActionSchema.parse(raw);
}
