import { AppErrorMessages, AppErrors } from '../errors';
import type { PrismaService } from '../../modules/shared/database/prisma.service';

export async function findPortalCustomerForUser(prisma: PrismaService, userId: string) {
  const customer = await prisma.companyCustomer.findFirst({
    where: { portalUserId: userId },
  });
  if (!customer) throw AppErrors.notFound(AppErrorMessages.PORTAL_NOT_LINKED);
  return customer;
}
