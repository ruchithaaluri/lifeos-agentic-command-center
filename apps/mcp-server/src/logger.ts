// ============================================================
// Structured Logger
// Never logs secrets, tokens, or raw passwords.
// ============================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  tool?: string;
  latencyMs?: number;
  status?: 'success' | 'failed';
  userId?: string; // anonymized in prod
  [key: string]: unknown;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const configuredLevel: LogLevel = (process.env['LOG_LEVEL'] as LogLevel | undefined) ?? 'info';

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[configuredLevel]) return;

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  // Safety: strip any accidental secret keys
  const REDACTED_KEYS = ['password', 'token', 'secret', 'apiKey', 'api_key', 'authorization'];
  for (const key of REDACTED_KEYS) {
    if (key in entry) {
      entry[key] = '[REDACTED]';
    }
  }

  const output = JSON.stringify(entry);
  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.info(output);
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),

  tool: (tool: string, status: 'start' | 'success' | 'failed', meta?: Record<string, unknown>) => {
    log('info', `tool:${status}`, { tool, ...meta });
  },
};
