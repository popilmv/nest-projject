import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { RequestUser, UserRole } from './user.types';

type AuthenticatedRequest = Request & { user?: RequestUser };

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
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = req.header('x-user-id');

    if (!userId) {
      throw new UnauthorizedException('Missing x-user-id header');
    }

    const roleHeader = req.header('x-user-role');
    const role: UserRole = roleHeader === 'admin' ? 'admin' : 'user';

    const user: RequestUser = { id: userId, role };
    req.user = user;

    return true;
  }
}
