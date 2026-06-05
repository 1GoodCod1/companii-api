import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '@/modules/companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '@/modules/auth/guards/subscription.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { EstimatesService } from '../estimates.service';
import {
  CreateReceiptDto,
  SetLinesActualStatusDto,
  UpdateReceiptDto,
} from '../dto/receipt.dto';

@Controller(CONTROLLER_PATH.estimates)
export class EstimateReceiptsController {
  constructor(private readonly estimates: EstimatesService) {}

  @Post('projects/:id/receipts')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER', 'MEMBER')
  createReceipt(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: CreateReceiptDto,
  ) {
    return this.estimates.createReceipt(user, id, body);
  }

  @Patch('projects/:id/receipts/:receiptId')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER', 'MEMBER')
  updateReceipt(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('receiptId') receiptId: string,
    @Body() body: UpdateReceiptDto,
  ) {
    return this.estimates.updateReceipt(user, id, receiptId, body);
  }

  @Post('projects/:id/receipts/:receiptId/verify')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  verifyReceipt(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('receiptId') receiptId: string,
  ) {
    return this.estimates.verifyReceipt(user, id, receiptId);
  }

  @Post('projects/:id/lock-actuals')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  lockActuals(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.estimates.lockActuals(user, id);
  }

  @Post('projects/:id/unlock-actuals')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  unlockActuals(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.estimates.unlockActuals(user, id);
  }

  @Post('projects/:id/lines/actual-status')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER', 'MEMBER')
  setLinesActualStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: SetLinesActualStatusDto,
  ) {
    return this.estimates.setLinesActualStatus(user, id, body);
  }
}
