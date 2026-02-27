import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const userId = req.header('x-user-id');

    if (!userId) {
      throw new UnauthorizedException('Missing x-user-id header');
    }

    const roleHeader = (req.header('x-user-role') || 'user') as UserRole;
    const role: UserRole = roleHeader === 'admin' ? 'admin' : 'user';

    const user: RequestUser = { id: userId, role };
    req.user = user;

    return true;
  }
}
