import { describe, it, expect } from 'vitest';
import { loadConfig, getSanitizedConfig } from '@ai-knowledge-inbox/config';

describe('Config Validation', () => {
  it('loads config with safe defaults', () => {
    const config = loadConfig({});
    expect(config.PORT).toBe(3000);
    expect(config.EMBEDDING_MODEL).toBe('text-embedding-3-small');
    expect(config.EMBEDDING_DIMENSIONS).toBe(1536);
  });

  it('redacts AI_API_KEY in sanitized config', () => {
    const config = loadConfig({ AI_API_KEY: 'sk-secret-key-12345' });
    const sanitized = getSanitizedConfig(config);
    expect(sanitized['AI_API_KEY']).toBe('[REDACTED]');
  });

  it('throws error for invalid config value', () => {
    expect(() => loadConfig({ PORT: 'invalid-port' })).toThrow();
  });
});
