import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsController } from './notifications.controller';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { NotificationsQueryService } from './services/notifications-query.service';
import { NotificationsActionService } from './services/notifications-action.service';
import { NotificationsSenderService } from './services/notifications-sender.service';
import { TelegramProcessor } from './processor/telegram.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'telegram',
    }),
  ],
  controllers: [NotificationsController, TelegramWebhookController],
  providers: [
    NotificationsQueryService,
    NotificationsActionService,
    NotificationsSenderService,
    TelegramProcessor,
  ],
  exports: [NotificationsActionService, NotificationsSenderService],
})
export class NotificationsModule {}
