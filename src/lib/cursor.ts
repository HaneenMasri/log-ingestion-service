export interface CursorPayload {
  timestamp: string;
  id: string;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

export function encodeCursor(payload: CursorPayload): string {
  return base64UrlEncode(JSON.stringify(payload));
}

export function decodeCursor(value: string): CursorPayload {
  try {
    if (!value || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const parsed: unknown = JSON.parse(base64UrlDecode(value));
    if (!parsed || typeof parsed !== 'object') throw new Error();
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.timestamp !== 'string' || !Number.isFinite(Date.parse(obj.timestamp))) throw new Error();
    if (typeof obj.id !== 'string' || !/^\d+$/.test(obj.id)) throw new Error();
    return { timestamp: new Date(Date.parse(obj.timestamp)).toISOString(), id: obj.id };
  } catch {
    throw new Error('invalid cursor');
  }
}
