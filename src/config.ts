export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://logs:logs@postgres:5432/logs',
  authEnabled: process.env.AUTH_ENABLED === 'true',
  loadgenApiKey: process.env.LOADGEN_API_KEY,
  retentionDays: Number(process.env.RETENTION_DAYS ?? 31),
  retentionIntervalMs: Number(process.env.RETENTION_INTERVAL_MS ?? 60_000),
  maxBatchSize: Number(process.env.MAX_BATCH_SIZE ?? 2000),
};

if (!Number.isInteger(config.retentionDays) || config.retentionDays < 1) {
  throw new Error('RETENTION_DAYS must be a positive integer');
}
