import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { LeadNotifyChannel } from '@prisma/client';

@Injectable()
export class NotificationsActionService {
  constructor(private readonly prisma: PrismaService) {}

  async markAsRead(userId: string, notificationId: string) {
    const notif = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notif || notif.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async generateTelegramToken(userId: string) {
    // delete old tokens
    await this.prisma.telegramConnectToken.deleteMany({
      where: { userId },
    });

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
    await this.prisma.telegramConnectToken.create({
      data: { token, userId, expiresAt },
    });
    return { token, botUrl: process.env.TELEGRAM_BOT_URL || 'https://t.me/YourBot' };
  }

  async updateNotifyPreferences(userId: string, data: { inApp?: boolean; telegram?: boolean }) {
    let leadNotifyChannel: LeadNotifyChannel | undefined = undefined;
    if (data.telegram !== undefined) {
      leadNotifyChannel = data.telegram ? LeadNotifyChannel.TELEGRAM : LeadNotifyChannel.NONE;
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        notifyInApp: data.inApp,
        ...(leadNotifyChannel !== undefined && { leadNotifyChannel }),
      },
    });
  }

  async deleteNotification(userId: string, notificationId: string) {
    const notif = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notif || notif.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.delete({
      where: { id: notificationId },
    });
  }

  async deleteAllNotifications(userId: string) {
    return this.prisma.notification.deleteMany({
      where: { userId },
    });
  }

  async linkTelegramAccount(token: string, chatId: string) {
    const connectToken = await this.prisma.telegramConnectToken.findUnique({
      where: { token },
    });

    if (!connectToken || connectToken.expiresAt < new Date()) {
      return false;
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: connectToken.userId },
        data: { telegramChatId: chatId },
      }),
      this.prisma.telegramConnectToken.delete({
        where: { id: connectToken.id },
      }),
    ]);

    return true;
  }
}
