import { Injectable } from '@nestjs/common';
import { AccountKind } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../types/jwt-payload';
import { rlsContextFromUserId } from '../../../common/rls/rls-context.util';

@Injectable()
export class AuthJwtPayloadService {
  constructor(private readonly prisma: PrismaService) {}

  buildPayload(user: {
    id: string;
    email: string;
    accountKind: AccountKind;
  }): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
      accountKind: user.accountKind,
    };
  }

  async enrichPayload(
    payload: JwtPayload,
    options?: { preferredCompanyId?: string },
  ): Promise<JwtPayload> {
    const base: JwtPayload = { ...payload };
    return await this.prisma.withRlsContext(
      rlsContextFromUserId(base.sub, base.accountKind, {
        companyId: options?.preferredCompanyId ?? base.activeCompanyId,
      }),
      async () => {
        if (base.accountKind === 'END_CLIENT') {
          const customer = await this.prisma.companyCustomer.findUnique({
            where: { portalUserId: base.sub },
            select: { id: true, companyId: true },
          });
          if (customer) {
            return {
              ...base,
              customerId: customer.id,
              activeCompanyId: customer.companyId,
            };
          }
          return base;
        }

        return this.enrichCompanyMember(base, options?.preferredCompanyId);
      },
    );
  }

  private async enrichCompanyMember(
    payload: JwtPayload,
    preferredCompanyIdHint?: string,
  ): Promise<JwtPayload> {
    const userId = payload.sub;
    const preferredCompanyId =
      preferredCompanyIdHint ?? payload.activeCompanyId ?? '';

    if (preferredCompanyId) {
      const preferredMembership = await this.prisma.companyMember.findFirst({
        where: {
          userId,
          companyId: preferredCompanyId,
          status: 'ACTIVE',
        },
        select: { id: true, companyId: true, role: true },
      });
      if (preferredMembership) {
        return {
          ...payload,
          activeCompanyId: preferredMembership.companyId,
          memberId: preferredMembership.id,
          companyRole: preferredMembership.role,
        };
      }

      const preferredOwned = await this.prisma.company.findFirst({
        where: { id: preferredCompanyId, ownerUserId: userId },
        select: { id: true },
      });
      if (preferredOwned) {
        return this.enrichOwnedCompany(payload, preferredOwned.id, userId);
      }
    }

    const firstMembership = await this.prisma.companyMember.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, companyId: true, role: true },
    });
    if (firstMembership) {
      return {
        ...payload,
        activeCompanyId: firstMembership.companyId,
        memberId: firstMembership.id,
        companyRole: firstMembership.role,
      };
    }

    const firstOwned = await this.prisma.company.findFirst({
      where: { ownerUserId: userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (firstOwned) {
      return this.enrichOwnedCompany(payload, firstOwned.id, userId);
    }

    return payload;
  }

  private async enrichOwnedCompany(
    payload: JwtPayload,
    companyId: string,
    userId: string,
  ): Promise<JwtPayload> {
    const ownerMembership = await this.prisma.companyMember.findFirst({
      where: { companyId, userId, status: 'ACTIVE' },
      select: { id: true, role: true },
    });

    return {
      ...payload,
      activeCompanyId: companyId,
      memberId: ownerMembership?.id ?? payload.memberId,
      companyRole: ownerMembership?.role ?? 'OWNER',
    };
  }
}
