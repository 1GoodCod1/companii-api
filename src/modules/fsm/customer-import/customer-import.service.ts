import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { normalizePhone, phonesMatch } from '../../../common/utils/phone.util';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import {
  CUSTOMER_IMPORT_MAX_ROWS,
} from './customer-import.constants';
import {
  isDuplicatePhoneInFile,
  isValidEmail,
  parseCustomerImportFile,
} from './customer-import.parser';
import { buildCustomerImportTemplate } from './customer-import.template';
import type {
  CustomerImportConfirmResult,
  CustomerImportConfirmRow,
  CustomerImportPreviewResult,
  CustomerImportPreviewRow,
  ParsedCustomerImportRow,
} from './customer-import.types';

@Injectable()
export class CustomerImportService {
  constructor(private readonly prisma: PrismaService) {}

  private companyId(user: JwtPayload) {
    if (!user.activeCompanyId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_CONTEXT_REQUIRED);
    }
    return user.activeCompanyId;
  }

  async getTemplate(format: 'xlsx' | 'csv') {
    return await buildCustomerImportTemplate(format);
  }

  async previewFromFile(
    user: JwtPayload,
    buffer: Buffer,
    filename: string,
  ): Promise<CustomerImportPreviewResult> {
    const companyId = this.companyId(user);
    const parsed = await parseCustomerImportFile(buffer, filename);

    if (parsed.length === 0) {
      throw AppErrors.badRequest('Fișierul nu conține rânduri de import.');
    }
    if (parsed.length > CUSTOMER_IMPORT_MAX_ROWS) {
      throw AppErrors.badRequest(`Maximum ${CUSTOMER_IMPORT_MAX_ROWS} clienți per import.`);
    }

    const existingCustomers = await this.prisma.companyCustomer.findMany({
      where: { companyId },
      select: { id: true, phone: true },
    });

    const rows: CustomerImportPreviewRow[] = parsed.map((row) =>
      this.classifyRow(row, parsed, existingCustomers),
    );

    return {
      rows,
      summary: this.summarize(rows),
    };
  }

  async confirmImport(
    user: JwtPayload,
    rows: CustomerImportConfirmRow[],
  ): Promise<CustomerImportConfirmResult> {
    const companyId = this.companyId(user);
    if (!rows.length) {
      throw AppErrors.badRequest('Nu există rânduri de importat.');
    }
    if (rows.length > CUSTOMER_IMPORT_MAX_ROWS) {
      throw AppErrors.badRequest(`Maximum ${CUSTOMER_IMPORT_MAX_ROWS} clienți per import.`);
    }

    const customerIds: string[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        if (row.action !== 'create' && row.action !== 'update') {
          skipped += 1;
          continue;
        }

        const phone = normalizePhone(row.phone) ?? row.phone.trim();
        if (!row.fullName.trim() || !phone || !row.address.trim()) {
          skipped += 1;
          continue;
        }
        if (!isValidEmail(row.email)) {
          skipped += 1;
          continue;
        }

        const existing = await tx.companyCustomer.findFirst({
          where: { companyId, phone },
        });

        if (row.action === 'create' && existing) {
          skipped += 1;
          continue;
        }

        if (row.action === 'update') {
          const target =
            existing ??
            (row.existingCustomerId
              ? await tx.companyCustomer.findFirst({
                  where: { id: row.existingCustomerId, companyId },
                })
              : null);
          if (!target) {
            skipped += 1;
            continue;
          }

          const saved = await tx.companyCustomer.update({
            where: { id: target.id },
            data: {
              fullName: row.fullName.trim(),
              phone,
              email: row.email?.trim().toLowerCase() || target.email,
              address: row.address.trim(),
              notes: row.notes?.trim() || target.notes,
            },
          });
          customerIds.push(saved.id);
          updated += 1;
          continue;
        }

        const saved = await tx.companyCustomer.create({
          data: {
            companyId,
            fullName: row.fullName.trim(),
            phone,
            email: row.email?.trim().toLowerCase(),
            address: row.address.trim(),
            notes: row.notes?.trim(),
          },
        });
        customerIds.push(saved.id);
        created += 1;
      }
    });

    return { created, updated, skipped, customerIds };
  }

  private classifyRow(
    row: ParsedCustomerImportRow,
    allRows: ParsedCustomerImportRow[],
    existingCustomers: Array<{ id: string; phone: string }>,
  ): CustomerImportPreviewRow {
    if (!row.fullName.trim()) {
      return { ...row, action: 'error', reason: 'Lipsește numele complet' };
    }
    if (!row.phone.trim()) {
      return { ...row, action: 'error', reason: 'Lipsește telefonul' };
    }
    if (!row.address.trim()) {
      return { ...row, action: 'error', reason: 'Lipsește adresa' };
    }

    const normalizedPhone = normalizePhone(row.phone);
    if (!normalizedPhone) {
      return { ...row, action: 'error', reason: 'Telefon invalid' };
    }
    if (!isValidEmail(row.email)) {
      return { ...row, action: 'error', reason: 'Email invalid' };
    }
    if (isDuplicatePhoneInFile(allRows, normalizedPhone, row.rowNumber)) {
      return { ...row, action: 'skip', reason: 'Telefon duplicat în fișier' };
    }

    const existing = existingCustomers.find((customer) =>
      phonesMatch(customer.phone, normalizedPhone),
    );

    if (existing) {
      return {
        ...row,
        phone: normalizedPhone,
        action: 'update',
        reason: 'Client existent — datele vor fi actualizate',
        existingCustomerId: existing.id,
      };
    }

    return {
      ...row,
      phone: normalizedPhone,
      action: 'create',
    };
  }

  private summarize(rows: CustomerImportPreviewRow[]) {
    return {
      total: rows.length,
      create: rows.filter((row) => row.action === 'create').length,
      update: rows.filter((row) => row.action === 'update').length,
      skip: rows.filter((row) => row.action === 'skip').length,
      error: rows.filter((row) => row.action === 'error').length,
    };
  }
}
