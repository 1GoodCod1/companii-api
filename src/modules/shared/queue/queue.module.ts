import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from './queue.constants';
import { QueueService } from './queue.service';
import {
  CalculateProcessor,
  PdfProcessor,
  EmailProcessor,
  InvoicePdfProcessor,
  ConvertProcessor,
} from './processors';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('redis.url') ?? 'redis://localhost:6380',
          maxRetriesPerRequest: null,
          connectTimeout: 10_000,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        },
      }),
    }),
    BullModule.registerQueue(
      ...Object.values(QUEUE_NAMES).map((name) => ({ name })),
    ),
  ],
  providers: [
    QueueService,
    CalculateProcessor,
    PdfProcessor,
    EmailProcessor,
    InvoicePdfProcessor,
    ConvertProcessor,
  ],
  exports: [QueueService],
})
export class QueueModule {}