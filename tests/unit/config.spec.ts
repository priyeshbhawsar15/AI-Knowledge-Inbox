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

  it('rejects placeholder or missing AI_API_KEY in production mode', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', AI_API_KEY: '' })).toThrow(
      /AI_API_KEY is required in production mode/
    );
    expect(() =>
      loadConfig({ NODE_ENV: 'production', AI_API_KEY: 'sk-placeholder-do-not-use' })
    ).toThrow(/AI_API_KEY cannot be a placeholder/);
    expect(() =>
      loadConfig({ NODE_ENV: 'production', AI_API_KEY: 'YOUR_API_KEY' })
    ).toThrow(/AI_API_KEY cannot be a placeholder/);
  });

  it('accepts valid non-placeholder AI_API_KEY in production mode', () => {
    const config = loadConfig({ NODE_ENV: 'production', AI_API_KEY: 'sk-proj-actual-prod-key-999' });
    expect(config.AI_API_KEY).toBe('sk-proj-actual-prod-key-999');
  });
});
