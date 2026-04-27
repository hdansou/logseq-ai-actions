/** Non-streaming completion request against an OpenAI-compatible endpoint. */
export interface CompleteRequest {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey?: string;
  readonly system: string;
  readonly user: string;
  readonly temperature: number;
  readonly timeoutMs: number;
}

/**
 * A single image to send to a vision-capable model. `mimeType` and `base64`
 * are embedded into a `data:` URL inside the OpenAI multimodal `image_url`
 * content block.
 */
export interface VisionImage {
  readonly mimeType: string;
  readonly base64: string;
}

/**
 * Vision request — text prompt plus one image. Same transport / endpoint
 * as `complete`, just a multimodal `messages` body.
 */
export interface CompleteVisionRequest {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey?: string;
  readonly system: string;
  readonly user: string;
  readonly image: VisionImage;
  readonly temperature: number;
  readonly timeoutMs: number;
}

/**
 * Provider interface. One implementation today (`createOpenAIProvider`);
 * WebLLM / cloud providers can drop in later without touching callers.
 * See REQUIREMENTS §2.
 */
export interface LLMProvider {
  /** Non-streaming: POST and await the whole response. */
  complete(req: CompleteRequest): Promise<string>;
  /**
   * Streaming: POST with `stream: true`, invoke `onChunk` for each
   * delta as it arrives, resolve with the trimmed accumulated text
   * when the stream ends.
   */
  stream(req: CompleteRequest, onChunk: (delta: string) => void): Promise<string>;
  /**
   * Non-streaming multimodal completion — sends `image` alongside `user`
   * text in an OpenAI-compatible multimodal `messages` body. The endpoint
   * + model must support vision (Qwen3.5, Llava, Qwen2.5-VL, etc.); a
   * text-only model will return an error which surfaces unchanged.
   */
  completeVision(req: CompleteVisionRequest): Promise<string>;
}

/**
 * Options for `createOpenAIProvider`. The only knob today is `fetchImpl`,
 * which lets the Logseq adapter inject a CORS-free transport based on
 * `logseq.Request._request` for desktop Electron users. When omitted,
 * the provider uses `globalThis.fetch`.
 */
export interface ProviderOptions {
  readonly fetchImpl?: typeof globalThis.fetch;
}

/**
 * Shape of the diagnostic payload attached to an `LLMProviderError`.
 *
 * `bodyExcerpt` carries up to 200 chars of the upstream error response so
 * the user can diagnose CORS / 401 / model-not-found failures from the
 * Diagnostics panel. If the upstream server reflects request headers in
 * its error body, an `Authorization: Bearer …` value could appear here —
 * the buffer is in-memory only and never written to disk, but treat it
 * as sensitive when sharing screenshots from `/AI Diagnostics`.
 */
export interface LLMProviderErrorDetails {
  readonly status?: number;
  readonly bodyExcerpt?: string;
}

/** Thrown for any failure — HTTP, timeout, network, or malformed response. */
export class LLMProviderError extends Error {
  readonly details?: LLMProviderErrorDetails;
  constructor(message: string, details?: LLMProviderErrorDetails) {
    super(message);
    this.name = "LLMProviderError";
    if (details !== undefined) this.details = details;
  }
}

export function createOpenAIProvider(options: ProviderOptions = {}): LLMProvider {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  return {
    complete: (req) => openAIComplete(req, fetchFn),
    stream: (req, onChunk) => openAIStream(req, onChunk, fetchFn),
    completeVision: (req) => openAIVisionComplete(req, fetchFn),
  };
}

interface PostChatOptions {
  readonly baseUrl: string;
  readonly apiKey: string | undefined;
  readonly body: object;
  readonly timeoutMs: number;
  readonly fetchFn: typeof globalThis.fetch;
}

interface PostChatResult {
  readonly res: Response;
  /**
   * Cancel the pending abort timer. Non-streaming callers invoke this in
   * a `finally` after `res.json()`; streaming callers defer until the
   * read loop exits so a hanging stream still aborts.
   */
  readonly clearTimer: () => void;
}

/**
 * Shared transport for every chat-completions call. Handles URL building,
 * Authorization header, AbortController + timeout, and error normalisation
 * to `LLMProviderError`. Returns the raw `Response` and a `clearTimer`
 * the caller is responsible for invoking once the response body is fully
 * consumed.
 */
