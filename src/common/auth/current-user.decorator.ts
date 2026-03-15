import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from './user.types';

type AuthenticatedRequest = Request & { user?: RequestUser };

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return req.user as RequestUser;
  },
);
