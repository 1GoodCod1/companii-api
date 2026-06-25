import { NotificationCategory, NotificationType } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationsSenderService } from '../../notifications/services/notifications-sender.service';

interface PortalClientTarget {
  customerId?: string | null;
  interventionId?: string | null;
}

interface PortalClientNotification {
  title: string;
  message: string;
  category: NotificationCategory;
  link: string;
  i18nKey?: string;
  params?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export async function notifyPortalClient(
  prisma: PrismaService,
  notifications: NotificationsSenderService,
  target: PortalClientTarget,
  payload: PortalClientNotification,
): Promise<void> {
  try {
    let portalUserId: string | null | undefined;

    if (target.customerId) {
      const customer = await prisma.companyCustomer.findUnique({
        where: { id: target.customerId },
        select: { portalUserId: true },
      });
      portalUserId = customer?.portalUserId;
    } else if (target.interventionId) {
      const intervention = await prisma.intervention.findUnique({
        where: { id: target.interventionId },
        select: { customer: { select: { portalUserId: true } } },
      });
      portalUserId = intervention?.customer?.portalUserId;
    }

    if (!portalUserId) return;

    await notifications.send({
      userId: portalUserId,
      title: payload.title,
      message: payload.message,
      type: NotificationType.IN_APP,
      category: payload.category,
      metadata: {
        link: payload.link,
        ...(payload.i18nKey ? { i18nKey: payload.i18nKey, params: payload.params ?? {} } : {}),
        ...(payload.meta ?? {}),
      },
    });
  } catch {
    // Non-fatal — the originating change already persisted.
  }
}
