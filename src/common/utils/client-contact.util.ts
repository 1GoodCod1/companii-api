import { AccountKind } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../errors';
import { normalizePhone } from './phone.util';
import type { PrismaService } from '../../modules/shared/database/prisma.service';

export type ResolvedClientContact = {
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  portalUserId: string;
};

export async function resolveClientContactFromUser(
  prisma: PrismaService,
  userId: string,
  accountKind: AccountKind,
): Promise<ResolvedClientContact> {
  if (accountKind !== 'END_CLIENT') {
    throw AppErrors.forbidden(AppErrorMessages.CLIENT_REQUEST_END_CLIENT_ONLY);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      portalCustomers: { select: { fullName: true }, take: 1 },
    },
  });
  if (!user) throw AppErrors.unauthorized(AppErrorMessages.AUTH_UNAUTHORIZED);

  const phone = user.phone?.trim();
  if (!phone) {
    throw AppErrors.badRequest(AppErrorMessages.CLIENT_PHONE_REQUIRED);
  }

  const normalizedPhone = normalizePhone(phone) ?? phone;
  const profileName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  const contactName =
    user.portalCustomers[0]?.fullName?.trim() ||
    profileName ||
    user.email.split('@')[0] ||
    'Client';

  return {
    contactName,
    contactPhone: normalizedPhone,
    contactEmail: user.email.toLowerCase(),
    portalUserId: user.id,
  };
}
