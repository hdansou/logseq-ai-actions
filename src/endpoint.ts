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
 * Whether sending to `baseUrl` needs the user's go-ahead: the endpoint is
 * REMOTE and its host is not the one they last approved. Checked at send time
 * (not on settings change, where half-typed values commit and plugin UI sits
 * under Logseq's settings modal). An unparseable URL never asks — the request
 * would fail anyway.
 */
export function needsRemoteConsent(approvedHost: string, baseUrl: string): boolean {
  const host = endpointHost(baseUrl);
  return host !== "" && classifyEndpoint(baseUrl) === "remote" && host !== approvedHost;
}

/** True when an API key would travel unencrypted (`http:`) to a non-loopback host. */
export function sendsKeyInCleartext(baseUrl: string, apiKey: string): boolean {
  return (
    apiKey.trim() !== "" &&
    parseUrl(baseUrl)?.protocol === "http:" &&
    classifyEndpoint(baseUrl) === "remote"
  );
}

/** Body of the send-time consent dialog. Names the host only (never credentials). */
export function remoteConsentMessage(baseUrl: string, apiKey: string): string {
  const lines = [
    `This action will send block content to ${endpointHost(baseUrl)}, which is not your own machine. Continue only if you trust this server.`,
  ];
  if (sendsKeyInCleartext(baseUrl, apiKey)) {
    lines.push(
      "Your API key will be sent unencrypted (http://). Use https:// if the server supports it.",
    );
  }
  return lines.join("\n\n");
}
