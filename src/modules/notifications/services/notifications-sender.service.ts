import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationType, NotificationCategory, NotificationStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface SendNotificationParams {
  userId: string;
  title?: string;
  message: string;
  type?: NotificationType;
  category?: NotificationCategory;
  metadata?: Record<string, any>;
  skipInApp?: boolean;
}

@Injectable()
export class NotificationsSenderService {
  private readonly logger = new Logger(NotificationsSenderService.name);

  constructor(
    @InjectQueue('telegram') private readonly telegramQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}
  async send(params: SendNotificationParams) {
    const { userId, title, message, type, category, metadata, skipInApp } = params;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true, leadNotifyChannel: true, notifyInApp: true },
    });

    if (!user) return null;

    let inAppSent = false;
    let telegramSent = false;
    if (user.notifyInApp && !skipInApp) {
      const inAppNotif = await this.prisma.notification.create({
        data: {
          userId,
          title,
          message,
          type: type || NotificationType.IN_APP,
          category,
          status: NotificationStatus.DELIVERED,
          metadata: metadata || {},
        },
      });
      inAppSent = true;
      
      // Emit event for SSE
      this.eventEmitter.emit('notification.created', {
        userId,
        notificationId: inAppNotif.id,
      });
    }
    const wantsTelegram =
      user.leadNotifyChannel === 'TELEGRAM' || user.leadNotifyChannel === 'BOTH';
    if (user.telegramChatId && wantsTelegram) {
      await this.sendTelegram(user.telegramChatId, message);
      telegramSent = true;
    }

    return { inAppSent, telegramSent };
  }

  async sendTelegram(chatId: string, message: string) {
    try {
      await this.telegramQueue.add('send_message', {
        chatId,
        message,
      });
      return true;
    } catch (e) {
      this.logger.error(`Failed to add telegram message to queue: ${e.message}`);
      return false;
    }
  }
}
