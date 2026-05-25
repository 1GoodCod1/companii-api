import { rlsContextFromUser, rlsContextFromUserId } from './rls-context.util';
import type { JwtPayload } from '../../modules/auth/types/jwt-payload';

describe('rlsContextFromUser', () => {
  const user: JwtPayload = {
    sub: 'user-1',
    email: 'staff@test.local',
    accountKind: 'COMPANY_STAFF',
    activeCompanyId: 'company-1',
    companyRole: 'MANAGER',
    memberId: 'member-1',
  };

  it('maps jwt fields to RLS context', () => {
    expect(rlsContextFromUser(user)).toEqual({
      userId: 'user-1',
      accountKind: 'COMPANY_STAFF',
      companyId: 'company-1',
      companyRole: 'MANAGER',
      memberId: 'member-1',
      customerId: undefined,
    });
  });

  it('applies overrides', () => {
    expect(
      rlsContextFromUser(user, {
        companyId: 'company-2',
        companyRole: 'OWNER',
      }),
    ).toEqual({
      userId: 'user-1',
      accountKind: 'COMPANY_STAFF',
      companyId: 'company-2',
      companyRole: 'OWNER',
      memberId: 'member-1',
      customerId: undefined,
    });
  });
});

describe('rlsContextFromUserId', () => {
  it('builds platform admin context', () => {
    expect(rlsContextFromUserId('admin-1', 'PLATFORM_ADMIN')).toEqual({
      userId: 'admin-1',
      accountKind: 'PLATFORM_ADMIN',
      companyId: undefined,
      companyRole: undefined,
      memberId: undefined,
      customerId: undefined,
    });
  });
});
