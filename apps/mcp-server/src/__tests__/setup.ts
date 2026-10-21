// ============================================================
// MCP Server Test Setup
// Runs before every test file.
// ============================================================

import { prisma } from '@lifeos/database';

// Seed a minimal demo user for tests that hit the DB
export const TEST_USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

beforeAll(async () => {
  // Ensure test DB is available; skip gracefully if not
  try {
    await prisma.$connect();
  } catch {
    console.warn('DB not available — DB-dependent tests will be skipped');
  }
});
