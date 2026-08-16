import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from './config.js';

export function authHook(request: FastifyRequest, reply: FastifyReply): void {
  if (!config.authEnabled) return;
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    void reply.code(401).send({ error: 'missing or malformed credential' });
    return;
  }
  const key = header.slice(7).trim();
  if (!key || !config.loadgenApiKey || key !== config.loadgenApiKey) {
    void reply.code(401).send({ error: 'invalid credential' });
    return;
  }
}
