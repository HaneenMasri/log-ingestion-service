import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, waitForDatabase } from './pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationDir = path.resolve(here, '../../migrations');

export async function migrate(): Promise<void> {
  await waitForDatabase();
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const files = (await fs.readdir(migrationDir)).filter((name: string) => name.endsWith('.sql')).sort();
  for (const name of files) {
    const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
    if (exists.rowCount) continue;
    const sql = await fs.readFile(path.join(migrationDir, name), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate().then(() => pool.end()).catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
}
