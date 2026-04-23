import { describe, expect, it } from "vitest";
import { classifyEndpoint } from "./endpoint";

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
