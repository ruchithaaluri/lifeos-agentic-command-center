// ============================================================
// LifeOS Shared Error Types
// ============================================================

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'TOOL_EXECUTION_FAILED'
  | 'PLAN_GENERATION_FAILED'
  | 'DATABASE_ERROR'
  | 'AI_PROVIDER_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export class LifeOSError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.name = 'LifeOSError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        // Never expose 'details' in production — log server-side only
      },
    };
  }
}

export class ValidationError extends LifeOSError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends LifeOSError {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} with id "${id}" not found`, 404);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends LifeOSError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends LifeOSError {
  constructor(message = 'Access denied') {
    super('FORBIDDEN', message, 403);
    this.name = 'ForbiddenError';
  }
}

export class ToolExecutionError extends LifeOSError {
  readonly tool: string;
  constructor(tool: string, message: string, details?: unknown) {
    super('TOOL_EXECUTION_FAILED', message, 500, details);
    this.name = 'ToolExecutionError';
    this.tool = tool;
  }
}

export class AIProviderError extends LifeOSError {
  constructor(message: string, details?: unknown) {
    super('AI_PROVIDER_ERROR', message, 502, details);
    this.name = 'AIProviderError';
  }
}

export function isLifeOSError(err: unknown): err is LifeOSError {
  return err instanceof LifeOSError;
}

export function toUserFacingMessage(err: unknown): string {
  if (err instanceof LifeOSError) {
    // Safe to surface these codes with their messages
    if (err.code === 'VALIDATION_ERROR' || err.code === 'NOT_FOUND' || err.code === 'CONFLICT') {
      return err.message;
    }
    if (err.code === 'UNAUTHORIZED') return 'Please sign in to continue.';
    if (err.code === 'FORBIDDEN') return "You don't have access to that.";
    if (err.code === 'RATE_LIMITED') return 'Too many requests. Please wait a moment.';
    if (err.code === 'AI_PROVIDER_ERROR')
      return 'The AI service is temporarily unavailable. Please try again.';
    if (err.code === 'TOOL_EXECUTION_FAILED')
      return "That action couldn't be completed. Please try again.";
  }
  return 'Something went wrong. Please try again.';
}
