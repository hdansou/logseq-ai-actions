/** An OpenAI-compatible endpoint preset shown in the settings preset picker. */
export interface EndpointPreset {
  readonly id: string;
  readonly title: string;
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly notes: string;
}

/**
 * Preset order matters — LM Studio is the primary default (first entry).
 * See REQUIREMENTS §2 and the model-hosting decision memo.
 *
 * Adding a new preset is a single-entry append here. Keep `baseUrl` on
 * loopback for any preset marked LOCAL — the `classifyEndpoint` pure
 * function and every consumer of the trust label depend on that invariant.
 */
export const PRESETS: ReadonlyArray<EndpointPreset> = [
  {
    id: "lm-studio",
    title: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "local-model",
    notes:
      "LM Studio's OpenAI-compatible server. Enable it via LM Studio → Developer → Start Server.",
  },
  {
    id: "ollama",
    title: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "gemma3:4b",
    notes: "Ollama's OpenAI-compatible endpoint. Run `ollama serve` to enable.",
  },
  {
    id: "custom",
    title: "Custom",
    baseUrl: "",
    defaultModel: "",
    notes: "Configure base URL and model manually.",
  },
];

export function findPreset(id: string): EndpointPreset | undefined {
  if (!id) return undefined;
  return PRESETS.find((p) => p.id === id);
}
