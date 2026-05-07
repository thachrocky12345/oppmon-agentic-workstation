import { Request, Response, NextFunction } from 'express';
import { pino } from 'pino';
import { ZodError } from 'zod';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

/**
 * Custom error class for API errors with user-friendly messages and suggestions
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: unknown,
    public suggestion?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: unknown, suggestion?: string): ApiError {
    return new ApiError(400, message, 'BAD_REQUEST', details, suggestion);
  }

  static unauthorized(message = 'Unauthorized', suggestion = 'Please log in and try again'): ApiError {
    return new ApiError(401, message, 'UNAUTHORIZED', undefined, suggestion);
  }

  static forbidden(message = 'Forbidden', suggestion = 'You do not have permission to perform this action'): ApiError {
    return new ApiError(403, message, 'FORBIDDEN', undefined, suggestion);
  }

  static notFound(message = 'Not found', suggestion?: string): ApiError {
    return new ApiError(404, message, 'NOT_FOUND', undefined, suggestion);
  }

  static conflict(message: string, suggestion?: string, details?: unknown): ApiError {
    return new ApiError(409, message, 'CONFLICT', details, suggestion);
  }

  static tooManyRequests(message = 'Too many requests', suggestion = 'Please wait a moment before trying again'): ApiError {
    return new ApiError(429, message, 'TOO_MANY_REQUESTS', undefined, suggestion);
  }

  static internal(message = 'Internal server error', suggestion = 'Please try again later. If the problem persists, contact support.'): ApiError {
    return new ApiError(500, message, 'INTERNAL_ERROR', undefined, suggestion);
  }
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // Log the error
  logger.error({
    err,
    method: req.method,
    url: req.url,
    body: req.body,
    userId: (req as unknown as { user?: { id: string } }).user?.id,
  }, 'Request error');

  // Handle known error types
  if (err instanceof ApiError) {
    const response: Record<string, unknown> = {
      error: err.message,
      code: err.code,
    };
    if (err.details) {
      response.details = err.details;
    }
    if (err.suggestion) {
      response.suggestion = err.suggestion;
    }
    res.status(err.statusCode).json(response);
    return;
  }

  // Handle Zod validation errors with helpful messages
  if (err instanceof ZodError) {
    const fieldErrors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    // Create a user-friendly summary
    const fields = fieldErrors.map(e => e.field).join(', ');

    res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      suggestion: `Please check the following fields: ${fields}`,
      details: fieldErrors,
    });
    return;
  }

  // Handle PostgreSQL errors with user-friendly messages
  const errWithCode = err as unknown as { code?: string; constraint?: string };
  if (errWithCode.code?.startsWith('23')) {
    const pgCode = errWithCode.code;
    if (pgCode === '23505') {
      res.status(409).json({
        error: 'A resource with this information already exists',
        code: 'DUPLICATE_ENTRY',
        suggestion: 'Please use a different value or update the existing resource',
      });
      return;
    }
    if (pgCode === '23503') {
      res.status(400).json({
        error: 'The referenced resource could not be found',
        code: 'FOREIGN_KEY_VIOLATION',
        suggestion: 'Please make sure the related resource exists before creating this one',
      });
      return;
    }
    if (pgCode === '23502') {
      res.status(400).json({
        error: 'A required field is missing',
        code: 'NULL_VIOLATION',
        suggestion: 'Please provide all required fields',
      });
      return;
    }
  }

  // Default to 500
  const isDev = process.env.NODE_ENV === 'development';
  res.status(500).json({
    error: isDev ? err.message : 'Internal server error',
    code: 'INTERNAL_ERROR',
    ...(isDev && { stack: err.stack }),
  });
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
