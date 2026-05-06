/// <reference types="@logseq/libs" />
import type { Action } from "../action";
import { failureMessage } from "../asset-url";
import { debugLog, PREVIEW_TRUNCATION_LIMIT, truncate } from "../debug-log";
import { type AssetBlock, getAssetType, isImageAsset } from "../image-asset";
import { countOutlineNodes, parseOutline, renderOutlinePreview } from "../parse-outline";
import { parsePoints } from "../parse-points";
import { parseTitles } from "../parse-titles";
import { type LLMProvider, LLMProviderError } from "../provider";
import type { ChoicePanelChoice } from "../ui/ChoicePanel";
import { showChoice } from "../ui/show-choice";
import { showConfirm } from "../ui/show-confirm";
import { showDiffPanel } from "../ui/show-diff";
import { loadImageAssetBytes } from "./image-loader";
import { insertOutlineTree, removeBlockChildren } from "./outline-writer";
import { type ResolvedInput, resolveInput } from "./resolve-input";
import { type ResolvedSettings, readSettings } from "./settings";

/**
 * Caller-supplied context. The provider is composed in `src/index.ts`
 * (where `@logseq/libs` is imported for its side-effect bootstrap) and
 * `getActiveActions` returns the live registry — important because the
 * diff-panel action bar can re-run a different action mid-flight after
 * the user edits the registry, and we want a fresh snapshot then.
 */
export interface RunActionContext {
  readonly provider: LLMProvider;
  readonly getActiveActions: () => readonly Action[];
}

/**
 * Run a single seed or user action against the block the cursor is
 * currently in (or against `explicitBlockUuid` for context-menu
 * invocations). Dispatches to `runVisionAction` for `kind: "vision"`,
 * otherwise drives the text pipeline (diff-panel / replace /
 * append-children / outline-replace / outline-append).
 */
