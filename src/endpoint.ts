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
