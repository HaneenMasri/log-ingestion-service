import { describe, expect, it } from 'vitest';
import { validateLog } from '../src/lib/validation.js';

describe('validateLog', () => {
  const base = { timestamp: '2026-07-20T14:32:01.123Z', level: 'error', service: 'checkout', message: 'payment declined' };
  it('accepts valid flat attributes', () => {
    const log = validateLog({ ...base, attributes: { user_id: '42', retries: 3, ok: true } }, Date.parse('2026-07-20T14:32:02Z'));
    expect(log.attributes).toEqual({ user_id: '42', retries: 3, ok: true });
  });
  it('rejects nested attributes', () => expect(() => validateLog({ ...base, attributes: { nested: {} } })).toThrow('flat object'));
  it('rejects arrays', () => expect(() => validateLog({ ...base, attributes: [] })).toThrow('flat object'));
  it('rejects invalid levels', () => expect(() => validateLog({ ...base, level: 'critical' })).toThrow("invalid level: 'critical'"));
  it('rejects timestamps more than five minutes ahead', () => expect(() => validateLog({ ...base, timestamp: '2026-07-20T14:40:00Z' }, Date.parse('2026-07-20T14:32:00Z'))).toThrow('more than five minutes'));
});
