import { describe, it, expect } from 'vitest';
import { createLogger, sanitizeUrl } from '@ai-knowledge-inbox/observability';

describe('Observability Utilities', () => {
  it('creates logger instance with redacted config', () => {
    const logger = createLogger({ name: 'test-logger', level: 'silent' });
    expect(logger).toBeDefined();
  });

  it('sanitizes URL query strings and fragments', () => {
    const raw = 'https://example.com/search?q=secret&token=123#fragment';
    const clean = sanitizeUrl(raw);
    expect(clean).toBe('https://example.com/search');
  });

  it('handles invalid URLs gracefully', () => {
    expect(sanitizeUrl('not-a-url')).toBe('[INVALID_URL]');
  });
});
