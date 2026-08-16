import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 8,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: 'log-service',
});

export async function waitForDatabase(): Promise<void> {
  for (;;) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
