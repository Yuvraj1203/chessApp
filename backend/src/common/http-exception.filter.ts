import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export interface ApiError {
  success: false;
  error: {
    statusCode: number;
    error: string;
    message: string;
    details?: string[];
  };
  path: string;
  timestamp: string;
}

/** Wraps every error as `{ success: false, error: {...}, path, timestamp }`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message = 'Something went wrong';
    let details: string[] | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const b = body as { message?: string | string[]; error?: string };
        error = b.error ?? exception.name;
        if (Array.isArray(b.message)) {
          details = b.message;
          message = 'Validation failed';
        } else {
          message = b.message ?? exception.message;
        }
      }
    } else {
      this.logger.error(exception);
    }

    const payload: ApiError = {
      success: false,
      error: { statusCode, error, message, ...(details ? { details } : {}) },
      path: req.url,
      timestamp: new Date().toISOString(),
    };
    res.status(statusCode).json(payload);
  }
}
