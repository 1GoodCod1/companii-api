import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InterventionStatus } from '@prisma/client';
import { FsmService } from '../fsm.service';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '@/modules/companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '@/modules/auth/guards/subscription.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import {
  AddInterventionPhotosDto,
  CreateInterventionDto,
  CreateInterventionNoteDto,
  UpdateChecklistDto,
  UpdateInterventionDto,
  UpdateInterventionStatusDto,
} from '../dto/intervention.dto';

@Controller(`${CONTROLLER_PATH.fsm}/interventions`)
export class FsmInterventionsController {
  constructor(private readonly fsm: FsmService) {}

  @Get()
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('interventions')
  interventions(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: InterventionStatus,
    @Query('customerId') customerId?: string,
    @Query('technicianId') technicianId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 100) : undefined;
    return this.fsm.listInterventions(user, { status, customerId, technicianId }, cursor, parsedLimit);
  }

  @Get(':id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('interventions')
  intervention(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.getIntervention(user, id);
  }

  @Post()
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('interventions')
  @CompanyRoles('OWNER', 'MANAGER')
  createIntervention(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateInterventionDto,
  ) {
    return this.fsm.createIntervention(user, body);
  }

  @Patch(':id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('interventions')
  updateIntervention(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpdateInterventionDto,
  ) {
    return this.fsm.updateIntervention(user, id, body);
  }

  @Patch(':id/status')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('interventions')
  status(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpdateInterventionStatusDto,
  ) {
    return this.fsm.updateInterventionStatus(user, id, body.status, body.note);
  }

  @Delete(':id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('interventions')
  @CompanyRoles('OWNER', 'MANAGER')
  deleteIntervention(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.deleteIntervention(user, id);
  }

  @Post(':id/notes')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('interventions')
  createNote(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: CreateInterventionNoteDto,
  ) {
    return this.fsm.createInterventionNote(user, id, body);
  }

  @Delete(':id/notes/:noteId')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('interventions')
  deleteNote(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
  ) {
    return this.fsm.deleteInterventionNote(user, id, noteId);
  }

  @Post(':id/photos')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('interventions')
  addPhotos(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: AddInterventionPhotosDto,
  ) {
    return this.fsm.addInterventionPhotos(user, id, body.fileKeys);
  }

  @Delete(':id/photos/:photoId')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('interventions')
  deletePhoto(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
  ) {
    return this.fsm.deleteInterventionPhoto(user, id, photoId);
  }

  @Patch(':id/checklist')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('interventions')
  updateChecklist(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpdateChecklistDto,
  ) {
    return this.fsm.updateChecklistProgress(user, id, body.progress);
  }
}
