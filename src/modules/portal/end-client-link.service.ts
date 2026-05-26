import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../common/errors';
import { RLS_SYSTEM_CONTEXT } from '../../common/rls/rls-system.util';
import { normalizePhone, phoneVariants, phonesMatch, splitFullName } from '../../common/utils/phone.util';
import { timingSafeStringEquals } from '../../common/utils/timing-safe.util';
import { PrismaService } from '../shared/database/prisma.service';

export const CURRENT_TERMS_VERSION = '2026-05-25';

@Injectable()
export class EndClientLinkService {
  constructor(private readonly prisma: PrismaService) {}

  async acceptInviteToken(token: string, userId: string) {
    return this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async () => {
      const invite = await this.prisma.portalInvitation.findUnique({
        where: { token },
        include: { customer: true },
      });

      if (
        !invite ||
        invite.status !== 'PENDING' ||
        invite.expiresAt < new Date() ||
        !timingSafeStringEquals(invite.token, token)
      ) {
        throw AppErrors.notFound(AppErrorMessages.PORTAL_INVITE_INVALID);
      }

      const existingLink = await this.prisma.companyCustomer.findUnique({
        where: { portalUserId: userId },
      });
      if (existingLink && existingLink.id !== invite.customerId) {
        throw AppErrors.conflict(AppErrorMessages.PORTAL_ALREADY_LINKED);
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.companyCustomer.update({
          where: { id: invite.customerId },
          data: { portalUserId: userId },
        });
        await tx.portalInvitation.update({
          where: { id: invite.id },
          data: { status: 'ACCEPTED' },
        });
      });

      return invite.customer;
    });
  }

  async previewInvite(token: string) {
    return this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async () => {
      const invite = await this.prisma.portalInvitation.findUnique({
        where: { token },
        include: {
          customer: {
            select: {
              fullName: true,
              phone: true,
              email: true,
              portalUserId: true,
              company: { select: { name: true, slug: true } },
            },
          },
        },
      });

      if (!invite || invite.status !== 'PENDING' || invite.expiresAt < new Date()) {
        throw AppErrors.notFound(AppErrorMessages.PORTAL_INVITE_INVALID);
      }

      return {
        token: invite.token,
        expiresAt: invite.expiresAt,
        customerName: invite.customer.fullName,
        customerPhone: invite.customer.phone,
        customerEmail: invite.customer.email,
        companyName: invite.customer.company.name,
        companySlug: invite.customer.company.slug,
        alreadyLinked: !!invite.customer.portalUserId,
        ...splitFullName(invite.customer.fullName),
      };
    });
  }

  async resolveRegistrationFromInvite(dto: {
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    portalInviteToken: string;
  }) {
    return this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async () => {
      const invite = await this.prisma.portalInvitation.findUnique({
        where: { token: dto.portalInviteToken },
        include: { customer: true },
      });

      if (!invite || invite.status !== 'PENDING' || invite.expiresAt < new Date()) {
        throw AppErrors.notFound(AppErrorMessages.PORTAL_INVITE_INVALID);
      }

      if (invite.customer.portalUserId) {
        throw AppErrors.conflict(AppErrorMessages.PORTAL_ALREADY_LINKED);
      }

      const customerPhone = normalizePhone(invite.customer.phone);
      if (!customerPhone) {
        throw AppErrors.badRequest(AppErrorMessages.VALIDATION_FAILED);
      }

      const customerEmail = invite.customer.email?.trim().toLowerCase();
      const email = (customerEmail || dto.email)?.trim().toLowerCase();
      if (!email) {
        throw AppErrors.badRequest(AppErrorMessages.AUTH_INVITE_EMAIL_REQUIRED);
      }

      const fromName = splitFullName(invite.customer.fullName);

      return {
        email,
        phone: customerPhone,
        firstName: dto.firstName?.trim() || fromName.firstName || undefined,
        lastName: dto.lastName?.trim() || fromName.lastName || undefined,
        portalInviteToken: dto.portalInviteToken,
      };
    });
  }

  async linkByContact(userId: string, contact: { phone?: string; email?: string }) {
    return this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async () => {
        const normalizedPhone = normalizePhone(contact.phone);
        const email = contact.email?.trim().toLowerCase();

        const existingLink = await this.prisma.companyCustomer.findUnique({
          where: { portalUserId: userId },
        });
        if (existingLink) return existingLink;

        const phoneCandidates = phoneVariants(normalizedPhone);
        const orFilters: Array<Record<string, unknown>> = [];

        if (email) {
          orFilters.push({ email: { equals: email, mode: 'insensitive' } });
        }
        for (const variant of phoneCandidates) {
          orFilters.push({ phone: variant });
        }

        if (orFilters.length === 0) return null;

        const matches = await this.prisma.companyCustomer.findMany({
          where: {
            portalUserId: null,
            OR: orFilters,
          },
          orderBy: { updatedAt: 'desc' },
        });

        const uniqueMatches = matches.filter((candidate, index, list) => {
          return list.findIndex((item) => item.id === candidate.id) === index;
        });

        const verified = uniqueMatches.filter((candidate) => {
          const emailOk = email && candidate.email?.toLowerCase() === email;
          const phoneOk = normalizedPhone ? phonesMatch(candidate.phone, normalizedPhone) : false;
          return emailOk || phoneOk;
        });

        if (verified.length !== 1) return null;

        return this.prisma.companyCustomer.update({
          where: { id: verified[0].id },
          data: { portalUserId: userId },
        });
    });
  }
}
