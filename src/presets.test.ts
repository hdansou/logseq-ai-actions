import { describe, expect, it } from "vitest";
import { findPreset, PRESETS } from "./presets";

describe("PRESETS", () => {
  it("includes LM Studio, Ollama, and Custom in that order", () => {
    expect(PRESETS.map((p) => p.id)).toEqual(["lm-studio", "ollama", "custom"]);
  });

  it("LM Studio is the primary default (first entry)", () => {
    expect(PRESETS[0]?.id).toBe("lm-studio");
    expect(PRESETS[0]?.baseUrl).toBe("http://localhost:1234/v1");
  });

  it("Ollama uses the standard 11434 port", () => {
    const ollama = PRESETS.find((p) => p.id === "ollama");
    expect(ollama?.baseUrl).toBe("http://localhost:11434/v1");
  });

  it("Custom preset has an empty baseUrl so the user must supply one", () => {
    const custom = PRESETS.find((p) => p.id === "custom");
    expect(custom?.baseUrl).toBe("");
  });

  it("every preset has a non-empty id and title", () => {
    for (const p of PRESETS) {
      expect(p.id.length).toBeGreaterThan(0);
      expect(p.title.length).toBeGreaterThan(0);
    }
  });

  it("every non-custom preset's baseUrl is loopback (classifies as LOCAL)", async () => {
    const { classifyEndpoint } = await import("./endpoint");
    for (const p of PRESETS) {
      if (p.id === "custom") continue;
      expect(classifyEndpoint(p.baseUrl)).toBe("local");
    }
  });
});

describe("findPreset", () => {
  it("returns the preset for a known id", () => {
    expect(findPreset("ollama")?.title).toBe("Ollama");
  });

  it("returns undefined for an unknown id", () => {
    expect(findPreset("nonexistent")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(findPreset("")).toBeUndefined();
  });
});
