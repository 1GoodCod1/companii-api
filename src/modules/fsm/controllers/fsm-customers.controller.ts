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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { FsmService } from '../fsm.service';
import { CustomerImportService } from '../customer-import/customer-import.service';
import { ConfirmCustomerImportDto } from '@/modules/fsm/dto/confirm-customer-import.dto';
import { CreateCustomerDto, UpdateCustomerDto } from '../dto/customer.dto';
import { CONTROLLER_PATH } from '../../../common/constants';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { CompanyGuard } from '@/modules/companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '@/modules/auth/guards/subscription.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';

@Controller(`${CONTROLLER_PATH.fsm}/customers`)
export class FsmCustomersController {
  constructor(
    private readonly fsm: FsmService,
    private readonly customerImport: CustomerImportService,
  ) {}

  @Get()
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('customers')
  customers(
    @CurrentUser() user: JwtPayload,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 100) : undefined;
    return this.fsm.listCustomers(user, cursor, parsedLimit);
  }

  @Get('count')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('customers')
  async customersCount(@CurrentUser() user: JwtPayload) {
    const total = await this.fsm.countCustomers(user);
    return { total };
  }

  @Get('import/template')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('customers')
  @CompanyRoles('OWNER', 'MANAGER')
  async customerImportTemplate(
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    const resolved = format === 'csv' ? 'csv' : 'xlsx';
    const template = await this.customerImport.getTemplate(resolved);
    res.set({
      'Content-Type': template.contentType,
      'Content-Disposition': `attachment; filename="${template.filename}"`,
      'Content-Length': template.buffer.length,
    });
    res.send(template.buffer);
  }

  @Post('import/preview')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('customers')
  @CompanyRoles('OWNER', 'MANAGER')
  @UseInterceptors(FileInterceptor('file'))
  previewCustomerImport(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw AppErrors.badRequest(AppErrorMessages.FILES_NONE_UPLOADED);
    }
    return this.customerImport.previewFromFile(user, file.buffer, file.originalname);
  }

  @Post('import/confirm')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('customers')
  @CompanyRoles('OWNER', 'MANAGER')
  confirmCustomerImport(
    @CurrentUser() user: JwtPayload,
    @Body() body: ConfirmCustomerImportDto,
  ) {
    return this.customerImport.confirmImport(user, body.rows);
  }

  @Get(':id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('customers')
  customer(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.getCustomer(user, id);
  }

  @Get(':id/timeline')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('customers')
  customerTimeline(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.getCustomerTimeline(user, id);
  }

  @Post()
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('customers')
  @CompanyRoles('OWNER', 'MANAGER')
  createCustomer(@CurrentUser() user: JwtPayload, @Body() body: CreateCustomerDto) {
    return this.fsm.createCustomer(user, body);
  }

  @Patch(':id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('customers')
  @CompanyRoles('OWNER', 'MANAGER')
  updateCustomer(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpdateCustomerDto,
  ) {
    return this.fsm.updateCustomer(user, id, body);
  }

  @Delete(':id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('customers')
  @CompanyRoles('OWNER', 'MANAGER')
  deleteCustomer(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.deleteCustomer(user, id);
  }
}
