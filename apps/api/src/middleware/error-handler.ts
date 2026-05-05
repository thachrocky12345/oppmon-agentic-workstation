import { Request, Response, NextFunction } from 'express';
import { pino } from 'pino';
import { ZodError } from 'zod';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(403, message, 'FORBIDDEN');
  }

  static notFound(message = 'Not found'): ApiError {
    return new ApiError(404, message, 'NOT_FOUND');
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, message, 'CONFLICT');
  }

  static tooManyRequests(message = 'Too many requests'): ApiError {
    return new ApiError(429, message, 'TOO_MANY_REQUESTS');
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(500, message, 'INTERNAL_ERROR');
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
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
    return;
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Handle PostgreSQL errors
  const errWithCode = err as unknown as { code?: string };
  if (errWithCode.code?.startsWith('23')) {
    const pgCode = errWithCode.code;
    if (pgCode === '23505') {
      res.status(409).json({
        error: 'Resource already exists',
        code: 'DUPLICATE_ENTRY',
      });
      return;
    }
    if (pgCode === '23503') {
      res.status(400).json({
        error: 'Referenced resource not found',
        code: 'FOREIGN_KEY_VIOLATION',
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
