import type { ActionScope, OutputMode } from "./types";

/**
 * One entry in the in-memory debug log. Stored in memory only (never
 * written to disk per REQUIREMENTS §8). Content fields are pre-truncated
 * by the recorder so huge blocks don't balloon memory.
 */
export interface DebugLogEntry {
  readonly timestamp: number;
  readonly actionId: string;
  readonly actionTitle: string;
  readonly scope: ActionScope;
  readonly outputMode: OutputMode;
  readonly model: string;
  readonly baseUrl: string;
  readonly requestPreview: string;
  readonly responsePreview?: string;
  readonly durationMs: number;
  readonly error?: string;
}

/** Fixed-capacity FIFO buffer — oldest entries drop when full. */
export interface RingBuffer<T> {
  readonly capacity: number;
  push(entry: T): void;
  entries(): readonly T[];
  clear(): void;
}

export function createRingBuffer<T>(capacity: number): RingBuffer<T> {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error(`ring buffer capacity must be a positive integer, got ${capacity}`);
  }
  let buffer: T[] = [];
  return {
    capacity,
    push(entry: T): void {
      buffer.push(entry);
      if (buffer.length > capacity) {
        buffer.splice(0, buffer.length - capacity);
      }
    },
    entries(): readonly T[] {
      // Defensive copy — callers (including the Preact viewer) sometimes
      // mutate arrays, and we don't want that to corrupt the buffer.
      return [...buffer];
    },
    clear(): void {
      buffer = [];
    },
  };
}

/**
 * Truncate a string to `limit` chars, appending an ellipsis and a
 * remaining-char count so the reader knows something was dropped.
 * Applied to request/response previews before they're stored — keeps
 * the ring buffer memory-bounded regardless of input size.
 */
export function truncate(s: string, limit: number): string {
  if (s.length <= limit) return s;
  return `${s.slice(0, limit)}… [${s.length - limit} more chars]`;
}

/** Shared defaults; change here and every call site stays in sync. */
export const DEFAULT_CAPACITY = 50;
export const PREVIEW_TRUNCATION_LIMIT = 500;

/** Plugin-wide debug log singleton. Empty until `runAction` records into it. */
export const debugLog: RingBuffer<DebugLogEntry> = createRingBuffer(DEFAULT_CAPACITY);
