/// <reference types="@logseq/libs" />

/**
 * Probe whether the plugin iframe can reach its parent frame — i.e.
 * whether we're in Logseq Desktop (same-origin, host-scope reachable)
 * or Logseq Web (cross-origin, `logseq.Request._request` will fail
 * inside the SDK and emit a noisy "Can not access host scope!" error
 * before we can catch it).
 *
 * Accessing `window.parent.document` on a cross-origin frame throws
 * `SecurityError` synchronously. Wrapping in try/catch suppresses the
 * throw without emitting to the console. Cached on first call — one
 * property access per session, zero noise on subsequent requests.
 */
let hostScopeReachable: boolean | null = null;

export function isHostScopeReachable(): boolean {
  if (hostScopeReachable !== null) return hostScopeReachable;
  try {
    void window.parent.document;
    hostScopeReachable = true;
  } catch {
    hostScopeReachable = false;
  }
  return hostScopeReachable;
}

/**
 * Fetch shim that tries to route HTTP through Logseq's own `logseq.Request`
 * helper (Electron desktop only — uses Electron's `net` module, bypassing
 * browser CORS). On anything going wrong — API missing, host scope
 * unreachable, unexpected shape — fall back to `globalThis.fetch` so
 * behaviour is never worse than the current direct-fetch path.
 *
 * `logseq.Request` is an underscore-prefixed SDK internal; its return
 * shape isn't fully characterised by the public typings. We handle both
 * "returns body directly" and "returns { data: body }" to be safe.
 */
export async function logseqFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Short-circuit on web Logseq — `logseq.Request._request` would try to
  // reach the host iframe for us, hit the same-origin wall, and log
  // `Can not access host scope!` via its own console.error before we
  // could catch it. Probe ourselves (silently) and skip the SDK call.
  if (!isHostScopeReachable()) {
    return globalThis.fetch(input, init);
  }

  const url = typeof input === "string" ? input : input.toString();
  const req = (logseq as { Request?: { _request?: (opts: unknown) => Promise<unknown> } }).Request;
  if (!req?._request) {
    return globalThis.fetch(input, init);
  }
  try {
    const method = init?.method ?? "GET";
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const data = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    const result = await req._request({ url, method, headers, data });
    const body = (result as { data?: unknown })?.data ?? result;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.warn("logseq-ai-actions: logseq.Request failed, falling back to fetch", err);
    return globalThis.fetch(input, init);
  }
}
