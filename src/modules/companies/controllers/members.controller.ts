import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../../shared/database/prisma.service';
import { CONTROLLER_PATH } from '../../../common/constants';
import { Public } from '../../../common/decorators/public.decorator';
import { CompanyGuard } from '../guards/company.guard';
import { CompanyRoles } from '../decorators/company-roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { AuthService } from '../../auth/auth.service';
import { RefreshCookieService } from '../../auth/services/refresh-cookie.service';
import { PortalService } from '../../portal/portal.service';
import { TeamInviteService } from '../team/team-invite.service';
import { TeamMembersService } from '../team/team-members.service';
import {
  AcceptTeamInviteDto,
  AddTeamMemberDirectDto,
  CreateTeamInviteLinkDto,
} from '../team/dto/team-invite.dto';
import { TransferOwnershipDto, UpdateMemberRoleDto } from '../team/dto/team-member.dto';

@Controller(`${CONTROLLER_PATH.companies}/members`)
export class MembersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portal: PortalService,
    private readonly teamInvite: TeamInviteService,
    private readonly teamMembers: TeamMembersService,
    private readonly auth: AuthService,
    private readonly refreshCookie: RefreshCookieService,
  ) {}

  @Get('list')
  @UseGuards(CompanyGuard)
  list(@CurrentUser() user: JwtPayload) {
    const isTechnician = user.companyRole === 'MEMBER';
    return this.prisma.companyMember.findMany({
      where: {
        companyId: user.activeCompanyId!,
        status: 'ACTIVE',
        ...(isTechnician && user.memberId ? { id: user.memberId } : {}),
      },
      include: {
        user: {
          select: isTechnician
            ? { id: true, firstName: true, lastName: true }
            : {
                id: true,
                email: true,
                phone: true,
                firstName: true,
                lastName: true,
              },
        },
        _count: {
          select: { interventions: true },
        },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
  }

  @Get('invitations')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  listInvitations(@CurrentUser() user: JwtPayload) {
    return this.prisma.companyInvitation.findMany({
      where: {
        companyId: user.activeCompanyId!,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Public()
  @Get('invitations/preview')
  previewInvite(@Query('token') token: string) {
    return this.teamInvite.previewInvite(token);
  }

  @Post('invitations/accept')
  acceptInvite(@CurrentUser() user: JwtPayload, @Body() dto: AcceptTeamInviteDto) {
    return this.teamInvite.acceptInviteToken(dto.token, user.sub);
  }

  @Post('invite-link')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  createInviteLink(@CurrentUser() user: JwtPayload, @Body() dto: CreateTeamInviteLinkDto) {
    return this.teamInvite.createLinkInvite(
      user.activeCompanyId!,
      dto.role,
      dto.email,
      user.companyRole,
    );
  }

  @Post('add-direct')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  addDirect(@CurrentUser() user: JwtPayload, @Body() dto: AddTeamMemberDirectDto) {
    return this.teamInvite.addDirectMember(
      user.activeCompanyId!,
      dto.contact,
      dto.role,
      user.companyRole,
    );
  }

  @Patch(':memberId/role')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  updateRole(
    @CurrentUser() user: JwtPayload,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.teamMembers.updateMemberRole(user, memberId, dto.role);
  }

  @Post('leave')
  @UseGuards(CompanyGuard)
  async leaveCompany(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.teamMembers.leaveCompany(user);
    const result = await this.auth.refreshCompanyContext(user.sub);
    return this.refreshCookie.handleAuthSuccess(result, res);
  }

  @Post(':memberId/deactivate')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  deactivate(@CurrentUser() user: JwtPayload, @Param('memberId') memberId: string) {
    return this.teamMembers.deactivateMember(user, memberId);
  }

  @Delete('invitations/:invitationId')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  revokeInvitation(
    @CurrentUser() user: JwtPayload,
    @Param('invitationId') invitationId: string,
  ) {
    return this.teamMembers.revokeInvitation(user, invitationId);
  }

  @Post('customers/:customerId/portal-invite')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  portalInvite(@Param('customerId') customerId: string) {
    return this.portal.createInvite(customerId);
  }
}
