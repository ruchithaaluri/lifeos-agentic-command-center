// ============================================================
// @lifeos/database — Public API
// ============================================================

export { prisma, default } from './client.js';
export type { Prisma, PrismaClient } from './client.js';

// Re-export Prisma generated types for convenience
export type {
  User,
  Project,
  Task,
  CalendarEvent,
  AgentSession,
  AgentAction,
  ProjectStatus,
  TaskStatus,
  TaskPriority,
  EventType,
  AgentSessionStatus,
  AgentActionStatus,
} from '@prisma/client';
