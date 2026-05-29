import { InvoicesService } from './invoices.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let prisma: any;
  let ctx: any;
  let queries: any;
  let pdfCache: any;
  let lifecycle: any;
  let email: any;

  beforeEach(() => {
    prisma = {
      companyInvoice: {
        findFirst: jest.fn(),
      },
    };
    ctx = {
      companyId: jest.fn().mockReturnValue('company-123'),
    };
    queries = {
      list: jest.fn(),
      get: jest.fn(),
      exportCsv: jest.fn(),
    };
    pdfCache = {
      getPdf: jest.fn(),
    };
    lifecycle = {
      create: jest.fn(),
      update: jest.fn(),
      cancel: jest.fn(),
      recordPayment: jest.fn(),
      delete: jest.fn(),
    };
    email = {
      sendInvoiceEmail: jest.fn(),
    };

    service = new InvoicesService(prisma, ctx, queries, pdfCache, lifecycle, email);
  });

  const mockUser: JwtPayload = {
    sub: 'user-123',
    email: 'staff@test.com',
    accountKind: 'COMPANY_STAFF',
    activeCompanyId: 'company-123',
  };

  it('delegates list to queries service', async () => {
    await service.list(mockUser, 'cursor-123', 10, 'UNPAID' as any);
    expect(queries.list).toHaveBeenCalledWith(mockUser, 'cursor-123', 10, 'UNPAID');
  });

  it('delegates get to queries service', async () => {
    await service.get(mockUser, 'inv-123');
    expect(queries.get).toHaveBeenCalledWith(mockUser, 'inv-123');
  });

  it('delegates create to lifecycle service', async () => {
    const data = { interventionId: 'inter-123', tvaRate: 20 };
    await service.create(mockUser, data);
    expect(lifecycle.create).toHaveBeenCalledWith(mockUser, data);
  });

  it('delegates update to lifecycle service', async () => {
    const data = { paymentStatus: 'PAID' as any };
    await service.update(mockUser, 'inv-123', data);
    expect(lifecycle.update).toHaveBeenCalledWith(mockUser, 'inv-123', data);
  });

  it('delegates cancel to lifecycle service', async () => {
    await service.cancel(mockUser, 'inv-123', 'clerical error');
    expect(lifecycle.cancel).toHaveBeenCalledWith(mockUser, 'inv-123', 'clerical error');
  });

  it('delegates recordPayment to lifecycle service', async () => {
    const data = { amount: 100, note: 'Partial cash' };
    await service.recordPayment(mockUser, 'inv-123', data);
    expect(lifecycle.recordPayment).toHaveBeenCalledWith(mockUser, 'inv-123', data);
  });

  it('delegates delete to lifecycle service', async () => {
    await service.delete(mockUser, 'inv-123');
    expect(lifecycle.delete).toHaveBeenCalledWith(mockUser, 'inv-123');
  });

  it('delegates getPdf to pdfCache service', async () => {
    await service.getPdf(mockUser, 'inv-123');
    expect(pdfCache.getPdf).toHaveBeenCalledWith(mockUser, 'inv-123');
  });

  it('delegates exportCsv to queries service', async () => {
    await service.exportCsv(mockUser);
    expect(queries.exportCsv).toHaveBeenCalledWith(mockUser);
  });

  it('handles sendByEmail successfully', async () => {
    const mockInvoice = {
      id: 'inv-123',
      number: 'INV-001',
      amount: 100,
      tvaAmount: 20,
      dueDate: new Date('2026-06-30'),
      paymentStatus: 'UNPAID' as any,
      company: { name: 'Test Company' },
      intervention: { customer: { email: 'client@test.com' } },
    };
    prisma.companyInvoice.findFirst.mockResolvedValue(mockInvoice);
    pdfCache.getPdf.mockResolvedValue({ buffer: Buffer.from('PDF_CONTENT'), filename: 'INV-001.pdf' });
    email.sendInvoiceEmail.mockResolvedValue(true);

    const result = await service.sendByEmail(mockUser, 'inv-123', 'Here is your invoice');

    expect(prisma.companyInvoice.findFirst).toHaveBeenCalled();
    expect(pdfCache.getPdf).toHaveBeenCalledWith(mockUser, 'inv-123');
    expect(email.sendInvoiceEmail).toHaveBeenCalledWith({
      to: 'client@test.com',
      companyName: 'Test Company',
      invoiceNumber: 'INV-001',
      total: 120,
      dueDate: '2026-06-30',
      paymentStatus: 'UNPAID',
      customMessage: 'Here is your invoice',
      pdfBuffer: expect.any(Buffer),
    });
    expect(result).toEqual({ sent: true, recipient: 'client@test.com' });
  });
});
