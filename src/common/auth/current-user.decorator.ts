import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser } from './user.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as RequestUser;
  },
);
