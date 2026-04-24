import type { FunctionComponent } from "preact";
import { classifyEndpoint } from "../endpoint";

export interface LocalRemoteBadgeProps {
  readonly baseUrl: string;
  /** When true (default), append the host (e.g. `localhost:1234`) after the trust label. */
  readonly showHost?: boolean;
}

/**
 * Small pill that labels the configured endpoint as LOCAL (loopback) or
 * REMOTE (everything else) per REQUIREMENTS §8. Reads from
 * `classifyEndpoint` so any change to the trust rule flows here
 * automatically.
 *
 * Styled via `.endpoint-badge` + `.endpoint-badge-local` /
 * `.endpoint-badge-remote` which consume the CSS variables
 * `--endpoint-{local,remote}-{bg,fg}` already defined in index.html.
 */
export const LocalRemoteBadge: FunctionComponent<LocalRemoteBadgeProps> = ({
  baseUrl,
  showHost = true,
}) => {
  const trust = classifyEndpoint(baseUrl);
  let host = "";
  try {
    host = new URL(baseUrl).host;
  } catch {
    /* invalid URL — showHost falls back to empty, classifyEndpoint already returned "remote" */
  }
  return (
    <span class={`endpoint-badge endpoint-badge-${trust}`} title={`Endpoint: ${baseUrl}`}>
      <strong>{trust.toUpperCase()}</strong>
      {showHost && host ? ` · ${host}` : null}
    </span>
  );
};
