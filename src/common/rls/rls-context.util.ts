import type { RlsContext } from '../types/rls-context';
import type { JwtPayload } from '../../modules/auth/types/jwt-payload';

export function rlsContextFromUser(
  user: JwtPayload,
  overrides?: Partial<RlsContext>,
): RlsContext {
  return {
    userId: user.sub,
    accountKind: user.accountKind,
    companyId: overrides?.companyId ?? user.activeCompanyId,
    companyRole: overrides?.companyRole ?? user.companyRole,
    memberId: overrides?.memberId ?? user.memberId,
    customerId: overrides?.customerId ?? user.customerId,
  };
}

export function rlsContextFromUserId(
  userId: string,
  accountKind: RlsContext['accountKind'],
  overrides?: Partial<RlsContext>,
): RlsContext {
  return {
    userId,
    accountKind,
    companyId: overrides?.companyId,
    companyRole: overrides?.companyRole,
    memberId: overrides?.memberId,
    customerId: overrides?.customerId,
  };
}
