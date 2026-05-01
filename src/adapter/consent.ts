/// <reference types="@logseq/libs" />
import { classifyEndpoint } from "../endpoint";
import { showConfirm } from "../ui/show-confirm";
import { readPrivateSetting, readSettings } from "./settings";

export async function runFirstRunFlow(): Promise<void> {
  const settings = (logseq.settings ?? {}) as Record<string, unknown>;
  const consentSeen = Boolean(settings._consentSeen);
  const baseUrl = readSettings().baseUrl;

  if (!consentSeen) {
    await showConfirm("AI Actions — welcome", {
      message:
        "When you invoke an AI action (like /AI Rewrite or /AI Summarize), the content of your current block is sent to the configured endpoint. By default that's a server running on your own machine. You can change the endpoint in plugin settings — any non-loopback host will be clearly marked REMOTE and trigger a one-time warning.",
      acceptLabel: "Got it",
      hideReject: true,
      baseUrl,
    });
    logseq.updateSettings({ _consentSeen: true });
  }

  // Seed the last-trust marker so the very first baseUrl change after
  // plugin install correctly detects a transition (rather than assuming
  // everyone started LOCAL).
  const currentTrust = classifyEndpoint(baseUrl);
  const existing = readPrivateSetting("_lastEndpointTrust", "");
  if (existing !== currentTrust) {
    logseq.updateSettings({ _lastEndpointTrust: currentTrust });
  }
}

export async function showRemoteTransitionNotice(baseUrl: string): Promise<void> {
  await showConfirm("Endpoint changed to REMOTE", {
    message:
      "Your endpoint is now a non-loopback address. AI actions you run will send block content to this host instead of your own machine. If this is what you intended, carry on. If not, change the Base URL back in plugin settings.",
    acceptLabel: "I understand",
    hideReject: true,
    baseUrl,
  });
}
