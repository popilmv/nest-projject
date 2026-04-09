import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { AppRequest } from '../request/request.types';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class DefaultRateLimitMiddleware implements NestMiddleware {
  private readonly limit = Number(process.env.RATE_LIMIT_DEFAULT_LIMIT || 120);
  private readonly ttlMs = Number(process.env.RATE_LIMIT_DEFAULT_TTL_MS || 60000);

  constructor(
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
  ) {}

  use(req: AppRequest, res: Response, next: NextFunction) {
    const identity = req.ip || 'unknown';
    const result = this.rateLimit.consume(`default:${identity}`, this.limit, this.ttlMs);

    this.applyHeaders(res, result.limit, result.remaining, result.resetAt, 'default');

    if (result.allowed) {
      return next();
    }

    res.setHeader('Retry-After', String(result.retryAfterSec));

    this.audit.logHttp(req, {
      action: 'abuse.rate_limit_exceeded',
      outcome: 'denied',
      targetType: 'route',
      targetId: req.originalUrl,
      reason: 'default policy exceeded',
    });

    return res.status(429).json({
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
      requestId: req.id,
      correlationId: req.correlationId,
    });
  }

  private applyHeaders(
    res: Response,
    limit: number,
    remaining: number,
    resetAt: number,
    policyName: string,
  ) {
    res.setHeader('RateLimit-Policy', `${policyName};w=60`);
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
  }
}
