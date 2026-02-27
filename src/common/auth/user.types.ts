export type UserRole = 'admin' | 'user';

export interface RequestUser {
  id: string;
  role: UserRole;
}
