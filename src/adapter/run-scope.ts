/// <reference types="@logseq/libs" />
import type { Action } from "../action";
import {
  countOutlineNodes,
  type OutlineNode,
  parseOutline,
  renderOutlinePreview,
} from "../parse-outline";
import { parsePoints } from "../parse-points";
import { appliedMessage, capTargets, flattenTargets, planRun, type RunPlan } from "../run-plan";
import { collectTargets, type Target, type TargetNode } from "../targets";
import { showConfirm } from "../ui/show-confirm";
import { showReviewPanel } from "../ui/show-review";
import { confirmRemoteEndpoint } from "./consent";
import { insertOutlineTree } from "./outline-writer";
import {
  closeBusyToast,
  formatProviderError,
  performLLM,
  type RunActionContext,
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
  /** Combined output goes after this block, or at the end of `pageUuid`. */
  readonly pageUuid?: string;
}

/**
 * Command-palette / keyboard-shortcut entry: selected blocks, else the block
 * being edited (the single-block path, unchanged), else the current page.
 */
export async function runFromCommand(action: Action, ctx: RunActionContext): Promise<void> {
  const scope =
    (await selectionScope()) ??
    ((await logseq.Editor.getCurrentBlock()) ? null : await pageScope());
  if (scope) await runOnScope(action, ctx, scope);
  else await runAction(action, ctx);
}

async function selectionScope(): Promise<Scope | null> {
  const selected = (await logseq.Editor.getSelectedBlocks()) ?? [];
  if (selected.length === 0) return null;
  // Selected entities come without children; the run covers descendants too.
  const trees = await Promise.all(selected.map((b) => readTree(b.uuid)));
  const label = selected.length === 1 ? "1 selected block" : `${selected.length} selected blocks`;
  return { label, trees: trees.filter((t): t is TargetNode => t !== null) };
}

async function pageScope(): Promise<Scope | null> {
  const current = (await logseq.Editor.getCurrentPage()) as {
    uuid: string;
    title?: string;
    originalName?: string;
    name?: string;
    page?: unknown;
  } | null;
  if (!current?.uuid) return null;
  // Zoomed into a block: getCurrentPage returns that block.
  if (current.page) {
    const tree = await readTree(current.uuid);
    return tree ? { label: "Zoomed block", trees: [tree] } : null;
  }
  const trees = ((await logseq.Editor.getPageBlocksTree(current.uuid)) ??
    []) as unknown as TargetNode[];
  const name = current.title ?? current.originalName ?? current.name ?? "this page";
  return { label: `Page: ${name}`, trees, pageUuid: current.uuid };
}

async function readTree(uuid: string): Promise<TargetNode | null> {
  return (await logseq.Editor.getBlock(uuid, {
    includeChildren: true,
  })) as unknown as TargetNode | null;
}

/**
 * Block text as `getBlock` returns it — names, not the raw `[[<uuid>]]` /
 * `#[[<uuid>]]` ids the tree APIs return. Writing raw tag ids back creates a
 * bogus tag named by the uuid (gate G3), so everything sent or written uses
 * this form.
 */
async function readText(uuid: string): Promise<string | null> {
  const block = (await logseq.Editor.getBlock(uuid)) as { title?: string; content?: string } | null;
  if (!block) return null;
  return String(block.title ?? block.content ?? "").trim();
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
  for (const w of writes) {
    // Skip a block edited while the run was going — never overwrite new text.
    if ((await readText(w.uuid)) !== w.original.trim()) {
      stale++;
      continue;
    }
    await logseq.Editor.updateBlock(w.uuid, w.proposed);
    applied++;
  }
  logseq.UI.showMsg(
    appliedMessage(action.title, applied, stale),
    stale > 0 ? "warning" : "success",
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

  const where = scope.pageUuid ? "at the end of the page" : "after the selection";
  if (plan.result === "block") {
    const ok = await showConfirm(action.title, {
      message: `Add this as a new block ${where}? Existing blocks are not changed.`,
      preview: output,
      acceptLabel: "Add block",
      baseUrl: settings.baseUrl,
    });
    if (!ok) return discarded(action);
    await appendBlock(scope, anchor, output);
    logseq.UI.showMsg(`${action.title}: added`, "success");
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
  const heading = await appendBlock(scope, anchor, plan.heading);
  if (!heading) {
    logseq.UI.showMsg(`${action.title}: couldn't add the block`, "error");
    return;
  }
  await insertOutlineTree(heading, tree);
  logseq.UI.showMsg(`${action.title}: added ${count} block${count === 1 ? "" : "s"}`, "success");
}

function discarded(action: Action): void {
  logseq.UI.showMsg(`${action.title} discarded`, "info");
}

/** New block at the end of the page, or as the next sibling of `anchor`. */
async function appendBlock(
  scope: Scope,
  anchor: string | undefined,
  text: string,
): Promise<string | null> {
  const block = scope.pageUuid
    ? await logseq.Editor.appendBlockInPage(scope.pageUuid, text)
    : anchor
      ? await logseq.Editor.insertBlock(anchor, text, { sibling: true })
      : null;
  return (block as { uuid?: string } | null)?.uuid ?? null;
}
