// ============================================================
// LifeOS Shared Constants
// ============================================================

export const TASK_STATUSES = ['todo', 'in_progress', 'completed', 'cancelled'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const PROJECT_STATUSES = ['active', 'on_hold', 'completed', 'archived'] as const;
export const EVENT_TYPES = [
  'meeting',
  'focus',
  'break',
  'deadline',
  'reminder',
  'personal',
] as const;
export const AGENT_ACTION_STATUSES = ['pending', 'running', 'success', 'failed'] as const;
export const AGENT_SESSION_STATUSES = ['active', 'completed', 'failed'] as const;

export const MCP_TOOLS = [
  'get_tasks',
  'create_task',
  'update_task',
  'delete_task',
  'get_schedule',
  'create_event',
  'move_event',
  'get_projects',
  'search_context',
  'analyze_day',
  'generate_plan',
  'execute_plan',
] as const;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const PLAN_ITEM_TYPES = ['task', 'event', 'break', 'buffer'] as const;

export const PROJECT_COLORS = [
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#06B6D4', // cyan
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#EC4899', // pink
  '#6366F1', // indigo
] as const;
