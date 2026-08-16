import Fastify from 'fastify';
import { config } from './config.js';
import { waitForDatabase, pool } from './db/pool.js';
import { registerLogRoutes } from './routes/logs.js';
import { authHook } from './auth.js';
import { deleteExpiredLogs } from './db/repository.js';
import { migrate } from './db/migrate.js';
const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });

app.setErrorHandler((error, _request, reply) => {
  if ((error as { code?: string }).code === 'FST_ERR_CTP_INVALID_JSON_BODY') {
    return reply.code(400).send({ error: 'malformed JSON' });
  }
  app.log.error(error);
  return reply.code(500).send({ error: 'internal server error' });
});
let ready = false;

app.get('/health', async (_request, reply) => {
  if (!ready) return reply.code(503).send({ status: 'starting' });
  return reply.code(200).send({ status: 'ok' });
});

app.addHook('preHandler', async (request, reply) => {
  if (request.url === '/health') return;
  authHook(request, reply);
});

await waitForDatabase();
await migrate();
await registerLogRoutes(app);
await app.listen({ port: config.port, host: config.host });
ready = true;

const retentionTimer = setInterval(async () => {
  try {
    for (;;) {
      const deleted = await deleteExpiredLogs(config.retentionDays);
      if (deleted < 10_000) break;
    }
  } catch (error) {
    app.log.error(error, 'retention cleanup failed');
  }
}, config.retentionIntervalMs);
retentionTimer.unref();

const shutdown = async (): Promise<void> => {
  clearInterval(retentionTimer);
  await app.close();
  await pool.end();
};
process.on('SIGTERM', () => void shutdown().finally(() => process.exit(0)));
process.on('SIGINT', () => void shutdown().finally(() => process.exit(0)));
