import { createHash } from 'node:crypto';

export function hashString(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function hashIngestRequest(body: unknown): string {
  const normalized = JSON.stringify(body);
  return hashString(normalized);
}
