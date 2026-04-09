import { Injectable, Logger } from '@nestjs/common';
import { AppRequest } from '../request/request.types';

export type AuditOutcome = 'success' | 'failure' | 'denied';

export type AuditEvent = {
  action: string;
  actorId?: string | null;
  actorRole?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  outcome: AuditOutcome;
  reason?: string | null;
  correlationId?: string | null;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  logHttp(req: AppRequest, event: Omit<AuditEvent, 'requestId' | 'correlationId' | 'ip' | 'userAgent' | 'actorId' | 'actorRole'> & Partial<Pick<AuditEvent, 'actorId' | 'actorRole'>>) {
    this.log({
      ...event,
      actorId: event.actorId ?? req.user?.id ?? null,
      actorRole: event.actorRole ?? req.user?.role ?? null,
      requestId: req.id ?? null,
      correlationId: req.correlationId ?? req.id ?? null,
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });
  }

  log(event: AuditEvent) {
    this.logger.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        ...event,
      }),
    );
  }
}