async function postChat(opts: PostChatOptions): Promise<PostChatResult> {
  const url = `${ensureTrailingSlash(opts.baseUrl)}chat/completions`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);
  const clearTimer = () => clearTimeout(timeoutId);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

  let res: Response;
  try {
    res = await opts.fetchFn(url, {
      method: "POST",
      headers,
      body: JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimer();
    if ((err as Error).name === "AbortError") {
      throw new LLMProviderError(`Request timed out after ${opts.timeoutMs}ms`);
    }
    throw new LLMProviderError(`Request failed: ${(err as Error).message}`);
  }

  if (!res.ok) {
    clearTimer();
    const bodyText = await res.text().catch(() => "");
    throw new LLMProviderError(`HTTP ${res.status} from ${url}`, {
      status: res.status,
      bodyExcerpt: bodyText.slice(0, 200),
    } satisfies LLMProviderErrorDetails);
  }

  return { res, clearTimer };
}

/** Build the standard chat-completions body for text-only requests. */
function buildTextBody(req: CompleteRequest, stream: boolean) {
  return {
    model: req.model,
    temperature: req.temperature,
    stream,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
  };
}

/** Build the multimodal body — `user` content is an array of text + image_url blocks. */
function buildVisionBody(req: CompleteVisionRequest) {
  const dataUrl = `data:${req.image.mimeType};base64,${req.image.base64}`;
  return {
    model: req.model,
    temperature: req.temperature,
    stream: false,
    messages: [
      { role: "system", content: req.system },
      {
        role: "user",
        content: [
          { type: "text", text: req.user },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  };
}

/** Pull the assistant `content` out of a chat-completions JSON response. */
async function parseChatContent(res: Response, contextLabel: string): Promise<string> {
  const json = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  } | null;
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new LLMProviderError(`No content in ${contextLabel}`);
  }
  return content.trim();
}

async function openAIComplete(
  req: CompleteRequest,
  fetchFn: typeof globalThis.fetch,
): Promise<string> {
  const { res, clearTimer } = await postChat({
    baseUrl: req.baseUrl,
    apiKey: req.apiKey,
    body: buildTextBody(req, false),
    timeoutMs: req.timeoutMs,
    fetchFn,
  });
  try {
    return await parseChatContent(res, "response choices");
  } finally {
    clearTimer();
  }
}

async function openAIStream(
  req: CompleteRequest,
  onChunk: (delta: string) => void,
  fetchFn: typeof globalThis.fetch,
): Promise<string> {
  const { createSSEParser } = await import("./sse");
  const { res, clearTimer } = await postChat({
    baseUrl: req.baseUrl,
    apiKey: req.apiKey,
    body: buildTextBody(req, true),
    timeoutMs: req.timeoutMs,
    fetchFn,
  });

  if (!res.body) {
    clearTimer();
    throw new LLMProviderError("Streaming response has no body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSSEParser();
  let accumulated = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      for (const delta of parser.push(text)) {
        accumulated += delta;
        onChunk(delta);
      }
    }
    // Final decode flush for any buffered bytes.
    const tail = decoder.decode();
    if (tail) {
      for (const delta of parser.push(tail)) {
        accumulated += delta;
        onChunk(delta);
      }
    }
    for (const delta of parser.flush()) {
      accumulated += delta;
      onChunk(delta);
    }
    if (accumulated.length === 0) {
      throw new LLMProviderError("No content in streamed response");
    }
    return accumulated.trim();
  } catch (err) {
    if (err instanceof LLMProviderError) throw err;
    if ((err as Error).name === "AbortError") {
      throw new LLMProviderError(`Request timed out after ${req.timeoutMs}ms`);
    }
    throw new LLMProviderError(`Stream failed: ${(err as Error).message}`);
  } finally {
    clearTimer();
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

async function openAIVisionComplete(
  req: CompleteVisionRequest,
  fetchFn: typeof globalThis.fetch,
): Promise<string> {
  if (!req.image.base64 || !req.image.mimeType) {
    throw new LLMProviderError("Vision request requires both image.mimeType and image.base64");
  }
  const { res, clearTimer } = await postChat({
    baseUrl: req.baseUrl,
    apiKey: req.apiKey,
    body: buildVisionBody(req),
    timeoutMs: req.timeoutMs,
    fetchFn,
  });
  try {
    return await parseChatContent(res, "vision response choices");
  } finally {
    clearTimer();
  }
}

function ensureTrailingSlash(s: string): string {
  return s.endsWith("/") ? s : `${s}/`;
}
