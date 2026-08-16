import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { insertLogs, queryLogs, aggregateLogs } from '../db/repository.js';
import { decodeCursor, encodeCursor } from '../lib/cursor.js';
import { validateLog } from '../lib/validation.js';
import { LEVELS, type LogLevel } from '../types.js';
import { config } from '../config.js';

function bad(reply: FastifyReply, error: string): void { reply.code(400).send({ error }); }

function parseDateParam(value: unknown, name: string): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(`invalid ${name}`);
  return new Date(Date.parse(value));
}

function parseLimit(value: unknown): number {
  if (value === undefined) return 100;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('invalid limit');
  const n = Number(value);
  if (n < 1 || n > 1000) throw new Error('invalid limit');
  return n;
}

function parseAttributes(query: Record<string, unknown>): Array<[string, string]> {
  const attrs: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith('attr.')) continue;
    if (key.length === 5 || typeof value !== 'string') throw new Error('invalid attribute filter');
    attrs.push([key.slice(5), value]);
  }
  return attrs;
}

function parseLevel(value: unknown): LogLevel | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !(LEVELS as readonly string[]).includes(value)) throw new Error('invalid level');
  return value as LogLevel;
}

function ensureRange(since: Date | undefined, until: Date | undefined): void {
  if (since && until && until <= since) throw new Error('until must be later than since');
}

export async function registerLogRoutes(app: FastifyInstance): Promise<void> {
  app.post('/logs', async (request, reply) => {
    const body = request.body as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray((body as Record<string, unknown>).logs)) {
      return bad(reply, 'request body must contain a logs array');
    }
    const entries = (body as { logs: unknown[] }).logs;
    if (entries.length === 0) return bad(reply, 'logs must contain at least one entry');
    if (entries.length > config.maxBatchSize) return bad(reply, `batch exceeds maximum size of ${config.maxBatchSize}`);

    const valid = [] as ReturnType<typeof validateLog>[];
    const rejected: Array<{ index: number; reason: string }> = [];
    for (let i = 0; i < entries.length; i++) {
      try { valid.push(validateLog(entries[i])); }
      catch (error) { rejected.push({ index: i, reason: error instanceof Error ? error.message : 'invalid log entry' }); }
    }
    if (valid.length > 0) await insertLogs(valid);
    if (valid.length === 0) return reply.code(400).send({ accepted: 0, rejected });
    return reply.code(200).send({ accepted: valid.length, rejected });
  });

  app.get('/logs', async (request, reply) => {
    try {
      const q = request.query as Record<string, unknown>;
      const service = q.service === undefined ? undefined : typeof q.service === 'string' ? q.service : (() => { throw new Error('invalid service'); })();
      const level = parseLevel(q.level);
      const since = parseDateParam(q.since, 'since');
      const until = parseDateParam(q.until, 'until');
      ensureRange(since, until);
      const limit = parseLimit(q.limit);
      const cursor = q.cursor === undefined ? undefined : typeof q.cursor === 'string' ? decodeCursor(q.cursor) : (() => { throw new Error('invalid cursor'); })();
      const qText = q.q === undefined ? undefined : typeof q.q === 'string' ? q.q : (() => { throw new Error('invalid q'); })();
      const attributes = parseAttributes(q);
      const result = await queryLogs({ service, level, since, until, q: qText, attributes, cursor, limit });
      const next = result.hasMore && result.logs.length > 0
        ? encodeCursor({ timestamp: result.logs[result.logs.length - 1]!.timestamp.toISOString(), id: result.logs[result.logs.length - 1]!.id })
        : null;
      return reply.send({ logs: result.logs.map((row) => ({ ...row, timestamp: row.timestamp.toISOString() })), next_cursor: next });
    } catch (error) {
      return bad(reply, error instanceof Error ? error.message : 'invalid parameters');
    }
  });

  app.get('/logs/aggregate', async (request, reply) => {
    try {
      const q = request.query as Record<string, unknown>;
      const since = parseDateParam(q.since, 'since');
      const until = parseDateParam(q.until, 'until');
      if (!since || !until) throw new Error('since and until are required');
      ensureRange(since, until);
      if (typeof q.bucket !== 'string' || !['1m', '5m', '1h', '1d'].includes(q.bucket)) throw new Error('invalid bucket');
      const groupBy = q.group_by === undefined ? undefined : q.group_by === 'service' || q.group_by === 'level' ? q.group_by : (() => { throw new Error('invalid group_by'); })();
      const service = q.service === undefined ? undefined : typeof q.service === 'string' ? q.service : (() => { throw new Error('invalid service'); })();
      const level = parseLevel(q.level);
      const qText = q.q === undefined ? undefined : typeof q.q === 'string' ? q.q : (() => { throw new Error('invalid q'); })();
      const attributes = parseAttributes(q);
      const buckets = await aggregateLogs({ service, level, since, until, q: qText, attributes, bucket: q.bucket as '1m' | '5m' | '1h' | '1d', groupBy });
      return reply.send({ buckets: buckets.map((b) => ({ start: b.start.toISOString(), group: b.group, count: b.count })) });
    } catch (error) {
      return bad(reply, error instanceof Error ? error.message : 'invalid parameters');
    }
  });
}
