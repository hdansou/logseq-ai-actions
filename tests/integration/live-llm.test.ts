import { describe, expect, it } from "vitest";
import { createNetFetch, type NetLike } from "../../src/net-fetch";
import { createOpenAIProvider } from "../../src/provider";
import { netHttpError, netResponse } from "../../src/test-support/net";

/**
 * Tier 2: the real provider + `createNetFetch` against a live OpenAI-compatible
 * server. Node has no CORS, so `Net` is stood in for by Node's `fetch`; this
 * checks the wire format (body, auth, SSE) against a real server, not Logseq.
 *
 *   TEST_LIVE_LLM=1 LIVE_LLM_MODEL=<model id> [LIVE_LLM_BASE_URL=http://127.0.0.1:8888/v1] \
 *     pnpm test:integration
 */
const live = process.env.TEST_LIVE_LLM === "1";
const baseUrl = process.env.LIVE_LLM_BASE_URL ?? "http://127.0.0.1:8888/v1";
const model = process.env.LIVE_LLM_MODEL ?? "";

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

const provider = createOpenAIProvider({ fetchImpl: createNetFetch(() => nodeNet, fetch) });
const req = {
  baseUrl,
  model,
  system: "Reply with exactly one word.",
  user: "Say hello.",
  temperature: 0,
  timeoutMs: 120_000,
};

describe.skipIf(!live)("live LLM endpoint", () => {
  it("requires LIVE_LLM_MODEL", () => {
    expect(model).not.toBe("");
  });

  it("complete() returns text", async () => {
    expect((await provider.complete(req)).trim().length).toBeGreaterThan(0);
  });

  it("stream() delivers deltas that add up to the returned text", async () => {
    const chunks: string[] = [];
    const out = await provider.stream(req, (d) => chunks.push(d));
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join("")).toBe(out);
  });
});
