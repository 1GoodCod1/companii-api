import type { PortalInvitation, Prisma } from '@prisma/client';

export const PORTAL_INVITATION_REPOSITORY = Symbol('PortalInvitationRepository');

export type PortalInvitationWithCustomer = PortalInvitation & {
  customer: {
    fullName: string;
    phone: string | null;
    email: string | null;
    company: { name: string };
  };
};

export interface PortalInvitationRepository {
  createInvitationAndExpirePending(
    customerId: string,
    token: string,
    expiresAt: Date,
  ): Promise<PortalInvitationWithCustomer>;
}
