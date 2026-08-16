import type { PoolClient } from 'pg';
import { pool } from './pool.js';
import type { Attributes, LogLevel, LogRow, ValidLog } from '../types.js';
import type { CursorPayload } from '../lib/cursor.js';

export interface LogFilters {
  service?: string;
  level?: LogLevel;
  since?: Date;
  until?: Date;
  q?: string;
  attributes: Array<[string, string]>;
  cursor?: CursorPayload;
  limit: number;
}

export interface AggregateFilters {
  service?: string;
  level?: LogLevel;
  since: Date;
  until: Date;
  q?: string;
  attributes: Array<[string, string]>;
  bucket: '1m' | '5m' | '1h' | '1d';
  groupBy?: 'service' | 'level';
}

function buildFilters(filters: Omit<LogFilters, 'limit' | 'cursor'> | AggregateFilters, startParam = 1): { sql: string[]; values: unknown[] } {
  const sql: string[] = [];
  const values: unknown[] = [];
  let p = startParam;
  if (filters.service !== undefined) { sql.push(`service = $${p++}`); values.push(filters.service); }
  if (filters.level !== undefined) { sql.push(`level = $${p++}`); values.push(filters.level); }
  if (filters.since !== undefined) { sql.push(`timestamp >= $${p++}`); values.push(filters.since); }
  if (filters.until !== undefined) { sql.push(`timestamp < $${p++}`); values.push(filters.until); }
  if (filters.q !== undefined) { sql.push(`message ILIKE $${p++}`); values.push(`%${filters.q}%`); }
  for (const [key, value] of filters.attributes) {
    // Key and value are parameters too; no dynamic SQL is built from user input.
    sql.push(`attributes ->> $${p++} = $${p++}`);
    values.push(key, value);
  }
  return { sql, values };
}

export async function insertLogs(logs: ValidLog[]): Promise<void> {
  if (logs.length === 0) return;
  const values: unknown[] = [];
  const tuples: string[] = [];
  let p = 1;
  for (const log of logs) {
    tuples.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
    values.push(log.timestamp, log.level, log.service, log.message, JSON.stringify(log.attributes));
  }
  await pool.query(
    `INSERT INTO logs (timestamp, level, service, message, attributes) VALUES ${tuples.join(',')}`,
    values,
  );
}

function mapRow(row: Record<string, unknown>): LogRow {
  return {
    id: String(row.id),
    timestamp: new Date(String(row.timestamp)),
    level: row.level as LogLevel,
    service: String(row.service),
    message: String(row.message),
    attributes: row.attributes as Attributes,
  };
}

export async function queryLogs(filters: LogFilters): Promise<{ logs: LogRow[]; hasMore: boolean }> {
  const base = buildFilters(filters);
  const values = [...base.values];
  let p = values.length + 1;
  const cursorSql = filters.cursor
    ? `(timestamp, id) < ($${p++}, $${p++})`
    : undefined;
  if (filters.cursor) values.push(filters.cursor.timestamp, filters.cursor.id);
  const where = [...base.sql, ...(cursorSql ? [cursorSql] : [])];
  const result = await pool.query(
    `SELECT id, timestamp, level, service, message, attributes
     FROM logs
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY timestamp DESC, id DESC
     LIMIT $${p}`,
    [...values, filters.limit + 1],
  );
  const rows = result.rows.map(mapRow);
  return { logs: rows.slice(0, filters.limit), hasMore: rows.length > filters.limit };
}

const BUCKET_SQL: Record<AggregateFilters['bucket'], string> = {
  '1m': "date_bin('1 minute', timestamp, '1970-01-01T00:00:00Z'::timestamptz)",
  '5m': "date_bin('5 minutes', timestamp, '1970-01-01T00:00:00Z'::timestamptz)",
  '1h': "date_bin('1 hour', timestamp, '1970-01-01T00:00:00Z'::timestamptz)",
  '1d': "date_bin('1 day', timestamp, '1970-01-01T00:00:00Z'::timestamptz)",
};

export async function aggregateLogs(filters: AggregateFilters): Promise<Array<{ start: Date; group: string | null; count: number }>> {
  const groupSql = filters.groupBy ? filters.groupBy : 'NULL';
  const base = buildFilters(filters);
  const result = await pool.query(
    `SELECT ${BUCKET_SQL[filters.bucket]} AS start,
            ${groupSql} AS group,
            COUNT(*)::bigint AS count
     FROM logs
     WHERE ${base.sql.join(' AND ')}
     GROUP BY 1, 2
     ORDER BY 1 ASC, 2 ASC NULLS FIRST`,
    base.values,
  );
  return result.rows.map((row) => ({ start: new Date(String(row.start)), group: row.group === null ? null : String(row.group), count: Number(row.count) }));
}

export async function deleteExpiredLogs(retentionDays: number): Promise<number> {
  // Delete in bounded batches to avoid long locks and huge transactions.
  const result = await pool.query(
    `WITH doomed AS (
       SELECT id FROM logs
       WHERE timestamp < now() - ($1::text || ' days')::interval
       ORDER BY timestamp ASC, id ASC
       LIMIT 10000
     )
     DELETE FROM logs l USING doomed d WHERE l.id = d.id`,
    [retentionDays],
  );
  return result.rowCount ?? 0;
}