export async function runAction(
  action: Action,
  ctx: RunActionContext,
  explicitBlockUuid?: string,
): Promise<void> {
  const settings = readSettings();

  // Vision actions take an entirely different path — different model
  // resolution (visionModel || model), different input (image bytes), and
  // a picker UI for the candidates. Dispatch early.
  if (action.kind === "vision") {
    return runVisionAction(action, ctx, settings, explicitBlockUuid);
  }

  if (!settings.model.trim()) {
    logseq.UI.showMsg(
      "AI Actions: no model configured. Open plugin settings and set a model name.",
      "warning",
    );
    return;
  }

  const input = await resolveInput(action, explicitBlockUuid);
  if (input.uuid === null) {
    logseq.UI.showMsg(input.reason, "warning");
    return;
  }

  // Diff-panel mode: the panel IS the busy indicator. Mount it
  // immediately with an empty Proposed column; the panel invokes the
  // streaming callback on mount, which fills in the content token by
  // token. No pre-flight LLM call, no busy toast.
  if (action.outputMode === "diff-panel") {
    const panelActions = ctx
      .getActiveActions()
      .filter((a) => a.outputMode === "diff-panel")
      .map((a) => ({ id: a.id, title: a.title }));

    const runAndStream = async (
      actionId: string,
      onChunk: (chunk: string) => void,
    ): Promise<{ finalText: string; actionTitle: string }> => {
      const a = ctx.getActiveActions().find((x) => x.id === actionId);
      if (!a) throw new Error(`Unknown action: ${actionId}`);
      // Carry the explicit uuid into re-runs so switching actions in
      // the diff-panel action bar stays on the same block even when
      // the user's cursor has since moved.
      const inp = await resolveInput(a, explicitBlockUuid);
      if (inp.uuid === null) throw new Error(inp.reason);
      // Read settings fresh — user may have changed preset/model
      // between the initial invocation and a re-run (runtime-gotchas §7).
      const s = readSettings();
      if (!s.model.trim()) {
        throw new Error("No model configured. Open plugin settings and set a model name.");
      }
      const text = await performLLM(ctx.provider, a, inp, s, onChunk);
      return { finalText: text, actionTitle: a.title };
    };

    const accepted = await showDiffPanel({
      currentActionId: action.id,
      actionTitle: action.title,
      baseUrl: settings.baseUrl,
      original: input.displayOriginal,
      actions: panelActions,
      runAndStream,
    });
    if (accepted === null) {
      logseq.UI.showMsg(`${action.title} discarded`, "info");
      return;
    }
    await logseq.Editor.updateBlock(input.uuid, accepted);
    logseq.UI.showMsg(`${action.title} applied`, "success");
    return;
  }

  // Non-streaming paths: replace + append-children share the
  // busy-toast + one-shot `complete()` flow.
  let busyToastKey: string | number | null = null;
  try {
    const msg = await logseq.UI.showMsg(`${action.title}…`, "info", { timeout: 0 });
    busyToastKey = (msg as unknown as string | number | null) ?? null;

    const output = await performLLM(ctx.provider, action, input, settings);

    closeBusyToast(busyToastKey);
    busyToastKey = null;

    if (!output) {
      logseq.UI.showMsg(`${action.title}: empty response from model`, "warning");
      return;
    }

    if (action.outputMode === "append-children") {
      const points = parsePoints(output);
      if (points.length === 0) {
        logseq.UI.showMsg(`${action.title}: no points extracted`, "warning");
        return;
      }
      const preview = points.map((p) => `• ${p}`).join("\n");
      const accepted = await showConfirm(action.title, {
        message: `Add ${points.length} new child block${points.length === 1 ? "" : "s"} under the current block?`,
        preview,
        acceptLabel: "Add as children",
        baseUrl: settings.baseUrl,
      });
      if (!accepted) {
        logseq.UI.showMsg(`${action.title} discarded`, "info");
        return;
      }
      for (const point of points) {
        // Ordered sequential inserts preserve top-down order. `sibling:
        // false` attaches under the current block rather than as a
        // sibling.
        await logseq.Editor.insertBlock(input.uuid, point, { sibling: false });
      }
      logseq.UI.showMsg(
        `${action.title}: added ${points.length} child block${points.length === 1 ? "" : "s"}`,
        "success",
      );
      return;
    }

    if (action.outputMode === "outline-replace" || action.outputMode === "outline-append") {
      const tree = parseOutline(output);
      if (tree.length === 0) {
        logseq.UI.showMsg(
          `${action.title}: no outline could be parsed from the response`,
          "warning",
        );
        return;
      }
      const destructive = action.outputMode === "outline-replace";
      const nodeCount = countOutlineNodes(tree);
      const preview = renderOutlinePreview(tree);
      const plural = nodeCount === 1 ? "" : "s";
      const accepted = await showConfirm(action.title, {
        message: destructive
          ? `Replace the current block's children with a ${nodeCount}-block outline? Existing children will be removed.`
          : `Append a ${nodeCount}-block outline under the current block? Existing children are preserved.`,
        preview,
        acceptLabel: destructive ? "Replace children" : "Append outline",
        baseUrl: settings.baseUrl,
      });
      if (!accepted) {
        logseq.UI.showMsg(`${action.title} discarded`, "info");
        return;
      }
      if (destructive) {
        await removeBlockChildren(input.uuid);
      }
      await insertOutlineTree(input.uuid, tree);
      logseq.UI.showMsg(
        `${action.title}: ${destructive ? "replaced with" : "added"} ${nodeCount} block${plural}`,
        "success",
      );
      return;
    }

    // outputMode === "replace"
    await logseq.Editor.updateBlock(input.uuid, output);
    logseq.UI.showMsg(`${action.title} applied`, "success");
  } catch (err) {
    closeBusyToast(busyToastKey);
    const detail = formatProviderError(err);
    console.error(`logseq-ai-actions: ${action.id} failed`, err);
    // performLLM records its own debug-log entry in a finally block;
    // we don't duplicate here. Errors thrown before the LLM call (e.g.
    // from resolveInput) go unlogged — they're UI/setup issues, not
    // model failures, and the toast is enough signal.
    logseq.UI.showMsg(`${action.title} failed: ${detail}`, "error");
  }
}

/**
 * Vision branch of `runAction`. Takes a block, validates it's an image
 * asset, reads bytes, calls the multimodal provider, parses 3 candidate
 * titles, presents a picker (with "keep current title" as a non-candidate
 * option), and on accept writes the selected text to `:block/title` via
 * `updateBlock`. Failures bubble with a hint that the model needs to
 * support images.
 */
