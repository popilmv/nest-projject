import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException as NestHttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { HttpException as DomainHttpException } from '../errors/http-exception';

function toErrorCode(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();

    if (!req || !res) {
      if (exception instanceof Error) throw exception;
      throw new Error(String(exception));
    }

    const timestamp = new Date().toISOString();
    const path = req.url ?? 'n/a';
    const requestId =
      req.header('x-request-id') ??
      req.header('x-correlation-id') ??
      undefined;

    if (exception instanceof DomainHttpException) {
      return res.status(exception.statusCode).json({
        statusCode: exception.statusCode,
        code: exception.code,
        message: exception.message,
        details: exception.details,
        path,
        requestId,
        timestamp,
      });
    }

    if (exception instanceof NestHttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      const responseBody =
        typeof response === 'object' && response !== null
          ? (response as Record<string, unknown>)
          : { message: response };
      const message = responseBody.message ?? exception.message;
      const error = String(responseBody.error ?? exception.name);

      return res.status(statusCode).json({
        statusCode,
        code: toErrorCode(error),
        message,
        details: responseBody,
        path,
        requestId,
        timestamp,
      });
    }

    return res.status(500).json({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected error',
      path,
      requestId,
      timestamp,
    });
  }
}
