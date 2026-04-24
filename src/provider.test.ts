import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenAIProvider, LLMProviderError } from "./provider";

const baseReq = {
  baseUrl: "http://localhost:1234/v1",
  model: "test-model",
  system: "Fix grammar.",
  user: "Their are issues.",
  temperature: 0.3,
  timeoutMs: 5_000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createOpenAIProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("POSTs to {baseUrl}/chat/completions with the expected body", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: "There are issues." } }] }),
    );

    const result = await createOpenAIProvider().complete(baseReq);

    expect(result).toBe("There are issues.");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:1234/v1/chat/completions");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body).toMatchObject({
      model: "test-model",
      temperature: 0.3,
      stream: false,
      messages: [
        { role: "system", content: "Fix grammar." },
        { role: "user", content: "Their are issues." },
      ],
    });
  });

  it("sends Authorization header when apiKey is provided", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: "ok" } }] }));

    await createOpenAIProvider().complete({ ...baseReq, apiKey: "sk-test" });

    const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer sk-test");
  });

  it("omits Authorization header when apiKey is missing", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: "ok" } }] }));

    await createOpenAIProvider().complete(baseReq);

    const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBeUndefined();
  });

  it("handles baseUrl with trailing slash", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: "ok" } }] }));

    await createOpenAIProvider().complete({ ...baseReq, baseUrl: "http://localhost:1234/v1/" });

    expect(String((fetchMock.mock.calls[0] as [string, RequestInit])[0])).toBe(
      "http://localhost:1234/v1/chat/completions",
    );
  });

  it("throws LLMProviderError on non-OK HTTP status", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Model not found", { status: 404 }));

    await expect(createOpenAIProvider().complete(baseReq)).rejects.toBeInstanceOf(LLMProviderError);
  });

  it("surfaces HTTP status and body excerpt on the error details", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Model not found", { status: 404 }));

    await expect(createOpenAIProvider().complete(baseReq)).rejects.toMatchObject({
      name: "LLMProviderError",
      details: { status: 404, bodyExcerpt: "Model not found" },
    });
  });

  it("throws when response has no content in choices", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [] }));

    await expect(createOpenAIProvider().complete(baseReq)).rejects.toThrow(/content/i);
  });

  it("trims whitespace from response content", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: "  corrected text  \n" } }] }),
    );

    const result = await createOpenAIProvider().complete(baseReq);
    expect(result).toBe("corrected text");
  });

  it("wraps network errors as LLMProviderError", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(createOpenAIProvider().complete(baseReq)).rejects.toBeInstanceOf(LLMProviderError);
  });

  it("uses the injected fetchImpl option when provided, bypassing globalThis.fetch", async () => {
    const injected = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: "injected" } }] }));

    const result = await createOpenAIProvider({ fetchImpl: injected }).complete(baseReq);

    expect(result).toBe("injected");
    expect(injected).toHaveBeenCalledOnce();
    // globalThis.fetch must NOT have been called when fetchImpl was provided.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("stream", () => {
    function sseEvent(delta: string): string {
      return `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`;
    }

    function streamingResponse(chunks: string[], status = 200): Response {
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      });
      return new Response(body, {
        status,
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    it("POSTs with stream: true and resolves to the accumulated trimmed text", async () => {
      fetchMock.mockResolvedValueOnce(
        streamingResponse([sseEvent("Hello"), sseEvent(", "), sseEvent("world!"), "data: [DONE]\n\n"]),
      );
      const chunks: string[] = [];
      const result = await createOpenAIProvider().stream(baseReq, (c) => chunks.push(c));

      expect(result).toBe("Hello, world!");
      expect(chunks).toEqual(["Hello", ", ", "world!"]);
      const opts = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
      const sentBody = JSON.parse(opts.body as string);
      expect(sentBody.stream).toBe(true);
    });

    it("throws LLMProviderError on non-OK HTTP status", async () => {
      fetchMock.mockResolvedValueOnce(new Response("model unavailable", { status: 503 }));
      await expect(
        createOpenAIProvider().stream(baseReq, () => {}),
      ).rejects.toMatchObject({
        name: "LLMProviderError",
        details: { status: 503 },
      });
    });

    it("wraps network failures as LLMProviderError", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      await expect(
        createOpenAIProvider().stream(baseReq, () => {}),
      ).rejects.toBeInstanceOf(LLMProviderError);
    });

    it("throws 'No content' when stream closes with no deltas", async () => {
      fetchMock.mockResolvedValueOnce(streamingResponse(["data: [DONE]\n\n"]));
      await expect(
        createOpenAIProvider().stream(baseReq, () => {}),
      ).rejects.toThrow(/no content/i);
    });

    it("throws a timeout error when the abort signal fires", async () => {
      fetchMock.mockImplementationOnce(async (_url: string, opts: RequestInit) => {
        const signal = opts.signal as AbortSignal;
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      });
      await expect(
        createOpenAIProvider().stream({ ...baseReq, timeoutMs: 10 }, () => {}),
      ).rejects.toThrow(/timed out/i);
    });
  });

  it("throws a timeout error when the abort signal fires", async () => {
    fetchMock.mockImplementationOnce(async (_url: string, opts: RequestInit) => {
      const signal = opts.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    await expect(createOpenAIProvider().complete({ ...baseReq, timeoutMs: 10 })).rejects.toThrow(
      /timed out/i,
    );
  });
});
