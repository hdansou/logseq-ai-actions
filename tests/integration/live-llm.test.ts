import { describe, expect, it } from "vitest";
import { baseUrl, live, model, provider } from "./live";

/** Tier 2 transport check: wire format (body, auth, SSE) against a real server. */
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
