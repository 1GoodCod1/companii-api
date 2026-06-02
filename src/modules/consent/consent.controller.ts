import { Controller, Post, Get, Body, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ConsentService } from './consent.service';
import { GrantConsentDto } from './dto/grant-consent.dto';
import { RevokeConsentDto } from './dto/revoke-consent.dto';
import { CONTROLLER_PATH } from '../../common/constants';
import { CompanyGuard } from '@/modules/companies/guards/company.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';

@Controller(CONTROLLER_PATH.consent)
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @Post('grant')
  @UseGuards(CompanyGuard)
  async grantConsent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GrantConsentDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip ?? req.socket?.remoteAddress ?? undefined;
    const userAgent = req.headers['user-agent'] ?? undefined;

    const consent = await this.consentService.grantConsent(user, dto.consentType, {
      lawfulBasis: dto.lawfulBasis,
      version: dto.version,
      ipAddress,
      userAgent,
    });

    return { message: 'Consent granted successfully', id: consent.id };
  }

  @Post('revoke')
  @UseGuards(CompanyGuard)
  async revokeConsent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RevokeConsentDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip ?? req.socket?.remoteAddress ?? undefined;
    const userAgent = req.headers['user-agent'] ?? undefined;

    await this.consentService.revokeConsent(user, dto.consentType, {
      ipAddress,
      userAgent,
    });

    return { message: 'Consent revoked successfully' };
  }

  @Get('my')
  @UseGuards(CompanyGuard)
  async getMyConsents(@CurrentUser() user: JwtPayload) {
    return this.consentService.getMyConsents(user);
  }
}
