import { describe, expect, it } from "vitest";
import { describeOriginMismatch, failureMessage } from "./asset-url";

describe("failureMessage", () => {
  it("names the missing path case in plain language", () => {
    const msg = failureMessage("no-path");
    expect(msg).toMatch(/path/i);
    expect(msg).not.toMatch(/undefined|null/);
  });

  it("names the missing asset type case", () => {
    const msg = failureMessage("no-type");
    expect(msg).toMatch(/type/i);
  });

  it("names the unsupported mime case", () => {
    const msg = failureMessage("unsupported-mime");
    expect(msg.toLowerCase()).toContain("not a supported image");
  });

  it("names the makeUrl failure case", () => {
    const msg = failureMessage("makeurl-failed");
    expect(msg).toMatch(/url/i);
  });

  it("names the fetch failure case", () => {
    const msg = failureMessage("fetch-failed");
    expect(msg.toLowerCase()).toContain("could not read");
  });

  it("names the decode failure case", () => {
    const msg = failureMessage("decode-failed");
    expect(msg.toLowerCase()).toContain("decode");
  });

  it("appends the hint on its own line when present", () => {
    const msg = failureMessage("fetch-failed", "switch to build:watch");
    expect(msg).toContain("\nswitch to build:watch");
    expect(msg.split("\n").length).toBe(2);
  });

  it("does not append a trailing newline when hint is undefined", () => {
    const msg = failureMessage("fetch-failed");
    expect(msg.endsWith("\n")).toBe(false);
    expect(msg).not.toContain("\n");
  });
});

describe("describeOriginMismatch", () => {
  it("returns a hint when an http origin tries to read a file:// url", () => {
    const hint = describeOriginMismatch("http://localhost:8080", "file:///Users/x/assets/a.png");
    expect(hint).not.toBeNull();
    expect(hint?.toLowerCase()).toContain("build:watch");
  });

  it("returns a hint when an https origin tries to read a file:// url", () => {
    const hint = describeOriginMismatch("https://example.com", "file:///x/y.jpg");
    expect(hint).not.toBeNull();
  });

  it("returns null when origin is file:// (filesystem-load mode)", () => {
    expect(
      describeOriginMismatch("file:///Users/x/.logseq/plugins/foo", "file:///x/y.png"),
    ).toBeNull();
  });

  it("returns null when both are http(s) (no scheme cross)", () => {
    expect(describeOriginMismatch("http://localhost:8080", "http://localhost:8080/a.png")).toBeNull();
  });

  it("returns null on empty inputs", () => {
    expect(describeOriginMismatch("", "")).toBeNull();
    expect(describeOriginMismatch("http://localhost", "")).toBeNull();
    expect(describeOriginMismatch("", "file:///x")).toBeNull();
  });

  it("returns null when http origin reads an http url (allowed)", () => {
    expect(
      describeOriginMismatch("http://localhost:8080", "http://localhost:8080/api/asset"),
    ).toBeNull();
  });
});
