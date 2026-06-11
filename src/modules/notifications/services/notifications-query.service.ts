import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import type { NotificationCategory, NotificationType, Prisma } from '@prisma/client';

@Injectable()
export class NotificationsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserNotifications(
    userId: string,
    options: {
      limit?: number;
      unreadOnly?: boolean;
      category?: NotificationCategory;
      type?: NotificationType;
    },
  ) {
    const { limit = 50, unreadOnly, category, type } = options;

    const baseWhere: Prisma.NotificationWhereInput = { userId };
    if (unreadOnly) {
      baseWhere.readAt = null;
    }
    if (category) {
      baseWhere.category = category;
    }
    if (type) {
      baseWhere.type = type;
    }

    const rawNotifications = await this.prisma.notification.findMany({
      where: baseWhere,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rawNotifications;
  }

  async getUnreadCount(userId: string) {
    const total = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });

    // In a simple app, returning total count is usually enough.
    // We can group by category later if needed.
    return { count: total };
  }
}