async function runVisionAction(
  action: Action,
  ctx: RunActionContext,
  settings: ResolvedSettings,
  explicitBlockUuid?: string,
): Promise<void> {
  const visionModel = resolveVisionModel(settings);
  if (!visionModel) {
    logseq.UI.showMsg(
      "AI Actions: no vision model configured. Set 'Vision model' (or 'Model') in plugin settings.",
      "warning",
    );
    return;
  }

  const current = explicitBlockUuid
    ? await logseq.Editor.getBlock(explicitBlockUuid)
    : await logseq.Editor.getCurrentBlock();
  if (!current?.uuid) {
    logseq.UI.showMsg(
      `${action.title}: place your cursor in an image asset block first`,
      "warning",
    );
    return;
  }

  const block = (await logseq.Editor.getBlock(current.uuid)) as unknown as
    | (AssetBlock & { uuid: string; title?: string })
    | null;
  if (!block) {
    logseq.UI.showMsg(`${action.title}: could not load the current block`, "warning");
    return;
  }
  if (!isImageAsset(block)) {
    // Surface the asset/type we actually found (or "<not found>") so the
    // user can tell us if the SDK is serialising the property under a key
    // shape we haven't covered yet. Console-log the full block keys for
    // deeper debugging if ever needed.
    const seenType = getAssetType(block) ?? "<not found>";
    console.warn(
      "logseq-ai-actions: image-title rejected block; keys:",
      Object.keys(block),
      "asset/type:",
      seenType,
    );
    logseq.UI.showMsg(
      `${action.title}: this block is not a raster image asset (asset/type=${seenType}). Open the devtools console for the block's key list.`,
      "warning",
    );
    return;
  }

  const currentTitle = typeof block.title === "string" ? block.title : "";

  let busyToastKey: string | number | null = null;
  const startedAt = Date.now();
  let output: string | undefined;
  let error: string | undefined;
  try {
    const bytes = await loadImageAssetBytes(block);
    if (!bytes.ok) {
      logseq.UI.showMsg(`${action.title}: ${failureMessage(bytes.reason, bytes.hint)}`, "error");
      return;
    }

    const msg = await logseq.UI.showMsg(`${action.title}…`, "info", { timeout: 0 });
    busyToastKey = (msg as unknown as string | number | null) ?? null;

    // Short user-side nudge per outputMode. Most of the work is in the
    // system prompt; this is just a hint that orients the model on what
    // shape of response we want.
    const userPrompt =
      action.outputMode === "outline-append"
        ? "Extract the text from this image and return it as instructed."
        : "Generate three short titles for this image.";

    output = await ctx.provider.completeVision({
      baseUrl: settings.baseUrl,
      model: visionModel,
      system: action.systemPrompt,
      user: userPrompt,
      image: bytes,
      temperature: settings.temperature,
      timeoutMs: settings.timeoutMs,
      ...(settings.apiKey ? { apiKey: settings.apiKey } : {}),
    });

    closeBusyToast(busyToastKey);
    busyToastKey = null;

    if (action.outputMode === "outline-append") {
      // OCR-style flow: parse the model's outline+table response, confirm
      // a preview, append as nested children of the image block. Reuses
      // the existing parseOutline / insertOutlineTree helpers — vision
      // input only changes the LLM call, not the write path.
      const tree = parseOutline(output);
      if (tree.length === 0) {
        logseq.UI.showMsg(`${action.title}: no text detected in image`, "warning");
        return;
      }
      const nodeCount = countOutlineNodes(tree);
      const preview = renderOutlinePreview(tree);
      const plural = nodeCount === 1 ? "" : "s";
      const accepted = await showConfirm(action.title, {
        message: `Append ${nodeCount} block${plural} of extracted text under the image? Existing children are preserved.`,
        preview,
        acceptLabel: "Append text",
        baseUrl: settings.baseUrl,
      });
      if (!accepted) {
        logseq.UI.showMsg(`${action.title} discarded`, "info");
        return;
      }
      await insertOutlineTree(block.uuid, tree);
      logseq.UI.showMsg(`${action.title}: added ${nodeCount} block${plural}`, "success");
      return;
    }

    // Default: picker-replace (image-title flow).
    const titles = parseTitles(output, 3);
    if (titles.length === 0) {
      logseq.UI.showMsg(`${action.title}: model didn't return any usable titles`, "warning");
      return;
    }

    const choices: ChoicePanelChoice[] = titles.map((t) => ({ value: t, label: t }));
    if (currentTitle) {
      choices.push({
        value: `__keep__:${currentTitle}`,
        label: "Keep current title",
        subtitle: currentTitle,
      });
    }

    const picked = await showChoice(action.title, {
      message: "Pick a title for this image:",
      choices,
      baseUrl: settings.baseUrl,
    });
    if (picked === null) {
      logseq.UI.showMsg(`${action.title} discarded`, "info");
      return;
    }
    if (picked.startsWith("__keep__:")) {
      logseq.UI.showMsg(`${action.title}: kept existing title`, "info");
      return;
    }
    await logseq.Editor.updateBlock(block.uuid, picked);
    logseq.UI.showMsg(`${action.title}: title set`, "success");
  } catch (err) {
    closeBusyToast(busyToastKey);
    const detail = formatProviderError(err);
    error = detail;
    console.error(`logseq-ai-actions: ${action.id} failed`, err);
    logseq.UI.showMsg(
      `${action.title} failed: ${detail}\nMake sure your vision model supports images (Qwen3.5, Qwen2.5-VL, Llava, etc.).`,
      "error",
    );
  } finally {
    if (settings.debugLog) {
      debugLog.push({
        timestamp: startedAt,
        actionId: action.id,
        actionTitle: action.title,
        scope: action.scope,
        outputMode: action.outputMode,
        model: visionModel,
        baseUrl: settings.baseUrl,
        requestPreview: `[image asset: ${block?.uuid ?? "?"}]`,
        durationMs: Date.now() - startedAt,
        ...(output !== undefined
          ? { responsePreview: truncate(output, PREVIEW_TRUNCATION_LIMIT) }
          : {}),
        ...(error !== undefined ? { error } : {}),
      });
    }
  }
}

