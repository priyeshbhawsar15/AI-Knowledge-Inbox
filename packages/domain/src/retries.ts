import type { ErrorCode } from '@ai-knowledge-inbox/contracts';

export type ErrorClassification = 'transient' | 'terminal';

const TERMINAL_ERROR_CODES: Set<ErrorCode> = new Set([
  'VALIDATION_ERROR',
  'IDEMPOTENCY_CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'URL_PRIVATE_ADDRESS',
  'CONTENT_NOT_EXTRACTABLE',
  'INDEX_MODEL_MISMATCH',
  'AI_INVALID_RESPONSE',
]);

export function classifyError(code: ErrorCode): ErrorClassification {
  if (TERMINAL_ERROR_CODES.has(code)) {
    return 'terminal';
  }
  return 'transient';
}

export function calculateBackoffDelayMs(attempt: number, baseJitter: number = Math.random()): number {
  // attempt starts at 1
  // attempt 1 -> 2000 ms
  // attempt 2 -> 8000 ms
  // attempt 3 -> 32000 ms
  const baseDelays = [2000, 8000, 32000];
  const delay = baseDelays[Math.min(attempt - 1, baseDelays.length - 1)] ?? 32000;
  const jitter = Math.floor(baseJitter * 500); // 0-500ms
  return delay + jitter;
}
