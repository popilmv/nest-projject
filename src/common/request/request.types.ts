import { Request } from 'express';
import { RequestUser } from '../auth/user.types';

export type AppRequest = Request & {
  id?: string;
  correlationId?: string;
  user?: RequestUser;
};
