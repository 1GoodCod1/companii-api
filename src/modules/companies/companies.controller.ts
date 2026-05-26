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
import { AppErrorMessages, AppErrors } from '../../common/errors';
import { CompaniesService } from './companies.service';
import { TeamMembersService } from './team-members.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { AddGalleryImageDto } from './dto/add-gallery-image.dto';
import { SwitchCompanyDto } from './dto/switch-company.dto';
import { TransferOwnershipDto } from './dto/team-member.dto';
import { CONTROLLER_PATH } from '../../common/constants';
import { AuthService } from '../auth/auth.service';
import { RefreshCookieService } from '../auth/services/refresh-cookie.service';

/** Paths handled by sibling controllers — must not match @Get(':slug'). */
const RESERVED_COMPANY_SLUGS = new Set([
  'members',
  'waitlist',
  'me',
  'cities',
  'categories',
]);
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CompanyGuard } from './guards/company.guard';
import { CompanyRoles } from './decorators/company-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { ClientProjectRequestDto } from './dto/client-project-request.dto';
import { ClientServiceRequestDto } from './dto/client-service-request.dto';

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

  @Patch(':id')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: Partial<CreateCompanyDto>,
  ) {
    return this.companies.update(user, id, dto);
  }

  @Patch(':id/publish')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER')
  publish(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.companies.publish(user, id);
  }

  @Post(':id/gallery')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  addGalleryImage(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AddGalleryImageDto,
  ) {
    return this.companies.addGalleryImage(user, id, dto);
  }

  @Delete(':id/gallery/:imageId')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  removeGalleryImage(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.companies.removeGalleryImage(user, id, imageId);
  }

  @Post(':id/transfer-ownership')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER')
  transferOwnership(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: TransferOwnershipDto,
  ) {
    return this.teamMembers.transferOwnership(user, dto.newOwnerUserId, id);
  }
}
