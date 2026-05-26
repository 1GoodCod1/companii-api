import { Injectable } from '@nestjs/common';
import { AccountKind, CompanyRole } from '@prisma/client';
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
    // Treat the input as read-only so callers can rely on referential
    // equality and tests don't see surprise mutations. All enrichment
    // returns a fresh object built from the original.
    const base: JwtPayload = { ...payload };
    return this.prisma.withRlsContext(
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

    const rows = await this.prisma.$queryRaw<
      Array<{
        company_id: string;
        member_id: string | null;
        company_role: CompanyRole | null;
        is_owner: boolean;
      }>
    >`
      WITH
      preferred_membership AS (
        SELECT cm.id AS member_id, cm.company_id, cm.role AS company_role, 0 AS priority
        FROM "CompanyMember" cm
        WHERE cm."userId" = ${userId}
          AND cm.status = 'ACTIVE'
          AND cm."companyId" = ${preferredCompanyId}
          AND ${preferredCompanyId} <> ''
        LIMIT 1
      ),
      preferred_owned AS (
        SELECT NULL::text AS member_id, c.id AS company_id, NULL::"CompanyRole" AS company_role, 1 AS priority
        FROM "Company" c
        WHERE c.id = ${preferredCompanyId}
          AND c."ownerUserId" = ${userId}
          AND ${preferredCompanyId} <> ''
          AND NOT EXISTS (SELECT 1 FROM preferred_membership)
        LIMIT 1
      ),
      first_membership AS (
        SELECT cm.id AS member_id, cm."companyId" AS company_id, cm.role AS company_role, 2 AS priority
        FROM "CompanyMember" cm
        WHERE cm."userId" = ${userId}
          AND cm.status = 'ACTIVE'
          AND NOT EXISTS (SELECT 1 FROM preferred_membership)
          AND NOT EXISTS (SELECT 1 FROM preferred_owned)
        ORDER BY cm."createdAt" ASC
        LIMIT 1
      ),
      first_owned AS (
        SELECT NULL::text AS member_id, c.id AS company_id, NULL::"CompanyRole" AS company_role, 3 AS priority
        FROM "Company" c
        WHERE c."ownerUserId" = ${userId}
          AND NOT EXISTS (SELECT 1 FROM preferred_membership)
          AND NOT EXISTS (SELECT 1 FROM preferred_owned)
          AND NOT EXISTS (SELECT 1 FROM first_membership)
        ORDER BY c."createdAt" ASC
        LIMIT 1
      ),
      combined AS (
        SELECT * FROM preferred_membership
        UNION ALL SELECT * FROM preferred_owned
        UNION ALL SELECT * FROM first_membership
        UNION ALL SELECT * FROM first_owned
      )
      SELECT
        company_id,
        member_id,
        company_role,
        (member_id IS NULL) AS is_owner
      FROM combined
      ORDER BY priority ASC
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) return payload;

    let memberId: string | undefined = row.member_id ?? payload.memberId;
    let companyRole: CompanyRole = row.company_role ?? 'OWNER';
    if (!row.member_id && row.is_owner) {
      const ownerMembership = await this.prisma.companyMember.findFirst({
        where: { companyId: row.company_id, userId, status: 'ACTIVE' },
        select: { id: true, role: true },
      });
      if (ownerMembership) {
        memberId = ownerMembership.id;
        companyRole = ownerMembership.role;
      }
    }

    return {
      ...payload,
      activeCompanyId: row.company_id,
      memberId,
      companyRole,
    };
  }
}
