import type { CompanyLeadSource, Prisma } from '@prisma/client';
import { normalizePhone } from '../../../common/utils/phone.util';

export type PublicLeadContactInput = {
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  address?: string;
  message?: string;
  notes?: string;
};

export type PublicLeadCreateInput = PublicLeadContactInput & {
  companyId: string;
  source: CompanyLeadSource;
  categoryId?: string;
  serviceTitle?: string;
  estimatedBudget?: number;
  scheduledAt?: Date;
};

export async function ensureCompanyCustomerFromContact(
  tx: Prisma.TransactionClient,
  companyId: string,
  contact: PublicLeadContactInput,
  options?: { portalUserId?: string },
): Promise<{ customerId: string; created: boolean }> {
  const phone = normalizePhone(contact.contactPhone) ?? contact.contactPhone.trim();
  const email = contact.contactEmail?.trim().toLowerCase();

  const existing = await tx.companyCustomer.findFirst({
    where: { companyId, phone },
    orderBy: { updatedAt: 'desc' },
  });

  if (existing) {
    const updates: Prisma.CompanyCustomerUpdateInput = {};
    if (email && !existing.email) updates.email = email;
    if (contact.address?.trim() && (!existing.address || existing.address === existing.fullName)) {
      updates.address = contact.address.trim();
    }
    if (options?.portalUserId && !existing.portalUserId) {
      const linkedInCompany = await tx.companyCustomer.findUnique({
        where: {
          companyId_portalUserId: { companyId, portalUserId: options.portalUserId },
        },
        select: { id: true },
      });
      if (!linkedInCompany) {
        updates.portalUser = { connect: { id: options.portalUserId } };
      }
    }
    if (Object.keys(updates).length > 0) {
      await tx.companyCustomer.update({ where: { id: existing.id }, data: updates });
    }
    return { customerId: existing.id, created: false };
  }

  let portalUserId: string | undefined;
  if (options?.portalUserId) {
    const linkedInCompany = await tx.companyCustomer.findUnique({
      where: {
        companyId_portalUserId: { companyId, portalUserId: options.portalUserId },
      },
      select: { id: true },
    });
    if (!linkedInCompany) portalUserId = options.portalUserId;
  }

  const customer = await tx.companyCustomer.create({
    data: {
      companyId,
      fullName: contact.contactName.trim(),
      phone,
      email,
      address: contact.address?.trim() || contact.contactName.trim(),
      notes: contact.notes?.trim(),
      portalUserId,
    },
  });

  return { customerId: customer.id, created: true };
}

export async function createPublicCompanyLead(
  tx: Prisma.TransactionClient,
  input: PublicLeadCreateInput,
  options?: { portalUserId?: string },
) {
  const phone = normalizePhone(input.contactPhone) ?? input.contactPhone.trim();
  const { customerId, created: customerCreated } = await ensureCompanyCustomerFromContact(
    tx,
    input.companyId,
    {
      contactName: input.contactName,
      contactPhone: phone,
      contactEmail: input.contactEmail,
      address: input.address,
      notes: input.notes,
    },
    options,
  );

  const lead = await tx.companyLead.create({
    data: {
      companyId: input.companyId,
      customerId,
      contactName: input.contactName.trim(),
      contactPhone: phone,
      contactEmail: input.contactEmail?.trim().toLowerCase(),
      message: input.message?.trim(),
      address: input.address?.trim(),
      source: input.source,
      categoryId: input.categoryId,
      serviceTitle: input.serviceTitle?.trim(),
      estimatedBudget: input.estimatedBudget,
      scheduledAt: input.scheduledAt,
      status: 'NEW',
    },
  });

  return { lead, customerId, customerCreated };
}
