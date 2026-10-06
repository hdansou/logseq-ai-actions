import type { EndpointTrust } from "./types";

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

/**
 * Classify a base URL as `local` (loopback only) or `remote`.
 *
 * "local" is strict per REQUIREMENTS §8: only `localhost`, `127.0.0.1`,
 * `0.0.0.0`, and the IPv6 loopback `::1` (which `URL.hostname` normalises
 * to `"[::1]"`). Private LAN ranges (10.*, 192.168.*, 172.16–31.*) are
 * REMOTE in v1 — a host on your LAN isn't the same trust boundary as
 * your own machine. Invalid input is also treated as remote (fail closed).
 */
export function classifyEndpoint(baseUrl: string): EndpointTrust {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return "remote";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "remote";
  }
  const host = parsed.hostname.toLowerCase();
  if (!host) return "remote";
  return LOOPBACK_HOSTS.has(host) ? "local" : "remote";
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Drop `user:pass@` from a URL before it is shown or logged (badge tooltip,
 * error toasts, debug log). URLs without credentials are returned exactly as
 * typed; unparseable input is returned unchanged.
 */
export function redactUrl(url: string): string {
  const parsed = parseUrl(url);
  if (!parsed || (!parsed.username && !parsed.password)) return url;
  parsed.username = "";
  parsed.password = "";
  return parsed.href;
}

/** Lowercased `host[:port]` of a URL (never includes credentials); "" if unparseable. */
export function endpointHost(url: string): string {
  return parseUrl(url)?.host.toLowerCase() ?? "";
}

/**
 * Whether changing the endpoint to `baseUrl` should show the REMOTE notice:
 * on a LOCAL → REMOTE change, or when a REMOTE endpoint moves to another host.
 * `prev.host` is "" until a host has been recorded, so upgrading users who are
 * already REMOTE are not re-prompted for the endpoint they already accepted.
 * An unparseable URL never notifies: nothing can be sent to it.
 */
export function shouldNotifyRemote(prev: EndpointMarker, baseUrl: string): boolean {
  if (!endpointHost(baseUrl) || classifyEndpoint(baseUrl) !== "remote") return false;
  if (prev.trust !== "remote") return true;
  return prev.host !== "" && prev.host !== endpointHost(baseUrl);
}

export interface EndpointMarker {
  readonly trust: string;
  readonly host: string;
}

/**
 * The endpoint marker to store after a settings change, or null to keep the
 * current one. An unparseable URL (e.g. a half-edited field) keeps the last
 * good marker, so A → invalid → B still notifies for B.
 */
export function nextEndpointMarker(prev: EndpointMarker, baseUrl: string): EndpointMarker | null {
  const host = endpointHost(baseUrl);
  if (!host) return null;
  const trust = classifyEndpoint(baseUrl);
  return trust === prev.trust && host === prev.host ? null : { trust, host };
}

/** True when an API key would travel unencrypted (`http:`) to a non-loopback host. */
export function sendsKeyInCleartext(baseUrl: string, apiKey: string): boolean {
  return (
    apiKey.trim() !== "" &&
    parseUrl(baseUrl)?.protocol === "http:" &&
    classifyEndpoint(baseUrl) === "remote"
  );
}
