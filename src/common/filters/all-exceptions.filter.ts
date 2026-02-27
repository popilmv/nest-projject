import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Request, Response } from 'express';
import { HttpException } from '../errors/http-exception';

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

    if (exception instanceof HttpException) {
      return res.status(exception.statusCode).json({
        statusCode: exception.statusCode,
        code: exception.code,
        message: exception.message,
        details: exception.details,
        path,
        timestamp,
      });
    }

    return res.status(500).json({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected error',
      path,
      timestamp,
    });
  }
}
