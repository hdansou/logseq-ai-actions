import { createNetFetch, type NetLike } from "../../src/net-fetch";
import { createOpenAIProvider } from "../../src/provider";
import { netHttpError, netResponse } from "../../src/test-support/net";

/**
 * Shared Tier 2 setup: the real provider + `createNetFetch` against a live
 * OpenAI-compatible server. Node has no CORS, so `Net` is stood in for by
 * Node's `fetch`.
 *
 *   TEST_LIVE_LLM=1 LIVE_LLM_MODEL=<model id> [LIVE_LLM_BASE_URL=http://127.0.0.1:8888/v1]
 *   [LIVE_LLM_TEMPERATURE=1] [LIVE_LLM_REPEATS=3] pnpm test:integration
 */
export const live = import.meta.env.TEST_LIVE_LLM === "1";
export const baseUrl = import.meta.env.LIVE_LLM_BASE_URL ?? "http://127.0.0.1:8888/v1";
export const model = import.meta.env.LIVE_LLM_MODEL ?? "";
/** Defaults to 1 — the temperature real users run with (see plugin settings). */
export const temperature = Number(import.meta.env.LIVE_LLM_TEMPERATURE ?? 1);
/** Each prompt case must pass this many runs in a row. */
export const repeats = Number(import.meta.env.LIVE_LLM_REPEATS ?? 3);

const nodeNet: NetLike = {
  async request({ url, method, headers, body, signal }) {
    const res = await fetch(url, {
      method: method ?? "GET",
      headers: headers ?? {},
      body: body ?? null,
      signal: signal ?? null,
    });
    const fake = netResponse({
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      body: await res.text(),
    });
    if (!res.ok) throw netHttpError(fake);
    return fake;
  },
};

export const provider = createOpenAIProvider({ fetchImpl: createNetFetch(() => nodeNet, fetch) });
