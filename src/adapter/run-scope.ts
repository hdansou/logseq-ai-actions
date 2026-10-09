/// <reference types="@logseq/libs" />
import type { Action } from "../action";
import {
  countOutlineNodes,
  type OutlineNode,
  parseOutline,
  renderOutlinePreview,
} from "../parse-outline";
import { parsePoints } from "../parse-points";
import {
  appliedMessage,
  type CombinedScope,
  capTargets,
  combinedPlacement,
  commandTarget,
  distinctBlocks,
  flattenTargets,
  type Insert,
  planRun,
  type RunPlan,
} from "../run-plan";
import { collectTargets, type Target, type TargetNode } from "../targets";
import { showConfirm } from "../ui/show-confirm";
import { showReviewPanel } from "../ui/show-review";
import { readBlockText as readText } from "./block-text";
import { confirmRemoteEndpoint } from "./consent";
import { insertOutlineTree } from "./outline-writer";
import {
  closeBusyToast,
  formatProviderError,
  performLLM,
  type RunActionContext,
  reviewRevisedOutline,
  runAction,
  showBusyToast,
} from "./run-action";
import { type ResolvedSettings, readSettings } from "./settings";

/**
 * Page and multi-block runs (REQUIREMENTS §18). Thin: Logseq reads/writes
 * around the pure `targets` / `run-plan` / `review-state` modules.
 */

/** Where a run's blocks come from and where combined output goes. */
interface Scope {
  readonly label: string;
  readonly trees: readonly TargetNode[];
  readonly place: CombinedScope;
}

interface CurrentPage {
  uuid: string;
  title?: string;
  originalName?: string;
  name?: string;
  /** Set when zoomed into a block: getCurrentPage then returns that block. */
  page?: unknown;
}

/**
 * Command-palette / keyboard-shortcut entry; `commandTarget` decides what it
 * runs on. Every failure ends in a toast, never only a console error.
 */
export async function runFromCommand(action: Action, ctx: RunActionContext): Promise<void> {
  try {
    const selected = distinctBlocks((await logseq.Editor.getSelectedBlocks()) ?? []);
    const editing = selected.length === 0 && (await logseq.Editor.getCurrentBlock()) !== null;
    const page =
      selected.length === 0 && !editing
        ? ((await logseq.Editor.getCurrentPage()) as CurrentPage | null)
        : null;
    switch (commandTarget({ selected: selected.length, editing, page: Boolean(page?.uuid) })) {
      case "selection":
        return await runOnScope(action, ctx, await selectionScope(selected));
      case "single":
        return await runAction(action, ctx, selected[0]?.uuid);
      case "page":
        return page ? await runOnScope(action, ctx, await pageScope(page)) : undefined;
      case "none":
        logseq.UI.showMsg(
          `${action.title}: open a page or a journal, or select blocks, first`,
          "warning",
        );
    }
  } catch (err) {
    console.error(`logseq-ai-actions: ${action.id} failed`, err);
    logseq.UI.showMsg(`${action.title} failed: ${formatProviderError(err)}`, "error");
  }
}

async function selectionScope(selected: readonly { uuid: string }[]): Promise<Scope> {
  // Selected entities come without children; the run covers descendants too.
  const trees = await Promise.all(selected.map((b) => readTree(b.uuid)));
  return {
    label: `${selected.length} selected blocks`,
    trees: trees.filter((t): t is TargetNode => t !== null),
    place: { kind: "selection" },
  };
}

async function pageScope(current: CurrentPage): Promise<Scope> {
  if (current.page) {
    const tree = await readTree(current.uuid);
    return {
      label: "Zoomed-in block",
      trees: tree ? [tree] : [],
      place: { kind: "zoomed", uuid: current.uuid },
    };
  }
  const trees = ((await logseq.Editor.getPageBlocksTree(current.uuid)) ??
    []) as unknown as TargetNode[];
  const name = current.title ?? current.originalName ?? current.name ?? "this page";
  return { label: `Page: ${name}`, trees, place: { kind: "page", uuid: current.uuid } };
}

