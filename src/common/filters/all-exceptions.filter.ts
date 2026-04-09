import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException as NestHttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { HttpException } from '../errors/http-exception';
import { AppRequest } from '../request/request.types';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<AppRequest>();
    if (!req || !res) {
      if (exception instanceof Error) throw exception;
      throw new Error(String(exception));
    }
    const timestamp = new Date().toISOString();
    const path = req.url ?? 'n/a';
    const basePayload = {
      path,
      timestamp,
      requestId: req.id,
      correlationId: req.correlationId,
    };

    if (exception instanceof HttpException) {
      return res.status(exception.statusCode).json({
        statusCode: exception.statusCode,
        code: exception.code,
        message: exception.message,
        details: exception.details,
        ...basePayload,
      });
    }

    if (exception instanceof NestHttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'object' && response !== null && 'message' in response
          ? response.message
          : exception.message;

      return res.status(status).json({
        statusCode: status,
        code: 'HTTP_EXCEPTION',
        message,
        ...basePayload,
      });
    }

    return res.status(500).json({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected error',
      ...basePayload,
    });
  }
}
