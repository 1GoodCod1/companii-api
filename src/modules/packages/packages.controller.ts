import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PackagesService } from './packages.service';
import { CONTROLLER_PATH } from '../../common/constants';
import { Public } from '../../common/decorators/public.decorator';
import { CompanyGuard } from '../companies/guards/company.guard';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';

@Controller(CONTROLLER_PATH.packages)
export class PackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Public()
  @Get()
  list(@Query('companySlug') companySlug?: string) {
    return this.packages.listPublic(companySlug);
  }

  @Get('me')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  listMine(@CurrentUser() user: JwtPayload) {
    return this.packages.listForCompany(user.activeCompanyId!);
  }

  @Public()
  @Post(':id/book')
  book(
    @Param('id') id: string,
    @Body()
    body: {
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      scheduledAt?: string;
    },
  ) {
    return this.packages.book(id, body);
  }

  @Post()
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  create(@CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>) {
    return this.packages.createForCompany(user, user.activeCompanyId!, body);
  }

  @Patch(':id')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.packages.updateForCompany(user.activeCompanyId!, id, body);
  }

  @Delete(':id')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.packages.deleteForCompany(user.activeCompanyId!, id);
  }
}