async function readTree(uuid: string): Promise<TargetNode | null> {
  return (await logseq.Editor.getBlock(uuid, {
    includeChildren: true,
  })) as unknown as TargetNode | null;
}

async function runOnScope(action: Action, ctx: RunActionContext, scope: Scope): Promise<void> {
  const settings = readSettings();
  const plan = planRun(action);
  if (plan.kind === "unsupported") {
    logseq.UI.showMsg(`${action.title}: ${plan.reason}`, "warning");
    return;
  }
  if (!settings.model.trim()) {
    logseq.UI.showMsg(
      "AI Actions: no model configured. Open plugin settings and set a model name.",
      "warning",
    );
    return;
  }

  const collected = collectTargets(scope.trees);
  if (collected.targets.length === 0) {
    logseq.UI.showMsg(`${action.title}: no text blocks to work on (${scope.label})`, "warning");
    return;
  }
  const capped = capTargets(collected.targets, plan.kind);
  if (capped.capped) {
    const proceed = await showConfirm(action.title, {
      message: `${scope.label} has ${collected.targets.length} text blocks — more than one run handles. Run on the first ${capped.targets.length}?`,
      acceptLabel: `Run on first ${capped.targets.length}`,
      rejectLabel: "Cancel",
      baseUrl: settings.baseUrl,
    });
    if (!proceed) {
      logseq.UI.showMsg(`${action.title} cancelled — nothing was sent`, "info");
      return;
    }
  }

  if (!(await confirmRemoteEndpoint(settings.baseUrl, settings.apiKey))) {
    logseq.UI.showMsg(`${action.title} cancelled — nothing was sent`, "info");
    return;
  }

  const targets = await withNamedText(capped.targets);
  const skipped = collected.skipped + (collected.targets.length - capped.targets.length);
  if (plan.kind === "per-block") {
    await runPerBlock(action, ctx, settings, scope, targets, skipped);
  } else {
    const anchor = collected.roots.at(-1);
    await runCombined(action, ctx, settings, scope, plan, targets, anchor);
  }
}

async function withNamedText(targets: readonly Target[]): Promise<Target[]> {
  const out: Target[] = [];
  for (const t of targets) {
    const text = await readText(t.uuid);
    if (text) out.push({ ...t, text });
  }
  return out;
}

async function runPerBlock(
  action: Action,
  ctx: RunActionContext,
  settings: ResolvedSettings,
  scope: Scope,
  targets: readonly Target[],
  skipped: number,
): Promise<void> {
  const writes = await showReviewPanel({
    actionTitle: action.title,
    scopeLabel: scope.label,
    baseUrl: settings.baseUrl,
    targets,
    skipped,
    run: async (dispatch, signal) => {
      // One at a time: local servers usually serve one request at a time anyway.
      for (const t of targets) {
        if (signal.aborted) return;
        dispatch({ type: "start", uuid: t.uuid });
        try {
          const input = { uuid: t.uuid, llmInput: t.text, displayOriginal: t.text };
          const output = await performLLM(ctx.provider, action, input, settings);
          dispatch({ type: "result", uuid: t.uuid, output });
        } catch (err) {
          dispatch({ type: "fail", uuid: t.uuid, error: formatProviderError(err) });
        }
      }
    },
  });
  if (writes.length === 0) {
    logseq.UI.showMsg(`${action.title}: nothing applied`, "info");
    return;
  }

  let applied = 0;
  let stale = 0;
  let failed = 0;
  for (const w of writes) {
    try {
      // Skip a block edited while the run was going — never overwrite new text.
      if ((await readText(w.uuid)) !== w.original.trim()) {
        stale++;
        continue;
      }
      await logseq.Editor.updateBlock(w.uuid, w.proposed);
      applied++;
    } catch (err) {
      console.error(`logseq-ai-actions: ${action.id} could not save ${w.uuid}`, err);
      failed++;
    }
  }
  logseq.UI.showMsg(
    appliedMessage(action.title, applied, stale, failed),
    failed > 0 ? "error" : stale > 0 ? "warning" : "success",
  );
}

