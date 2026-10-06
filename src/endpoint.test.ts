import { describe, expect, it } from "vitest";
import {
  classifyEndpoint,
  endpointHost,
  redactUrl,
  sendsKeyInCleartext,
  shouldNotifyRemote,
} from "./endpoint";

describe("classifyEndpoint", () => {
  describe("LOCAL (strict loopback only)", () => {
    it.each([
      "http://localhost:8080/",
      "http://localhost/",
      "http://localhost:1234/v1",
      "https://LOCALHOST:443/",
      "http://127.0.0.1:11434/v1",
      "http://127.0.0.1/",
      "http://[::1]:8080/",
      "http://[::1]/",
      "http://0.0.0.0:1234/",
    ])("classifies %s as local", (url) => {
      expect(classifyEndpoint(url)).toBe("local");
    });
  });

  describe("REMOTE", () => {
    it.each([
      "https://api.openai.com/v1",
      "https://api.groq.com/openai/v1",
      "https://hosted.lm-studio.example/",
      "http://10.0.0.5:11434/v1",
      "http://192.168.1.100/",
      "http://172.16.0.1/",
      "http://example.com/",
    ])("classifies %s as remote (strict v1 — LAN hosts are REMOTE)", (url) => {
      expect(classifyEndpoint(url)).toBe("remote");
    });
  });

  describe("invalid input — fail closed (return remote)", () => {
    it.each([
      ["", "empty string"],
      ["not a url", "unparseable"],
      ["localhost:8080", "missing scheme"],
      ["http://", "missing host"],
      ["file:///etc/passwd", "non-http scheme — still remote per strict v1"],
    ])("treats %j (%s) as remote", (url) => {
      expect(classifyEndpoint(url)).toBe("remote");
    });
  });
});

describe("redactUrl", () => {
  it("strips user:pass credentials", () => {
    expect(redactUrl("http://user:s3cret@192.168.1.5:8888/v1")).toBe("http://192.168.1.5:8888/v1");
  });
  it("strips a bare username", () => {
    expect(redactUrl("https://user@api.example.com/v1")).toBe("https://api.example.com/v1");
  });
  it("leaves a credential-free URL exactly as typed", () => {
    expect(redactUrl("http://127.0.0.1:8888")).toBe("http://127.0.0.1:8888");
  });
  it("returns unparseable input unchanged", () => {
    expect(redactUrl("not a url")).toBe("not a url");
  });
});

describe("endpointHost", () => {
  it("returns the lowercased host:port", () => {
    expect(endpointHost("http://LocalHost:1234/v1")).toBe("localhost:1234");
  });
  it("never includes credentials", () => {
    expect(endpointHost("http://user:pw@example.com/v1")).toBe("example.com");
  });
  it("returns an empty string for unparseable input", () => {
    expect(endpointHost("nope")).toBe("");
  });
});

describe("shouldNotifyRemote", () => {
  const remote = "http://192.168.101.14:8888/v1";
  it("notifies on a LOCAL -> REMOTE change", () => {
    expect(shouldNotifyRemote({ trust: "local", host: "localhost:1234" }, remote)).toBe(true);
  });
  it("notifies when a REMOTE endpoint moves to a different host", () => {
    expect(shouldNotifyRemote({ trust: "remote", host: "api.example.com" }, remote)).toBe(true);
  });
  it("stays quiet when the REMOTE host is unchanged", () => {
    expect(shouldNotifyRemote({ trust: "remote", host: "192.168.101.14:8888" }, remote)).toBe(
      false,
    );
  });
  it("stays quiet for a REMOTE user with no recorded host yet (upgrade path)", () => {
    expect(shouldNotifyRemote({ trust: "remote", host: "" }, remote)).toBe(false);
  });
  it("stays quiet for LOCAL endpoints", () => {
    expect(shouldNotifyRemote({ trust: "remote", host: "x" }, "http://localhost:1234/v1")).toBe(
      false,
    );
  });
});

describe("sendsKeyInCleartext", () => {
  it("is true for an API key over http:// to a non-loopback host", () => {
    expect(sendsKeyInCleartext("http://192.168.101.14:8888/v1", "k")).toBe(true);
  });
  it("is false over https://", () => {
    expect(sendsKeyInCleartext("https://api.example.com/v1", "k")).toBe(false);
  });
  it("is false for loopback", () => {
    expect(sendsKeyInCleartext("http://127.0.0.1:8888/v1", "k")).toBe(false);
  });
  it("is false without a key", () => {
    expect(sendsKeyInCleartext("http://192.168.101.14:8888/v1", "  ")).toBe(false);
  });
});
