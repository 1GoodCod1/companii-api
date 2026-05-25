import { SetMetadata } from '@nestjs/common';
import type { AccountKind } from '@prisma/client';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: AccountKind[]) => SetMetadata(ROLES_KEY, roles);
