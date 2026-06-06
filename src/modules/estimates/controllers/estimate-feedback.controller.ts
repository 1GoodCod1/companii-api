import { Body, Controller, Post } from '@nestjs/common';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { EstimateFeedbackService } from '../services/projects/estimate-feedback.service';
import { CreateEstimateFeedbackDto } from '../dto/estimate-feedback.dto';

@Controller(CONTROLLER_PATH.estimates)
export class EstimateFeedbackController {
  constructor(private readonly feedbackService: EstimateFeedbackService) {}

  @Post('feedback')
  createFeedback(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateEstimateFeedbackDto,
  ) {
    return this.feedbackService.createFeedback(user, dto);
  }
}
