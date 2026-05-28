import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from './queue.constants';

export interface EstimateCalculateJob {
  projectId: string;
  companyId: string;
  userId: string;
}

export interface EstimatePdfJob {
  projectId: string;
  companyId: string;
  isClientView?: boolean;
}

export interface EstimateEmailJob {
  projectId: string;
  companyId: string;
  recipientEmail: string;
  subject: string;
}

export interface InvoicePdfJob {
  invoiceId: string;
  companyId: string;
}

export interface EstimateConvertJob {
  projectId: string;
  companyId: string;
  userId: string;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.ESTIMATE_CALCULATE)
    private readonly calculateQueue: Queue<EstimateCalculateJob>,
    @InjectQueue(QUEUE_NAMES.ESTIMATE_PDF)
    private readonly pdfQueue: Queue<EstimatePdfJob>,
    @InjectQueue(QUEUE_NAMES.ESTIMATE_EMAIL)
    private readonly emailQueue: Queue<EstimateEmailJob>,
    @InjectQueue(QUEUE_NAMES.INVOICE_PDF)
    private readonly invoicePdfQueue: Queue<InvoicePdfJob>,
    @InjectQueue(QUEUE_NAMES.ESTIMATE_CONVERT)
    private readonly convertQueue: Queue<EstimateConvertJob>,
  ) {}

  async enqueueCalculate(job: EstimateCalculateJob): Promise<string> {
    const result = await this.calculateQueue.add('calculate', job);
    this.logger.log(`Queued calculate for project ${job.projectId} (job ${result.id})`);
    return result.id!;
  }

  async enqueuePdf(job: EstimatePdfJob): Promise<string> {
    const result = await this.pdfQueue.add('generate-pdf', job);
    return result.id!;
  }

  async enqueueEmail(job: EstimateEmailJob): Promise<string> {
    const result = await this.emailQueue.add('send-email', job);
    return result.id!;
  }

  async enqueueInvoicePdf(job: InvoicePdfJob): Promise<string> {
    const result = await this.invoicePdfQueue.add('generate-invoice-pdf', job);
    return result.id!;
  }

  async enqueueConvert(job: EstimateConvertJob): Promise<string> {
    const result = await this.convertQueue.add('convert', job);
    return result.id!;
  }

  async getCalculateJobStatus(jobId: string) {
    const job = await this.calculateQueue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    return {
      id: job.id,
      state,
      progress: job.progress,
      result: job.returnvalue ?? undefined,
      failedReason: job.failedReason ?? undefined,
    };
  }
}