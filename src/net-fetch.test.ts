import { describe, expect, it, vi } from "vitest";
import { createNetFetch, type NetLike } from "./net-fetch";
import { netHttpError, netResponse } from "./test-support/net";

function makeFetch(request: NetLike["request"] | undefined, fallback = vi.fn()) {
  const netFetch = createNetFetch(() => (request ? { request } : undefined), fallback);
  return { netFetch, fallback };
}

describe("createNetFetch", () => {
  it("proxies POST through Net.request with method, headers, text body, no cache", async () => {
    const request = vi.fn().mockResolvedValue(netResponse({ body: '{"ok":true}' }));
    const { netFetch } = makeFetch(request);

    const res = await netFetch("http://localhost:8888/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer k" },
      body: '{"model":"m"}',
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://localhost:8888/v1/chat/completions",
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer k" },
        body: '{"model":"m"}',
        responseType: "text",
        cache: false,
      }),
    );
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("defaults the method to GET and omits the body", async () => {
    const request = vi.fn().mockResolvedValue(netResponse({ body: "[]" }));
    const { netFetch } = makeFetch(request);

    await netFetch("http://localhost:8888/v1/models");

    const opts = request.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(opts.method).toBe("GET");
    expect(opts).not.toHaveProperty("body");
  });

  it("accepts URL objects and Request-less inputs", async () => {
    const request = vi.fn().mockResolvedValue(netResponse());
    const { netFetch } = makeFetch(request);

    await netFetch(new URL("http://localhost:8888/v1/models"));

    expect((request.mock.calls[0]?.[0] as { url: string }).url).toBe(
      "http://localhost:8888/v1/models",
    );
  });

  it("passes the abort signal through to Net", async () => {
    const request = vi.fn().mockResolvedValue(netResponse());
    const { netFetch } = makeFetch(request);
    const controller = new AbortController();

    await netFetch("http://x/y", { method: "POST", body: "{}", signal: controller.signal });

    expect((request.mock.calls[0]?.[0] as { signal?: AbortSignal }).signal).toBe(controller.signal);
  });

  it("returns a body that can be read as a stream (SSE parser contract)", async () => {
    const sse = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n';
    const request = vi.fn().mockResolvedValue(netResponse({ body: sse }));
    const { netFetch } = makeFetch(request);

    const res = await netFetch("http://x/y", { method: "POST", body: "{}" });
    const reader = res.body?.getReader();
    expect(reader).toBeDefined();
    const chunk = await reader?.read();
    expect(new TextDecoder().decode(chunk?.value)).toBe(sse);
  });

  it("turns an HTTP error from Net into a non-ok Response with its status and body", async () => {
    const request = vi
      .fn()
      .mockRejectedValue(
        netHttpError(
          netResponse({ status: 404, statusText: "Not Found", ok: false, body: "no such model" }),
        ),
      );
    const { netFetch } = makeFetch(request);

    const res = await netFetch("http://x/y", { method: "POST", body: "{}" });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
    expect(res.statusText).toBe("Not Found");
    expect(await res.text()).toBe("no such model");
  });

  it("rethrows non-HTTP Net failures instead of masking them with a CORS-blocked fetch", async () => {
    const request = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:8888"));
    const { netFetch, fallback } = makeFetch(request);

    await expect(netFetch("http://x/y", { method: "POST", body: "{}" })).rejects.toThrow(
      "ECONNREFUSED",
    );
    expect(fallback).not.toHaveBeenCalled();
  });

  it("reports our own abort as AbortError even when the host words it differently", async () => {
    const controller = new AbortController();
    const request = vi.fn().mockImplementation(async () => {
      controller.abort();
      throw new Error(
        "Error invoking remote method 'main': AbortError: The operation was aborted.",
      );
    });
    const { netFetch } = makeFetch(request);

    await expect(netFetch("http://x/y", { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("falls back to the provided fetch when Net is unavailable", async () => {
    const fallback = vi.fn().mockResolvedValue(new Response("direct"));
    const { netFetch } = makeFetch(undefined, fallback);

    const res = await netFetch("http://x/y", { method: "POST", body: "{}" });

    expect(fallback).toHaveBeenCalledWith("http://x/y", { method: "POST", body: "{}" });
    expect(await res.text()).toBe("direct");
  });

  it("does not require a string body: non-string bodies go to the fallback", async () => {
    const fallback = vi.fn().mockResolvedValue(new Response("direct"));
    const request = vi.fn();
    const { netFetch } = makeFetch(request, fallback);

    await netFetch("http://x/y", { method: "POST", body: new Uint8Array([1, 2]) });

    expect(request).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalled();
  });
});
