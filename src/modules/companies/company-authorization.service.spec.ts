import type { JwtPayload } from '../auth/types/jwt-payload';
import { CompanyAuthorizationService } from './company-authorization.service';
import { AppErrorMessages } from '../../common/errors/app-error-messages';

describe('CompanyAuthorizationService', () => {
  const service = new CompanyAuthorizationService({} as never);

  const baseUser: JwtPayload = {
    sub: 'user-1',
    email: 'owner@test.local',
    accountKind: 'COMPANY_STAFF',
    activeCompanyId: 'company-1',
    companyRole: 'OWNER',
    memberId: 'member-1',
  };

  it('allows same-company context', () => {
    expect(() => service.assertSameCompanyContext(baseUser, 'company-1')).not.toThrow();
  });

  it('denies cross-company context', () => {
    expect(() => service.assertSameCompanyContext(baseUser, 'company-2')).toThrow(
      AppErrorMessages.COMPANY_ACCESS_DENIED,
    );
  });

  it('allows owner and manager to manage team', () => {
    expect(() => service.assertCanManageTeam(baseUser)).not.toThrow();
    expect(() =>
      service.assertCanManageTeam({ ...baseUser, companyRole: 'MANAGER' }),
    ).not.toThrow();
  });

  it('denies technician team management', () => {
    expect(() =>
      service.assertCanManageTeam({ ...baseUser, companyRole: 'MEMBER' }),
    ).toThrow(AppErrorMessages.COMPANY_ACCESS_DENIED);
  });

  it('rejects OWNER invites', () => {
    expect(() => service.assertInvitableRole('OWNER')).toThrow(
      AppErrorMessages.VALIDATION_FAILED,
    );
  });

  it('allows MANAGER and MEMBER invites', () => {
    expect(() => service.assertInvitableRole('MANAGER')).not.toThrow();
    expect(() => service.assertInvitableRole('MEMBER')).not.toThrow();
  });

  it('prevents manager from inviting another manager', () => {
    expect(() => service.assertInviterCanAssignRole('MANAGER', 'MANAGER')).toThrow(
      AppErrorMessages.TEAM_INVITE_MANAGER_CANNOT_INVITE_MANAGER,
    );
  });

  it('prevents self-modification', () => {
    expect(() =>
      service.assertCanModifyMember(baseUser, 'MEMBER', baseUser.sub),
    ).toThrow(AppErrorMessages.TEAM_MEMBER_CANNOT_CHANGE);
  });

  it('prevents manager from modifying non-members', () => {
    expect(() =>
      service.assertCanModifyMember(
        { ...baseUser, companyRole: 'MANAGER' },
        'MANAGER',
        'other-user',
      ),
    ).toThrow(AppErrorMessages.TEAM_MEMBER_CANNOT_CHANGE);
  });
});
