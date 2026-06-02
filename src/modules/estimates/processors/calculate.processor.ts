import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../shared/queue/queue.constants';
import type { EstimateCalculateJob } from '../../shared/queue/queue.service';
import { EstimatesService } from '../estimates.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';

@Processor(QUEUE_NAMES.ESTIMATE_CALCULATE)
@Injectable()
export class EstimateCalculateProcessor extends WorkerHost {
  private readonly logger = new Logger(EstimateCalculateProcessor.name);

  constructor(private readonly estimatesService: EstimatesService) {
    super();
  }

  async process(job: Job<EstimateCalculateJob>): Promise<void> {
    const { projectId, companyId, userId } = job.data;
    this.logger.log(
      `Starting background calculate for project ${projectId} (job ${job.id})`,
    );

    const minimalUser: JwtPayload = {
      sub: userId,
      email: 'system@queue',
      accountKind: 'OWNER' as JwtPayload['accountKind'],
      activeCompanyId: companyId,
    };

    try {
      await job.updateProgress(30);
      await this.estimatesService.calculateProject(minimalUser, projectId);
      await job.updateProgress(100);
      this.logger.log(`Calculate complete for project ${projectId} (job ${job.id})`);
    } catch (err) {
      this.logger.error(
        `Calculate failed for project ${projectId} (job ${job.id}): ${err}`,
      );
      throw err;
    }
  }
}