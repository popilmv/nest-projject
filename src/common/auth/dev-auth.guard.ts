import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AppRequest } from '../request/request.types';
import { RequestUser, UserRole } from './user.types';

/**
 * DEV ONLY guard to simulate authentication.
 *
 * Required header:
 *  - x-user-id: <uuid>
 * Optional:
 *  - x-user-role: admin|user (default: user)
 */
@Injectable()
export class DevAuthGuard implements CanActivate {
  constructor(private readonly audit: AuditService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const userId = req.header('x-user-id');

    if (!userId) {
      this.audit.logHttp(req, {
        action: 'auth.missing_user_header',
        targetType: 'session',
        targetId: 'x-user-id',
        outcome: 'failure',
        reason: 'Missing x-user-id header',
      });
      throw new UnauthorizedException('Missing x-user-id header');
    }

    const roleHeader = req.header('x-user-role');
    if (roleHeader && roleHeader !== 'admin' && roleHeader !== 'user') {
      this.audit.logHttp(req, {
        action: 'auth.invalid_role_header',
        targetType: 'session',
        targetId: 'x-user-role',
        outcome: 'failure',
        reason: `Invalid role header: ${roleHeader}`,
      });
      throw new UnauthorizedException('Invalid x-user-role header');
    }

    const role: UserRole = roleHeader === 'admin' ? 'admin' : 'user';

    const user: RequestUser = { id: userId, role };
    req.user = user;

    return true;
  }
}
