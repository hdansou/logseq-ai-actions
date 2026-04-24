import { type Action, ActionSchema } from "./action";

export interface RegistryResult {
  readonly actions: readonly Action[];
  /**
   * Human-readable validation errors, one per rejected user entry.
   * The runtime surfaces the count as a toast and the details in
   * console + Diagnostics.
   */
  readonly errors: readonly string[];
}

/**
 * Merge built-in actions with user-defined actions parsed from a JSON
 * string (typically the `userActionsJson` plugin setting). Pure — no
 * `@logseq/libs` import, fully testable in Vitest.
 *
 * Ordering invariant: built-ins stay in their original positions (a
 * shadowed built-in gets swapped in-place with the user's version); any
 * user actions that don't shadow are appended after the built-ins in
 * the order they appear in the JSON.
 *
 * Error handling invariant: an individual invalid entry never blocks
 * valid entries. Parse failures (malformed JSON, non-array top level)
 * skip user actions entirely and return built-ins untouched — those
 * failures are structural, not per-entry.
 */
export function buildRegistry(
  builtin: readonly Action[],
  userJsonRaw: string | null | undefined,
): RegistryResult {
  const errors: string[] = [];

  if (typeof userJsonRaw !== "string" || userJsonRaw.trim() === "") {
    return { actions: [...builtin], errors };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(userJsonRaw);
  } catch (err) {
    errors.push(`User actions JSON failed to parse: ${(err as Error).message}`);
    return { actions: [...builtin], errors };
  }

  if (!Array.isArray(parsed)) {
    errors.push(`User actions JSON must be an array at the top level; got ${typeof parsed}.`);
    return { actions: [...builtin], errors };
  }

  const userActions: Action[] = [];
  const seenUserIds = new Set<string>();

  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    const validated = ActionSchema.safeParse(entry);
    if (!validated.success) {
      const idLabel =
        typeof (entry as { id?: unknown })?.id === "string"
          ? ` (id: '${(entry as { id: string }).id}')`
          : "";
      const issues = validated.error.issues
        .map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`)
        .join("; ");
      errors.push(`Invalid user action at index ${i}${idLabel}: ${issues}`);
      continue;
    }
    const action = validated.data;
    if (seenUserIds.has(action.id)) {
      errors.push(
        `Duplicate user action id '${action.id}' at index ${i}; keeping the first occurrence.`,
      );
      continue;
    }
    seenUserIds.add(action.id);
    userActions.push(action);
  }

  const userById = new Map(userActions.map((a) => [a.id, a]));
  const builtinIds = new Set(builtin.map((a) => a.id));

  // Walk built-ins, swapping in user overrides where ids match. Keeps
  // the built-in slot order, so seed actions stay at the top of the
  // slash menu even when shadowed.
  const merged: Action[] = builtin.map((b) => userById.get(b.id) ?? b);
  // Append any user actions that don't shadow a built-in, in JSON order.
  for (const u of userActions) {
    if (!builtinIds.has(u.id)) merged.push(u);
  }

  return { actions: merged, errors };
}
