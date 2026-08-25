import { describe, it, expect } from 'vitest';
import {
  IngestRequestSchema,
  QueryRequestSchema,
  IdempotencyKeyHeaderSchema,
  ItemStatusSchema,
  ErrorCodeEnum,
} from '@ai-knowledge-inbox/contracts';

describe('Contracts Schema Validation', () => {
  it('validates text ingest request', () => {
    const valid = { type: 'text', content: 'Hello world', title: 'Note 1' };
    const parsed = IngestRequestSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('rejects text ingest request exceeding character limit', () => {
    const invalid = { type: 'text', content: 'a'.repeat(50001) };
    const parsed = IngestRequestSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('validates url ingest request', () => {
    const valid = { type: 'url', url: 'https://example.com/article' };
    const parsed = IngestRequestSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('rejects url ingest request with invalid url', () => {
    const invalid = { type: 'url', url: 'not-a-url' };
    const parsed = IngestRequestSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('rejects unknown fields on ingest request', () => {
    const invalid = { type: 'text', content: 'hello', unknownField: true };
    const parsed = IngestRequestSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('validates query request with topK limits', () => {
    const valid = { question: 'What is RAG?', topK: 5 };
    expect(QueryRequestSchema.safeParse(valid).success).toBe(true);

    const invalidTopK = { question: 'What is RAG?', topK: 15 };
    expect(QueryRequestSchema.safeParse(invalidTopK).success).toBe(false);

    const invalidQuestion = { question: 'a'.repeat(2001) };
    expect(QueryRequestSchema.safeParse(invalidQuestion).success).toBe(false);
  });

  it('validates idempotency key header length', () => {
    expect(IdempotencyKeyHeaderSchema.safeParse('valid-uuid-key').success).toBe(true);
    expect(IdempotencyKeyHeaderSchema.safeParse('a'.repeat(129)).success).toBe(false);
  });

  it('contains expected status and error codes', () => {
    expect(ItemStatusSchema.options).toEqual(['queued', 'processing', 'ready', 'retry_wait', 'failed']);
    expect(ErrorCodeEnum.options).toContain('VALIDATION_ERROR');
    expect(ErrorCodeEnum.options).toContain('URL_PRIVATE_ADDRESS');
  });
});
