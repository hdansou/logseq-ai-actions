import { describe, expect, it, vi } from "vitest";
import { createNetFetch, type NetLike } from "./net-fetch";
import { createOpenAIProvider } from "./provider";
import { type FakeNetResponse, netHttpError, netResponse } from "./test-support/net";

/**
 * End-to-end (in-process) tests: the real provider driven through the real
 * `createNetFetch`, with only the host boundary (`logseq.Net`) faked.
 * Fakes mirror what @logseq/libs 0.3.4 + the Desktop host actually do.
 */

const req = {
  baseUrl: "http://127.0.0.1:8888/v1",
  model: "test-model",
  system: "Fix grammar.",
  user: "Their are issues.",
  temperature: 0.3,
  timeoutMs: 5_000,
};

type NetRequest = Parameters<NetLike["request"]>[0];

/**
 * Fake `logseq.Net`. Like the real host proxy it rejects an in-flight request
 * with a plain Error (NOT name === "AbortError") whose message carries the
 * abort text — see the logseq-net-probe "timeout" row on Desktop.
 */
function fakeNet(handler: (opts: NetRequest) => Promise<FakeNetResponse>) {
  const request = vi.fn((opts: NetRequest) => {
    return new Promise<FakeNetResponse>((resolve, reject) => {
      opts.signal?.addEventListener("abort", () =>
        reject(
          new Error("Error invoking remote method 'main': AbortError: The operation was aborted."),
        ),
      );
      handler(opts).then(resolve, reject);
    });
  });
  return { net: { request } satisfies NetLike, request };
}

function providerOver(net: NetLike, fallback = vi.fn()) {
  return createOpenAIProvider({ fetchImpl: createNetFetch(() => net, fallback) });
}

describe("provider over logseq.Net (end to end)", () => {
  it("complete(): POSTs the chat body to {baseUrl}/chat/completions and returns the content", async () => {
    const { net, request } = fakeNet(async () =>
      netResponse({
        body: JSON.stringify({ choices: [{ message: { content: "There are issues." } }] }),
      }),
    );

    const out = await providerOver(net).complete({ ...req, apiKey: "k" });

    expect(out).toBe("There are issues.");
    const opts = request.mock.calls[0]?.[0] as NetRequest;
    expect(opts.url).toBe("http://127.0.0.1:8888/v1/chat/completions");
    expect(opts.method).toBe("POST");
    expect(opts.headers).toMatchObject({ Authorization: "Bearer k" });
    expect(JSON.parse(opts.body as string)).toMatchObject({ model: "test-model", stream: false });
  });

  it("stream(): delivers every delta from the buffered SSE body and returns the full text", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      "data: [DONE]",
      "",
    ].join("\n\n");
    const { net } = fakeNet(async () => netResponse({ body: sse }));
    const chunks: string[] = [];

    const out = await providerOver(net).stream(req, (d) => chunks.push(d));

    expect(chunks).toEqual(["Hel", "lo"]);
    expect(out).toBe("Hello");
  });

  it("maps a non-2xx host error to LLMProviderError with status and body excerpt", async () => {
    const { net } = fakeNet(async () => {
      throw netHttpError(
        netResponse({ status: 401, statusText: "Unauthorized", ok: false, body: "bad key" }),
      );
    });

    await expect(providerOver(net).complete(req)).rejects.toMatchObject({
      name: "LLMProviderError",
      details: { status: 401, bodyExcerpt: "bad key" },
    });
  });

  it("surfaces a refused connection as itself, never as a CORS-blocked fetch", async () => {
    const { net } = fakeNet(async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8888");
    });
    const fallback = vi.fn();

    await expect(providerOver(net, fallback).complete(req)).rejects.toThrow(/ECONNREFUSED/);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("adds the Local Network hint when the host can't route to the endpoint", async () => {
    const { net } = fakeNet(async () => {
      throw new Error(
        "Error invoking remote method 'main': FetchError: request to http://192.168.101.14:8888/v1/chat/completions failed, reason: connect EHOSTUNREACH 192.168.101.14:8888",
      );
    });

    await expect(providerOver(net).complete(req)).rejects.toThrow(/EHOSTUNREACH.*Local Network/s);
  });

  it("reports a timeout as a timeout when the host rejects with its own abort error", async () => {
    const { net } = fakeNet(() => new Promise(() => {})); // never answers

    await expect(providerOver(net).complete({ ...req, timeoutMs: 20 })).rejects.toThrow(
      /timed out after 20ms/,
    );
  });
});
