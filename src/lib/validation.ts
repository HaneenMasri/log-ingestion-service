import { LEVELS, type Attributes, type LogInput, type LogLevel, type ValidLog } from '../types.js';

const MAX_FUTURE_MS = 5 * 60 * 1000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateAttributes(value: unknown): Attributes {
  if (value === undefined) return {};
  if (!isPlainObject(value)) throw new Error('attributes must be a flat object');

  const result: Attributes = {};
 for (const [key, item] of Object.entries(value)) {
  if (item !== null && typeof item === 'object') {
    throw new Error('attributes must be a flat object');
  }

  if (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') {
    throw new Error(`invalid attribute '${key}': value must be a string, number, or boolean`);
  }
    if (typeof item === 'number' && !Number.isFinite(item)) {
      throw new Error(`invalid attribute '${key}': number must be finite`);
    }
    result[key] = item;
  }
  return result;
}

export function validateLog(input: unknown, now = Date.now()): ValidLog {
  if (!isPlainObject(input)) throw new Error('log entry must be an object');

  const entry = input as unknown as LogInput;
  if (typeof entry.timestamp !== 'string') throw new Error('timestamp is required');
  const timestampMs = Date.parse(entry.timestamp);
  if (!Number.isFinite(timestampMs)) throw new Error('invalid timestamp');
  if (timestampMs > now + MAX_FUTURE_MS) throw new Error('timestamp is more than five minutes in the future');

  if (typeof entry.level !== 'string') throw new Error('level is required');
  if (!(LEVELS as readonly string[]).includes(entry.level)) throw new Error(`invalid level: '${entry.level}'`);

  if (typeof entry.service !== 'string' || entry.service.trim() === '') throw new Error('service must be a non-empty string');
  if (typeof entry.message !== 'string' || entry.message.trim() === '') throw new Error('message must be a non-empty string');

  return {
    timestamp: new Date(timestampMs),
    level: entry.level as LogLevel,
    service: entry.service,
    message: entry.message,
    attributes: validateAttributes(entry.attributes),
  };
}
