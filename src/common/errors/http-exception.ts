export class HttpException extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export class BadRequestError extends HttpException {
  constructor(message: string, details?: unknown) {
    super(400, 'BAD_REQUEST', message, details);
  }
}

export class ConflictError extends HttpException {
  constructor(message: string, details?: unknown) {
    super(409, 'CONFLICT', message, details);
  }
}

export class NotFoundError extends HttpException {
  constructor(message: string, details?: unknown) {
    super(404, 'NOT_FOUND', message, details);
  }
}

export class ServiceUnavailableError extends HttpException {
  constructor(message: string, details?: unknown) {
    super(503, 'SERVICE_UNAVAILABLE', message, details);
  }
}

export class GatewayTimeoutError extends HttpException {
  constructor(message: string, details?: unknown) {
    super(504, 'GATEWAY_TIMEOUT', message, details);
  }
}
