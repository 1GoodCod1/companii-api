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
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { CompaniesService } from '../companies.service';
import { TeamMembersService } from '../team/team-members.service';
import { CreateCompanyDto } from '@/modules/companies/dto/create-company.dto';
import { AddGalleryImageDto } from '@/modules/companies/dto/add-gallery-image.dto';
import { SwitchCompanyDto } from '@/modules/companies/dto/switch-company.dto';
import { TransferOwnershipDto } from '@/modules/companies/team/dto/team-member.dto';
import { CONTROLLER_PATH } from '../../../common/constants';
import { AuthService } from '../../auth/auth.service';
import { RefreshCookieService } from '../../auth/services/refresh-cookie.service';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CompanyGuard } from '@/modules/companies/guards/company.guard';
import { CompanyRoles } from '../decorators/company-roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AllowUnverified } from '../decorators/allow-unverified.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { ClientProjectRequestDto } from '@/modules/companies/dto/client-project-request.dto';
import { ClientServiceRequestDto } from '@/modules/companies/dto/client-service-request.dto';
import { UpdatePricingModifiersDto } from '@/modules/companies/dto/update-pricing-modifiers.dto';

const RESERVED_COMPANY_SLUGS = new Set([
  'members',
  'waitlist',
  'me',
  'cities',
  'categories',
]);

@UseGuards(JwtAuthGuard)
@Controller(CONTROLLER_PATH.companies)
export class CompaniesController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly auth: AuthService,
    private readonly refreshCookie: RefreshCookieService,
    private readonly teamMembers: TeamMembersService,
  ) {}

  @Public()
  @Get()
  list(
    @Query('cityId') cityId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.companies.findPublicList({
      cityId,
      categoryId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.companies.findMe(user);
  }

  @Post('switch')
  async switchCompany(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SwitchCompanyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.switchCompany(user.sub, dto.companyId);
    return this.refreshCookie.handleAuthSuccess(result, res);
  }

  @Public()
  @Get('cities')
  getCities() {
    return this.companies.findCities();
  }

  @Public()
  @Get('categories')
  getCategories() {
    return this.companies.findCategories();
  }

  @UseGuards(RolesGuard)
  @Roles('END_CLIENT')
  @Post(':slug/request-project')
  requestProject(
    @CurrentUser() user: JwtPayload,
    @Param('slug') slug: string,
    @Body() body: ClientProjectRequestDto,
  ) {
    if (RESERVED_COMPANY_SLUGS.has(slug)) {
      throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    }
    return this.companies.requestPublicProject(user, slug, body);
  }

  @UseGuards(RolesGuard)
  @Roles('END_CLIENT')
  @Post(':slug/services/:serviceId/request')
  requestService(
    @CurrentUser() user: JwtPayload,
    @Param('slug') slug: string,
    @Param('serviceId') serviceId: string,
    @Body() body: ClientServiceRequestDto,
  ) {
    if (RESERVED_COMPANY_SLUGS.has(slug)) {
      throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    }
    return this.companies.requestPublicService(user, slug, serviceId, body);
  }

  @Public()
  @Get(':slug/booking-slots')
  bookingSlots(@Param('slug') slug: string, @Query('from') from?: string) {
    if (RESERVED_COMPANY_SLUGS.has(slug)) {
      throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    }
    return this.companies.getBookingSlots(slug, from);
  }

  @Public()
  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    if (RESERVED_COMPANY_SLUGS.has(slug)) {
      throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    }
    return this.companies.findBySlug(slug);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCompanyDto) {
    return this.companies.create(user, dto);
  }

  @Patch('me')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  @AllowUnverified()
  update(
    @CurrentUser() user: JwtPayload,
    @Body() dto: Partial<CreateCompanyDto>,
  ) {
    return this.companies.update(user, user.activeCompanyId!, dto);
  }

  @Patch('me/publish')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER')
  publish(@CurrentUser() user: JwtPayload) {
    return this.companies.publish(user, user.activeCompanyId!);
  }

  @Get('me/pricing-modifiers')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  @AllowUnverified()
  getPricingModifiers(@CurrentUser() user: JwtPayload) {
    return this.companies.getPricingModifiers(user, user.activeCompanyId!);
  }

  @Patch('me/pricing-modifiers')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  @AllowUnverified()
  updatePricingModifiers(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePricingModifiersDto,
  ) {
    return this.companies.updatePricingModifiers(user, user.activeCompanyId!, dto.modifiers);
  }

  @Post('me/gallery')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  @AllowUnverified()
  addGalleryImage(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AddGalleryImageDto,
  ) {
    return this.companies.addGalleryImage(user, user.activeCompanyId!, dto);
  }

  @Delete('me/gallery/:imageId')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  @AllowUnverified()
  removeGalleryImage(
    @CurrentUser() user: JwtPayload,
    @Param('imageId') imageId: string,
  ) {
    return this.companies.removeGalleryImage(user, user.activeCompanyId!, imageId);
  }

  @Post('me/transfer-ownership')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER')
  transferOwnership(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TransferOwnershipDto,
  ) {
    return this.teamMembers.transferOwnership(user, dto.newOwnerUserId, user.activeCompanyId!);
  }

  @Get('me/audit')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER')
  getAuditLogs(
    @CurrentUser() user: JwtPayload,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.companies.getAuditLogs(user, user.activeCompanyId!, {
      action,
      userId,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }
}
