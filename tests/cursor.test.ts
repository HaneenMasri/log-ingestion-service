import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../src/lib/cursor.js';

describe('cursor', () => {
  it('round trips', () => {
    const encoded = encodeCursor({ timestamp: '2026-07-20T14:32:01.123Z', id: '123' });
    expect(decodeCursor(encoded)).toEqual({ timestamp: '2026-07-20T14:32:01.123Z', id: '123' });
  });
  it('rejects malformed cursors', () => expect(() => decodeCursor('nope!')).toThrow('invalid cursor'));
});
