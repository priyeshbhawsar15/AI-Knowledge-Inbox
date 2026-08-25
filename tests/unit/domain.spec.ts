import { describe, it, expect } from 'vitest';
import {
  generateId,
  isValidId,
  canTransitionItem,
  assertTransitionItem,
  canTransitionJob,
  assertTransitionJob,
  classifyError,
  calculateBackoffDelayMs,
  hashString,
  hashIngestRequest,
} from '@ai-knowledge-inbox/domain';

describe('Domain Rules and Helpers', () => {
  it('generates valid prefixed IDs', () => {
    const itemId = generateId('itm');
    expect(itemId.startsWith('itm_')).toBe(true);
    expect(isValidId(itemId, 'itm')).toBe(true);
    expect(isValidId('invalid_id', 'itm')).toBe(false);
  });

  it('enforces item state transitions', () => {
    expect(canTransitionItem('queued', 'processing')).toBe(true);
    expect(canTransitionItem('processing', 'ready')).toBe(true);
    expect(canTransitionItem('ready', 'queued')).toBe(false);
    expect(() => assertTransitionItem('ready', 'processing')).toThrow();
  });

  it('enforces job state transitions', () => {
    expect(canTransitionJob('queued', 'running')).toBe(true);
    expect(canTransitionJob('running', 'succeeded')).toBe(true);
    expect(canTransitionJob('succeeded', 'queued')).toBe(false);
    expect(() => assertTransitionJob('succeeded', 'running')).toThrow();
  });

  it('classifies transient vs terminal errors', () => {
    expect(classifyError('URL_PRIVATE_ADDRESS')).toBe('terminal');
    expect(classifyError('VALIDATION_ERROR')).toBe('terminal');
    expect(classifyError('URL_FETCH_TIMEOUT')).toBe('transient');
    expect(classifyError('DATABASE_BUSY')).toBe('transient');
  });

  it('calculates jittered backoff delays', () => {
    const delay1 = calculateBackoffDelayMs(1, 0.5);
    expect(delay1).toBe(2250);
    const delay2 = calculateBackoffDelayMs(2, 0);
    expect(delay2).toBe(8000);
    const delay3 = calculateBackoffDelayMs(3, 1.0);
    expect(delay3).toBe(32500);
  });

  it('hashes string and ingest request deterministically', () => {
    const h1 = hashString('test input');
    const h2 = hashString('test input');
    expect(h1).toBe(h2);

    const body = { type: 'text', content: 'note content' };
    expect(hashIngestRequest(body)).toBe(hashIngestRequest(body));
  });
});
