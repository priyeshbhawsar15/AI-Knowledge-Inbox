import type { DatabaseInstance } from './connection.js';
import { systemState } from './schema.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function migrateDatabase(
  db: DatabaseInstance,
  options?: { embeddingModel?: string; embeddingDimensions?: number }
): void {
  const sqlPath = join(__dirname, 'migrations', '0000_initial.sql');
  let migrationSql: string;

  try {
    migrationSql = readFileSync(sqlPath, 'utf8');
  } catch {
    // Fallback if built under dist/
    const altPath = join(__dirname, '..', 'src', 'migrations', '0000_initial.sql');
    migrationSql = readFileSync(altPath, 'utf8');
  }

  // Execute migration in raw transaction
  db.$client.exec(migrationSql);

  const now = new Date().toISOString();
  const model = options?.embeddingModel ?? 'text-embedding-3-small';
  const dimensions = options?.embeddingDimensions ?? 1536;

  const existingState = db.select().from(systemState).where(eq(systemState.id, 1)).get();

  if (!existingState) {
    db.insert(systemState)
      .values({
        id: 1,
        schemaVersion: 1,
        indexVersion: 1,
        embeddingModel: model,
        embeddingDimensions: dimensions,
        updatedAt: now,
      })
      .run();
  }
}
