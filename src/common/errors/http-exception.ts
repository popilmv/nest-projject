export class HttpException extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: any,
  ) {
    super(message);
  }
}

export class BadRequestError extends HttpException {
  constructor(message: string, details?: any) {
    super(400, 'BAD_REQUEST', message, details);
  }
}

export class ConflictError extends HttpException {
  constructor(message: string, details?: any) {
    super(409, 'CONFLICT', message, details);
  }
}

export class NotFoundError extends HttpException {
  constructor(message: string, details?: any) {
    super(404, 'NOT_FOUND', message, details);
  }
}

