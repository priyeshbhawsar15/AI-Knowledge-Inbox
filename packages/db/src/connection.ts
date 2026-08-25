import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DatabaseInstance = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
};

export function createDatabase(dbPath: string): DatabaseInstance {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const client = new Database(dbPath);
  client.pragma('foreign_keys = ON');
  client.pragma('journal_mode = WAL');
  client.pragma('synchronous = NORMAL');
  client.pragma('busy_timeout = 5000');

  const db = drizzle(client, { schema }) as DatabaseInstance;
  db.$client = client;
  return db;
}
