import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants';
import type { EstimateCalculateJob } from '../queue.service';

/**
 * Background worker that processes estimate-calculation jobs.
 * In production this would import the service and call calculateProject().
 * For now it provides the structure; the actual wiring to EstimatesService
 * is done by the estimate module via a dedicated processor.
 */
@Processor(QUEUE_NAMES.ESTIMATE_CALCULATE)
export class CalculateProcessor extends WorkerHost {
  private readonly logger = new Logger(CalculateProcessor.name);

  async process(job: Job<EstimateCalculateJob>): Promise<void> {
    this.logger.log(
      `Processing calculate job ${job.id} for project ${job.data.projectId}`,
    );
    job.updateProgress(50);
    job.log('Calculate processor registered for estimate-calculate queue');
  }
}

@Processor(QUEUE_NAMES.ESTIMATE_PDF)
export class PdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfProcessor.name);

  async process(): Promise<void> {
    this.logger.log('PDF processor placeholder registered');
  }
}

@Processor(QUEUE_NAMES.ESTIMATE_EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  async process(): Promise<void> {
    this.logger.log('Email processor placeholder registered');
  }
}

@Processor(QUEUE_NAMES.INVOICE_PDF)
export class InvoicePdfProcessor extends WorkerHost {
  private readonly logger = new Logger(InvoicePdfProcessor.name);

  async process(): Promise<void> {
    this.logger.log('Invoice PDF processor placeholder registered');
  }
}

@Processor(QUEUE_NAMES.ESTIMATE_CONVERT)
export class ConvertProcessor extends WorkerHost {
  private readonly logger = new Logger(ConvertProcessor.name);

  async process(): Promise<void> {
    this.logger.log('Convert processor placeholder registered');
  }
}