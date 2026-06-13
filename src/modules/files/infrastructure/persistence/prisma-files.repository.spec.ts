import { PrismaFilesRepository } from './prisma-files.repository';

type Found = { id: string } | null;

function buildPrismaMock(matches: {
  line?: Found;
  receipt?: Found;
  invoice?: Found;
  photo?: Found;
}) {
  const db = {
    estimateLine: { findFirst: jest.fn().mockResolvedValue(matches.line ?? null) },
    estimateReceipt: { findFirst: jest.fn().mockResolvedValue(matches.receipt ?? null) },
    companyInvoice: { findFirst: jest.fn().mockResolvedValue(matches.invoice ?? null) },
    interventionPhoto: { findFirst: jest.fn().mockResolvedValue(matches.photo ?? null) },
  };
  const prisma = {
    runOutsideRlsContext: <T>(work: () => Promise<T>) => work(),
    withRlsContext: <T>(_ctx: unknown, work: (tx: typeof db) => Promise<T>) => work(db),
  };
  return { prisma, db };
}

describe('PrismaFilesRepository.canAccessFile', () => {
  const FILE = 'file-1';
  const COMPANY = 'company-1';
  const USER = 'user-1';

  it('grants access to an estimate-line receipt', async () => {
    const { prisma } = buildPrismaMock({ line: { id: 'l1' } });
    const repo = new PrismaFilesRepository(prisma as never);
    await expect(repo.canAccessFile(FILE, COMPANY, USER)).resolves.toBe(true);
  });

  it('grants access to a late-added estimate receipt', async () => {
    const { prisma } = buildPrismaMock({ receipt: { id: 'r1' } });
    const repo = new PrismaFilesRepository(prisma as never);
    await expect(repo.canAccessFile(FILE, COMPANY, USER)).resolves.toBe(true);
  });

  it('grants access to an invoice payment proof (manager + client paths)', async () => {
    const { prisma } = buildPrismaMock({ invoice: { id: 'i1' } });
    const repo = new PrismaFilesRepository(prisma as never);
    await expect(repo.canAccessFile(FILE, COMPANY, USER)).resolves.toBe(true);
  });

  it('grants access to an intervention photo', async () => {
    const { prisma } = buildPrismaMock({ photo: { id: 'p1' } });
    const repo = new PrismaFilesRepository(prisma as never);
    await expect(repo.canAccessFile(FILE, COMPANY, USER)).resolves.toBe(true);
  });

  it('denies access when the file is attached to nothing the caller owns', async () => {
    const { prisma } = buildPrismaMock({});
    const repo = new PrismaFilesRepository(prisma as never);
    await expect(repo.canAccessFile(FILE, COMPANY, USER)).resolves.toBe(false);
  });

  it('scopes by portal user when there is no company context (END_CLIENT)', async () => {
    const { prisma, db } = buildPrismaMock({ line: { id: 'l1' } });
    const repo = new PrismaFilesRepository(prisma as never);
    await repo.canAccessFile(FILE, null, USER);
    const where = db.estimateLine.findFirst.mock.calls[0][0].where;
    expect(where.stage.project.OR).toEqual([{ customer: { portalUserId: USER } }]);
  });
});
