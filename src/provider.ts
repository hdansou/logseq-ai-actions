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

/** Shape of the diagnostic payload attached to an `LLMProviderError`. */
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
  };
}

async function openAIComplete(
  req: CompleteRequest,
  fetchFn: typeof globalThis.fetch,
): Promise<string> {
  const url = `${ensureTrailingSlash(req.baseUrl)}chat/completions`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), req.timeoutMs);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (req.apiKey) headers.Authorization = `Bearer ${req.apiKey}`;

  const body = JSON.stringify({
    model: req.model,
    temperature: req.temperature,
    stream: false,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
  });

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if ((err as Error).name === "AbortError") {
      throw new LLMProviderError(`Request timed out after ${req.timeoutMs}ms`);
    }
    throw new LLMProviderError(`Request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new LLMProviderError(`HTTP ${res.status} from ${url}`, {
      status: res.status,
      bodyExcerpt: bodyText.slice(0, 200),
    } satisfies LLMProviderErrorDetails);
  }

  const json = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  } | null;

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new LLMProviderError("No content in response choices");
  }
  return content.trim();
}

async function openAIStream(
  req: CompleteRequest,
  onChunk: (delta: string) => void,
  fetchFn: typeof globalThis.fetch,
): Promise<string> {
  const { createSSEParser } = await import("./sse");
  const url = `${ensureTrailingSlash(req.baseUrl)}chat/completions`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), req.timeoutMs);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (req.apiKey) headers.Authorization = `Bearer ${req.apiKey}`;

  const body = JSON.stringify({
    model: req.model,
    temperature: req.temperature,
    stream: true,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
  });

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if ((err as Error).name === "AbortError") {
      throw new LLMProviderError(`Request timed out after ${req.timeoutMs}ms`);
    }
    throw new LLMProviderError(`Request failed: ${(err as Error).message}`);
  }

  if (!res.ok) {
    clearTimeout(timeoutId);
    const bodyText = await res.text().catch(() => "");
    throw new LLMProviderError(`HTTP ${res.status} from ${url}`, {
      status: res.status,
      bodyExcerpt: bodyText.slice(0, 200),
    } satisfies LLMProviderErrorDetails);
  }

  if (!res.body) {
    clearTimeout(timeoutId);
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
    clearTimeout(timeoutId);
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

function ensureTrailingSlash(s: string): string {
  return s.endsWith("/") ? s : `${s}/`;
}
