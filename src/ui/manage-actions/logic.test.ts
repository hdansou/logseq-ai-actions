import { describe, expect, it } from "vitest";
import { type Action, parseAction } from "../../action";
import { buildHiddenRows, mergeImported, uniqueCopyId, validateDraft } from "./logic";
import { BLANK_DRAFT, draftFrom } from "./types";

function act(id: string, title = id): Action {
  return parseAction({
    id,
    title,
    scope: "block",
    outputMode: "replace",
    systemPrompt: "p",
  });
}

describe("buildHiddenRows", () => {
  const builtin = [act("grammar"), act("summarize"), act("rewrite")];

  it("lists hidden built-ins in seed order, then orphan user actions", () => {
    const user = [act("mine")];
    const rows = buildHiddenRows(builtin, user, ["mine", "rewrite", "grammar"]);
    expect(rows.map((r) => `${r.source}:${r.action.id}`)).toEqual([
      "builtin:grammar",
      "builtin:rewrite",
      "user:mine",
    ]);
  });

  it("shows the user's shadow in place of a hidden built-in, once", () => {
    const shadow = act("grammar", "My grammar");
    const rows = buildHiddenRows(builtin, [shadow], ["grammar"]);
    expect(rows).toEqual([{ source: "user", action: shadow }]);
  });

  it("drops hidden ids that match no action", () => {
    expect(buildHiddenRows(builtin, [], ["gone"])).toEqual([]);
  });
});

describe("validateDraft", () => {
  const builtinIds = new Set(["grammar"]);
  const userActions = [act("mine"), act("other")];

  it("maps schema issues to their first field", () => {
    const errs = validateDraft(BLANK_DRAFT, { userActions, builtinIds, exceptIndex: null });
    expect(Object.keys(errs).sort()).toEqual(["id", "systemPrompt", "title"]);
  });

  it("rejects an id another user action already uses", () => {
    const errs = validateDraft(draftFrom(act("other")), {
      userActions,
      builtinIds,
      exceptIndex: 0,
    });
    expect(errs.id).toBe("Another user action already uses this id.");
  });

  it("lets an edited action keep its own id", () => {
    const errs = validateDraft(draftFrom(act("mine")), {
      userActions,
      builtinIds,
      exceptIndex: 0,
    });
    expect(errs).toEqual({});
  });

  it("warns when a NEW action's id matches a built-in", () => {
    const errs = validateDraft(draftFrom(act("grammar")), {
      userActions,
      builtinIds,
      exceptIndex: null,
    });
    expect(errs.id).toMatch(/matches a built-in/);
  });
});

describe("uniqueCopyId", () => {
  it("appends -copy, then -copy-2, -copy-3 … until free", () => {
    expect(uniqueCopyId("grammar", new Set())).toBe("grammar-copy");
    expect(uniqueCopyId("grammar", new Set(["grammar-copy", "grammar-copy-2"]))).toBe(
      "grammar-copy-3",
    );
  });
});

describe("mergeImported", () => {
  it("appends new actions and skips ids that already exist (incl. duplicates in the import)", () => {
    const existing = [act("a")];
    const out = mergeImported(existing, [act("a"), act("b"), act("b"), act("c")]);
    expect(out.merged.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(out.imported).toBe(2);
    expect(out.skipped).toBe(2);
  });
});
