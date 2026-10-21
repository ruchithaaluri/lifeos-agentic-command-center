// ============================================================
// MCP Server Configuration
// All values sourced from environment variables — never hardcoded.
// ============================================================

import dotenv from 'dotenv';
import path from 'path';

// Support both .env and .env.local from current dir and root
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(optional('MCP_PORT', '3001'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  isDev: optional('NODE_ENV', 'development') === 'development',

  // Auth — MCP server requires bearer token on every request
  mcpSecret: optional('MCP_SECRET', 'dev-secret-change-in-production'),

  // Database
  databaseUrl: optional('DATABASE_URL', ''),

  // AI
  aiProvider: optional('AI_PROVIDER', 'openai'),
  aiModel: optional('AI_MODEL', 'gpt-4o'),
  aiApiKey: optional('AI_API_KEY', ''),

  // CORS
  corsOrigins: optional('CORS_ORIGINS', 'http://localhost:3000').split(','),

  // Demo mode
  demoMode: optional('DEMO_MODE', 'true') === 'true',
  demoUserId: optional('DEMO_USER_ID', '00000000-0000-0000-0000-000000000001'),
} as const;
