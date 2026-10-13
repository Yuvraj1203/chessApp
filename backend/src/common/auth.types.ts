import type { Role } from '../database/schema';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}
