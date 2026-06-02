import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants';
import type { EstimateCalculateJob } from '../queue.service';

@Processor(QUEUE_NAMES.ESTIMATE_CALCULATE)
export class CalculateProcessor extends WorkerHost {
  private readonly logger = new Logger(CalculateProcessor.name);

  async process(job: Job<EstimateCalculateJob>): Promise<void> {
    this.logger.log(
      `Processing calculate job ${job.id} for project ${job.data.projectId}`,
    );
    await job.updateProgress(50);
    await job.log('Calculate processor registered for estimate-calculate queue');
  }
}

@Processor(QUEUE_NAMES.ESTIMATE_PDF)
export class PdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfProcessor.name);

  async process(): Promise<void> {
    this.logger.log('PDF processor placeholder registered');
    await Promise.resolve();
  }
}

@Processor(QUEUE_NAMES.ESTIMATE_EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  async process(): Promise<void> {
    this.logger.log('Email processor placeholder registered');
    await Promise.resolve();
  }
}

@Processor(QUEUE_NAMES.INVOICE_PDF)
export class InvoicePdfProcessor extends WorkerHost {
  private readonly logger = new Logger(InvoicePdfProcessor.name);

  async process(): Promise<void> {
    this.logger.log('Invoice PDF processor placeholder registered');
    await Promise.resolve();
  }
}

@Processor(QUEUE_NAMES.ESTIMATE_CONVERT)
export class ConvertProcessor extends WorkerHost {
  private readonly logger = new Logger(ConvertProcessor.name);

  async process(): Promise<void> {
    this.logger.log('Convert processor placeholder registered');
    await Promise.resolve();
  }
}