async function runCombined(
  action: Action,
  ctx: RunActionContext,
  settings: ResolvedSettings,
  scope: Scope,
  plan: Extract<RunPlan, { kind: "combined" }>,
  targets: readonly Target[],
  anchor: string | undefined,
): Promise<void> {
  const llmInput = flattenTargets(targets);
  const { insert, where } = combinedPlacement(scope.place, anchor);
  if (plan.result === "children" && plan.review === "diff") {
    const tree = await reviewRevisedOutline(action, ctx, settings, {
      uuid: anchor ?? "",
      llmInput,
      displayOriginal: llmInput,
    });
    if (tree) await addUnderHeading(action, insert, plan.heading, tree);
    return;
  }
  let busy: string | number | null = null;
  let output: string;
  try {
    busy = await showBusyToast(`${action.title} (${scope.label})`);
    output = await performLLM(
      ctx.provider,
      action,
      { uuid: anchor ?? "", llmInput, displayOriginal: llmInput },
      settings,
    );
  } catch (err) {
    console.error(`logseq-ai-actions: ${action.id} failed`, err);
    logseq.UI.showMsg(`${action.title} failed: ${formatProviderError(err)}`, "error");
    return;
  } finally {
    closeBusyToast(busy);
  }
  if (!output) {
    logseq.UI.showMsg(`${action.title}: empty response from model`, "warning");
    return;
  }

  if (plan.result === "block") {
    const ok = await showConfirm(action.title, {
      message: `Add this as a new block ${where}? Existing blocks are not changed.`,
      preview: output,
      acceptLabel: "Add block",
      baseUrl: settings.baseUrl,
    });
    if (!ok) return discarded(action);
    const added = await appendBlock(insert, output);
    logseq.UI.showMsg(
      added ? `${action.title}: added` : `${action.title}: couldn't add the block`,
      added ? "success" : "error",
    );
    return;
  }

  const tree: OutlineNode[] =
    action.outputMode === "append-children"
      ? parsePoints(output).map((text) => ({ text, children: [] }))
      : parseOutline(output);
  if (tree.length === 0) {
    logseq.UI.showMsg(`${action.title}: nothing could be parsed from the response`, "warning");
    return;
  }
  const count = countOutlineNodes(tree);
  const ok = await showConfirm(action.title, {
    message: `Add a "${plan.heading}" block ${where} with ${count} block${count === 1 ? "" : "s"} under it? Existing blocks are not changed.`,
    preview: renderOutlinePreview(tree),
    acceptLabel: "Add blocks",
    baseUrl: settings.baseUrl,
  });
  if (!ok) return discarded(action);
  await addUnderHeading(action, insert, plan.heading, tree);
}

/** A new block named `heading` where `insert` says, with `tree` under it. */
async function addUnderHeading(
  action: Action,
  insert: Insert | null,
  heading: string,
  tree: readonly OutlineNode[],
): Promise<void> {
  const parent = await appendBlock(insert, heading);
  if (!parent) {
    logseq.UI.showMsg(`${action.title}: couldn't add the block`, "error");
    return;
  }
  await insertOutlineTree(parent, tree);
  const count = countOutlineNodes(tree);
  logseq.UI.showMsg(`${action.title}: added ${count} block${count === 1 ? "" : "s"}`, "success");
}

function discarded(action: Action): void {
  logseq.UI.showMsg(`${action.title} discarded`, "info");
}

/** Add a block where `combinedPlacement` says; its uuid, or null. */
async function appendBlock(insert: Insert | null, text: string): Promise<string | null> {
  if (!insert) return null;
  const block =
    insert.kind === "page-end"
      ? await logseq.Editor.appendBlockInPage(insert.page, text)
      : insert.kind === "last-child"
        ? await logseq.Editor.insertBlock(insert.parent, text, { sibling: false })
        : await logseq.Editor.insertBlock(insert.sibling, text, { sibling: true });
  return (block as { uuid?: string } | null)?.uuid ?? null;
}
