/// <reference types="@logseq/libs" />
import { endpointHost, needsRemoteConsent, remoteConsentMessage } from "../endpoint";
import { showConfirm } from "../ui/show-confirm";
import { readPrivateSetting, readSettings } from "./settings";

export async function runFirstRunFlow(): Promise<void> {
  const settings = (logseq.settings ?? {}) as Record<string, unknown>;
  if (settings._consentSeen) return;
  await showConfirm("AI Actions — welcome", {
    message:
      "When you invoke an AI action (like /AI Rewrite or /AI Summarize), the content of your current block is sent to the configured endpoint. By default that's a server running on your own machine. You can change the endpoint in plugin settings — any non-loopback host is clearly marked REMOTE, and you'll be asked to confirm before content is first sent to it.",
    acceptLabel: "Got it",
    hideReject: true,
    baseUrl: readSettings().baseUrl,
  });
  logseq.updateSettings({ _consentSeen: true });
}

/**
 * Ask before the first send to a REMOTE host (and again whenever the host
 * changes). Runs at send time, so the dialog is never hidden under Logseq's
 * settings modal and half-typed Base URLs never prompt. Resolves `false` when
 * the user cancels — the caller must not send.
 */
export async function confirmRemoteEndpoint(baseUrl: string, apiKey: string): Promise<boolean> {
  if (!needsRemoteConsent(readPrivateSetting("_approvedRemoteHost", ""), baseUrl)) return true;
  const ok = await showConfirm("Send to a REMOTE endpoint?", {
    message: remoteConsentMessage(baseUrl, apiKey),
    acceptLabel: "Continue",
    rejectLabel: "Cancel",
    baseUrl,
  });
  if (ok) logseq.updateSettings({ _approvedRemoteHost: endpointHost(baseUrl) });
  return ok;
}