/**
 * Resolve which model to use for a vision action: prefer `visionModel`,
 * fall back to `model` if empty. Returns the trimmed string (caller checks
 * for empty to decide whether to abort with a settings-missing toast).
 */
function resolveVisionModel(settings: ResolvedSettings): string {
  const v = settings.visionModel.trim();
  return v.length > 0 ? v : settings.model.trim();
}

/**
 * Build the provider request body shared by both complete + stream.
 * Pulled out so the debug-log truncation in performLLM stays in sync
 * with the actual request.
 */
function buildProviderRequest(action: Action, input: ResolvedInput, settings: ResolvedSettings) {
  return {
    baseUrl: settings.baseUrl,
    model: settings.model,
    system: action.systemPrompt,
    user: input.llmInput,
    temperature: settings.temperature,
    timeoutMs: settings.timeoutMs,
    ...(settings.apiKey ? { apiKey: settings.apiKey } : {}),
  };
}

function recordDebugEntry(
  action: Action,
  input: ResolvedInput,
  settings: ResolvedSettings,
  startedAt: number,
  output: string | undefined,
  error: string | undefined,
): void {
  if (!settings.debugLog) return;
  debugLog.push({
    timestamp: startedAt,
    actionId: action.id,
    actionTitle: action.title,
    scope: action.scope,
    outputMode: action.outputMode,
    model: settings.model,
    baseUrl: settings.baseUrl,
    requestPreview: truncate(input.llmInput, PREVIEW_TRUNCATION_LIMIT),
    durationMs: Date.now() - startedAt,
    ...(output !== undefined
      ? { responsePreview: truncate(output, PREVIEW_TRUNCATION_LIMIT) }
      : {}),
    ...(error !== undefined ? { error } : {}),
  });
}

function formatProviderError(err: unknown): string {
  if (err instanceof LLMProviderError) {
    return `${err.message}${err.details?.status ? ` (HTTP ${err.details.status})` : ""}`;
  }
  return (err as Error).message;
}

/**
 * `logseq.UI.closeMsg` throws when the key is unknown (e.g., the toast
 * timed out on its own). Wrap once and swallow — every call site treated
 * the throw as ignorable.
 */
function closeBusyToast(key: string | number | null): void {
  if (key === null) return;
  try {
    logseq.UI.closeMsg(key as string);
  } catch {
    /* ignore — closeMsg throws on unknown key */
  }
}

/**
 * Run a single LLM call (streaming when `onChunk` is provided, one-shot
 * otherwise) and record a debug-log entry. Shared by every text-action
 * path so the debug-log shape stays identical regardless of mode.
 */
async function performLLM(
  provider: LLMProvider,
  action: Action,
  input: ResolvedInput,
  settings: ResolvedSettings,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const startedAt = Date.now();
  let output: string | undefined;
  let error: string | undefined;
  try {
    const req = buildProviderRequest(action, input, settings);
    output = onChunk ? await provider.stream(req, onChunk) : await provider.complete(req);
    return output;
  } catch (err) {
    error = formatProviderError(err);
    throw err;
  } finally {
    recordDebugEntry(action, input, settings, startedAt, output, error);
  }
}
