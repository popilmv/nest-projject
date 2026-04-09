import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit/audit.service';
import { DevAuthGuard } from './auth/dev-auth.guard';
import { RateLimitService } from './security/rate-limit.service';

@Global()
@Module({
  providers: [AuditService, RateLimitService, DevAuthGuard],
  exports: [AuditService, RateLimitService, DevAuthGuard],
})
export class CommonModule {}
