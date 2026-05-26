import type { PrismaService } from '../../modules/shared/database/prisma.service';
import { normalizePhone } from './phone.util';

export async function findLeadsForEndClient(prisma: PrismaService, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true },
  });
  if (!user?.phone) return [];

  const phone = normalizePhone(user.phone) ?? user.phone.trim();

  return prisma.companyLead.findMany({
    where: {
      OR: [
        { customer: { portalUserId: userId } },
        { contactPhone: phone },
        { customer: { phone } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      company: { select: { id: true, name: true, slug: true } },
      category: { select: { id: true, name: true, slug: true } },
    },
  });
}
