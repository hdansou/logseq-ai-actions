/** Shared fakes for tests that stand in for `logseq.Net` (@logseq/libs ≥ 0.3.4). */

export interface FakeNetResponse {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Record<string, string>;
  text: () => Promise<string>;
}

export function netResponse(
  overrides: Partial<Omit<FakeNetResponse, "text">> & { body?: string } = {},
): FakeNetResponse {
  const { body = "", ...rest } = overrides;
  return {
    status: 200,
    statusText: "OK",
    ok: true,
    headers: { "content-type": "application/json" },
    text: async () => body,
    ...rest,
  };
}

/** Mimics `LSPluginNetError`: an Error that carries the HTTP response. */
export function netHttpError(response: FakeNetResponse): Error & { response: FakeNetResponse } {
  return Object.assign(new Error(`HTTP request failed with status ${response.status}`), {
    response,
  });
}
