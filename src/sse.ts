/**
 * Stateful parser for OpenAI-compatible Chat Completions Server-Sent
 * Events. Each `push(rawChunk)` returns the content deltas emitted by
 * any *complete* SSE event in the new data; partial events at the end
 * are buffered for the next call.
 *
 * Pure — no `@logseq/libs` import, no DOM. Testable in Vitest.
 *
 * Accepted event shape (the only one OpenAI Chat Completions emits):
 *   data: { "choices": [{ "delta": { "content": "token" } }] }
 *   data: [DONE]    // terminator, not emitted
 *
 * Tolerant of:
 *   - non-data lines (`event:`, `id:`, `retry:`, comments starting with `:`)
 *   - deltas that are role-only (no `content` field) — common at chunk 0
 *   - empty-string content deltas — emitted as nothing
 *   - malformed JSON in a `data:` line — that line is skipped
 *   - CRLF or LF line endings
 */
export interface SSEParser {
  /** Feed a raw string (decoded UTF-8) and receive any newly-complete content deltas. */
  push(chunk: string): string[];
  /**
   * Emit any trailing content held in the line buffer — call once the
   * underlying stream has ended. Mostly relevant when the server closes
   * mid-line without a trailing newline.
   */
  flush(): string[];
}

export function createSSEParser(): SSEParser {
  let buffer = "";
  return {
    push(chunk: string): string[] {
      buffer += chunk;
      const emitted: string[] = [];
      // Normalise CRLF → LF, then split so we can detect *complete* lines.
      const normalised = buffer.replace(/\r\n/g, "\n");
      const lines = normalised.split("\n");
      // Last slice is whatever's after the final newline — possibly incomplete.
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const content = processLine(line);
        if (content !== null) emitted.push(content);
      }
      return emitted;
    },
    flush(): string[] {
      if (!buffer) return [];
      const tail = buffer;
      buffer = "";
      const content = processLine(tail);
      return content === null ? [] : [content];
    },
  };
}

function processLine(line: string): string | null {
  // SSE fields: "data: …", "event: …", "id: …", "retry: …", or a
  // comment (starts with ":"). Blank lines are event separators.
  if (!line || line.startsWith(":")) return null;
  if (!line.startsWith("data:")) return null;

  // OpenAI always pads with a space after the colon, but the spec
  // allows either `data:foo` or `data: foo`. Handle both.
  const payload = line.slice(5).trimStart();
  if (payload === "" || payload === "[DONE]") return null;

  let parsed: { choices?: Array<{ delta?: { content?: unknown } }> };
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  const content = parsed?.choices?.[0]?.delta?.content;
  if (typeof content !== "string" || content.length === 0) return null;
  return content;
}
