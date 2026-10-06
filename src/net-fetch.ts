/**
 * `fetch`-shaped wrapper over Logseq's `logseq.Net` (@logseq/libs ≥ 0.3.4).
 *
 * On Desktop, `Net.request` is proxied by the host process, so it isn't subject
 * to browser CORS — the plugin iframe's own `fetch` is, and most local LLM
 * servers don't send CORS headers. On Web, `Net` falls back to browser fetch
 * inside the SDK, so there is nothing for us to special-case.
 *
 * Responses are buffered by the host: streaming (SSE) still works but arrives
 * all at once rather than incrementally.
 *
 * Pure of SDK imports — the `Net` object is injected — so it is unit-testable.
 */

/** Minimal structural view of `logseq.Net` / `LSPluginNetResponse`. */
interface NetResponseLike {
  readonly status: number;
  readonly statusText: string;
  readonly ok: boolean;
  readonly headers: Record<string, string>;
  text(): Promise<string>;
}

type NetMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

export interface NetLike {
  request(options: {
    url: string;
    method?: NetMethod;
    headers?: Record<string, string>;
    body?: string;
    responseType?: "text";
    cache?: boolean;
    signal?: AbortSignal;
  }): Promise<NetResponseLike>;
}

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** `LSPluginNetError` carries the HTTP response; any other error has none. */
function httpErrorResponse(err: unknown): NetResponseLike | undefined {
  const response = (err as { response?: NetResponseLike } | null)?.response;
  return response && typeof response.status === "number" ? response : undefined;
}

async function toResponse(res: NetResponseLike): Promise<Response> {
  const text = await res.text();
  // A `Response` can't be built with a null-body status and a body.
  const nullBody = res.status === 204 || res.status === 205 || res.status === 304;
  return new Response(nullBody ? null : text, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}

export function createNetFetch(getNet: () => NetLike | undefined, fallback: FetchFn): FetchFn {
  return async (input, init) => {
    const net = getNet();
    const body = init?.body;
    // Net only carries string bodies; everything we send is JSON text.
    if (!net || (body !== undefined && body !== null && typeof body !== "string")) {
      return fallback(input, init);
    }

    const url = typeof input === "string" ? input : input.toString();
    try {
      const res = await net.request({
        url,
        method: (init?.method ?? "GET").toUpperCase() as NetMethod,
        headers: (init?.headers ?? {}) as Record<string, string>,
        ...(typeof body === "string" ? { body } : {}),
        responseType: "text",
        cache: false,
        ...(init?.signal ? { signal: init.signal } : {}),
      });
      return await toResponse(res);
    } catch (err) {
      // Non-2xx: hand back a real Response so callers' `!res.ok` handling
      // reports the status and body. Anything else (refused connection,
      // abort, timeout) is rethrown — falling back to `fetch` here would
      // only replace the real cause with a misleading CORS error.
      const response = httpErrorResponse(err);
      if (response) return toResponse(response);
      throw err;
    }
  };
}
