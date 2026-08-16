export const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LEVELS)[number];
export type AttributeValue = string | number | boolean;
export type Attributes = Record<string, AttributeValue>;

export interface LogInput {
  timestamp: string;
  level: string;
  service: string;
  message: string;
  attributes?: unknown;
}

export interface ValidLog {
  timestamp: Date;
  level: LogLevel;
  service: string;
  message: string;
  attributes: Attributes;
}

export interface LogRow {
  id: string;
  timestamp: Date;
  level: LogLevel;
  service: string;
  message: string;
  attributes: Attributes;
}
