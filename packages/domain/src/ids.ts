import { randomUUID } from 'node:crypto';

export type IdPrefix = 'itm' | 'job' | 'chk' | 'evt' | 'req' | 'idp' | 'wrk';

export function generateId(prefix: IdPrefix): string {
  const uuid = randomUUID();
  return `${prefix}_${uuid.replace(/-/g, '')}`;
}

export function isValidId(id: string, prefix?: IdPrefix): boolean {
  if (prefix) {
    return new RegExp(`^${prefix}_[a-f0-9]{32}$`).test(id);
  }
  return /^[a-z]{3}_[a-f0-9]{32}$/.test(id);
}
