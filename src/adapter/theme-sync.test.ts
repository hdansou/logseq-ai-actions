import { describe, expect, it } from "vitest";
import { resolveInitialTheme } from "./theme-sync";

describe("resolveInitialTheme", () => {
  it("uses the probed value when present, ignoring the OS preference", () => {
    expect(resolveInitialTheme("dark", false)).toBe("dark");
    expect(resolveInitialTheme("dark", true)).toBe("dark");
    expect(resolveInitialTheme("light", true)).toBe("light");
    expect(resolveInitialTheme("light", false)).toBe("light");
  });

  it("falls back to the OS preference when the probe came back null", () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
    expect(resolveInitialTheme(null, false)).toBe("light");
  });

  it("defaults to light when both probe and OS preference are unset/false", () => {
    expect(resolveInitialTheme(null, false)).toBe("light");
  });
});
