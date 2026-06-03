import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/shared/database/prisma.service';

const describeE2e = process.env.DATABASE_URL ? describe : describe.skip;

describeE2e('Row-Level Security (RLS) SQL-Driver Smoke Test', () => {
  let prisma: PrismaService;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    // Override DATABASE_URL in smoke test to connect as companii_app
    const originalUrl = process.env.DATABASE_URL;
    const runtimeUrl = process.env.DATABASE_URL?.replace('postgres:companii', 'companii_app:companii_app_pass');
    if (runtimeUrl) {
      process.env.DATABASE_URL = runtimeUrl;
    }

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    if (originalUrl) {
      process.env.DATABASE_URL = originalUrl;
    }
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('enforces RLS at database connection level (companii_app non-superuser role)', async () => {
    // 1. Verify that we are indeed connected under the companii_app role
    // and that it is not a PostgreSQL superuser.
    const [dbUserRes]: any[] = await prisma.$queryRawUnsafe(
      `SELECT current_user, usesuper FROM pg_user WHERE usename = current_user`
    );
    
    console.log('Connected database user in runtime is:', dbUserRes);
    expect(dbUserRes.current_user).toBe('companii_app');
    expect(dbUserRes.usesuper).toBe(false);

    // 2. Setup testing data under PLATFORM_ADMIN bypass context
    const { companyA, companyB, projectA, projectB, customerA, customerB } = await prisma.withRlsContext({
      userId: 'system',
      accountKind: 'PLATFORM_ADMIN',
    }, async (tx) => {
      const city = await tx.city.findFirst();
      if (!city) throw new Error('No city found in seeded database');

      const adminUser = await tx.user.findFirst({
        where: { accountKind: 'PLATFORM_ADMIN' },
      });
      if (!adminUser) throw new Error('No admin user found in seeded database');

      const companyA = await tx.company.create({
        data: {
          slug: `rls-test-company-a-${Date.now()}`,
          name: 'Company A RLS Test',
          legalName: 'Company A SRL',
          idno: String(Date.now() + 1).padStart(13, '0').slice(-13),
          legalAddress: 'Str. Test A',
          ownerUserId: adminUser.id,
          cityId: city.id,
        },
      });

      const companyB = await tx.company.create({
        data: {
          slug: `rls-test-company-b-${Date.now()}`,
          name: 'Company B RLS Test',
          legalName: 'Company B SRL',
          idno: String(Date.now() + 2).padStart(13, '0').slice(-13),
          legalAddress: 'Str. Test B',
          ownerUserId: adminUser.id,
          cityId: city.id,
        },
      });

      const category = await tx.category.findFirst();
      if (!category) throw new Error('No category found in seeded database');

      const customerA = await tx.companyCustomer.create({
        data: {
          companyId: companyA.id,
          fullName: 'Customer RLS A',
          phone: '+37368000001',
          address: 'Chisinau MD A',
        },
      });

      const customerB = await tx.companyCustomer.create({
        data: {
          companyId: companyB.id,
          fullName: 'Customer RLS B',
          phone: '+37368000002',
          address: 'Chisinau MD B',
        },
      });

      const projectA = await tx.estimateProject.create({
        data: {
          companyId: companyA.id,
          customerId: customerA.id,
          categoryId: category.id,
          number: `EP-TEST-A-${Date.now()}`,
          title: 'Project in Company A',
          siteType: 'apartment',
          address: 'Test A',
        },
      });

      const projectB = await tx.estimateProject.create({
        data: {
          companyId: companyB.id,
          customerId: customerB.id,
          categoryId: category.id,
          number: `EP-TEST-B-${Date.now()}`,
          title: 'Project in Company B',
          siteType: 'house',
          address: 'Test B',
        },
      });

      return { companyA, companyB, projectA, projectB, customerA, customerB };
    });
    const allProjectsOutsideContext = await prisma.estimateProject.findMany({
      where: {
        id: { in: [projectA.id, projectB.id] },
      },
    });
    expect(allProjectsOutsideContext).toHaveLength(0);

    const projectsInContextA = await prisma.withRlsContext({
      userId: 'system',
      companyId: companyA.id,
      accountKind: 'COMPANY_STAFF',
    }, async (tx) => {
      return tx.estimateProject.findMany({
        where: {
          id: { in: [projectA.id, projectB.id] },
        },
      });
    });
    expect(projectsInContextA).toHaveLength(1);
    expect(projectsInContextA[0].id).toBe(projectA.id);

    // 5. POSITIVE VERIFICATION:
    // Query under Company B context must return ONLY Company B's project.
    const projectsInContextB = await prisma.withRlsContext({
      userId: 'system',
      companyId: companyB.id,
      accountKind: 'COMPANY_STAFF',
    }, async (tx) => {
      return tx.estimateProject.findMany({
        where: {
          id: { in: [projectA.id, projectB.id] },
        },
      });
    });
    expect(projectsInContextB).toHaveLength(1);
    expect(projectsInContextB[0].id).toBe(projectB.id);

    // 6. CLEANUP
    await prisma.withRlsContext({
      userId: 'system',
      accountKind: 'PLATFORM_ADMIN',
    }, async (tx) => {
      await tx.estimateProject.deleteMany({
        where: { id: { in: [projectA.id, projectB.id] } },
      });
      await tx.companyCustomer.deleteMany({
        where: { id: { in: [customerA.id, customerB.id] } },
      });
      await tx.company.deleteMany({
        where: { id: { in: [companyA.id, companyB.id] } },
      });
    });
  });

  it('scopes END_CLIENT portal access per-customer across companies (multi-company + IDOR)', async () => {
    const seed = await prisma.withRlsContext(
      { userId: 'system', accountKind: 'PLATFORM_ADMIN' },
      async (tx) => {
        const city = await tx.city.findFirstOrThrow();
        const category = await tx.category.findFirstOrThrow();
        const admin = await tx.user.findFirstOrThrow({ where: { accountKind: 'PLATFORM_ADMIN' } });
        const stamp = Date.now();

        const mkCompany = (n: string, i: number) =>
          tx.company.create({
            data: {
              slug: `rls-portal-${n}-${stamp}`,
              name: `Portal ${n}`,
              legalName: `Portal ${n} SRL`,
              idno: String(stamp + i).padStart(13, '0').slice(-13),
              legalAddress: 'Str. Test',
              ownerUserId: admin.id,
              cityId: city.id,
            },
          });
        const companyA = await mkCompany('A', 1);
        const companyB = await mkCompany('B', 2);

        // userMine is a customer of BOTH companies; userOther only of company B.
        const userMine = await tx.user.create({
          data: { email: `rls-mine-${stamp}@test.local`, accountKind: 'END_CLIENT' },
        });
        const userOther = await tx.user.create({
          data: { email: `rls-other-${stamp}@test.local`, accountKind: 'END_CLIENT' },
        });

        const mkCustomer = (companyId: string, portalUserId: string, p: string) =>
          tx.companyCustomer.create({
            data: { companyId, portalUserId, fullName: `C ${p}`, phone: `+3736800${p}`, address: 'MD' },
          });
        const custMineA = await mkCustomer(companyA.id, userMine.id, '11');
        const custMineB = await mkCustomer(companyB.id, userMine.id, '12');
        const custOtherB = await mkCustomer(companyB.id, userOther.id, '13');

        const mkProject = (companyId: string, customerId: string, p: string) =>
          tx.estimateProject.create({
            data: {
              companyId, customerId, categoryId: category.id,
              number: `EP-${p}-${stamp}`, title: `P ${p}`, siteType: 'apartment', address: 'T',
            },
          });
        const projMineA = await mkProject(companyA.id, custMineA.id, 'MA');
        const projMineB = await mkProject(companyB.id, custMineB.id, 'MB');
        const projOtherB = await mkProject(companyB.id, custOtherB.id, 'OB');

        const mkQuote = (companyId: string, customerId: string, p: string) =>
          tx.quote.create({
            data: { companyId, customerId, number: `Q-${p}-${stamp}`, total: 100, status: 'SENT' },
          });
        const quoteMineA = await mkQuote(companyA.id, custMineA.id, 'QMA');
        const quoteOtherB = await mkQuote(companyB.id, custOtherB.id, 'QOB');

        const mkInterv = (companyId: string, customerId: string, p: string) =>
          tx.intervention.create({
            data: { companyId, customerId, number: `I-${p}-${stamp}`, type: 'repair', description: 'x', address: 'y' },
          });
        const intMineA = await mkInterv(companyA.id, custMineA.id, 'IMA');
        const intOtherB = await mkInterv(companyB.id, custOtherB.id, 'IOB');

        const mkInvoice = (companyId: string, interventionId: string, p: string) =>
          tx.companyInvoice.create({
            data: { companyId, interventionId, number: `INV-${p}-${stamp}`, amount: 100, tvaAmount: 20, tvaRate: 20 },
          });
        const invMineA = await mkInvoice(companyA.id, intMineA.id, 'NVA');
        const invOtherB = await mkInvoice(companyB.id, intOtherB.id, 'NVB');

        return {
          companyA, companyB, userMine, userOther,
          custMineA, custMineB, custOtherB, projMineA, projMineB, projOtherB,
          quoteMineA, quoteOtherB, intMineA, intOtherB, invMineA, invOtherB,
        };
      },
    );

    // userMine (END_CLIENT, NO company context) sees their projects in BOTH companies...
    const mineProjects = await prisma.withRlsContext(
      { userId: seed.userMine.id, accountKind: 'END_CLIENT' },
      (tx) =>
        tx.estimateProject.findMany({
          where: { id: { in: [seed.projMineA.id, seed.projMineB.id, seed.projOtherB.id] } },
        }),
    );
    expect(mineProjects.map((p) => p.id).sort()).toEqual(
      [seed.projMineA.id, seed.projMineB.id].sort(),
    );
    // ...and NOT the other client's project (IDOR boundary at the DB level).
    expect(mineProjects.some((p) => p.id === seed.projOtherB.id)).toBe(false);

    // userOther sees only their own.
    const otherProjects = await prisma.withRlsContext(
      { userId: seed.userOther.id, accountKind: 'END_CLIENT' },
      (tx) =>
        tx.estimateProject.findMany({
          where: { id: { in: [seed.projMineA.id, seed.projMineB.id, seed.projOtherB.id] } },
        }),
    );
    expect(otherProjects.map((p) => p.id)).toEqual([seed.projOtherB.id]);

    // Quotes: app_owns_customer(customer_id) on a direct-customer table.
    const mineQuotes = await prisma.withRlsContext(
      { userId: seed.userMine.id, accountKind: 'END_CLIENT' },
      (tx) => tx.quote.findMany({ where: { id: { in: [seed.quoteMineA.id, seed.quoteOtherB.id] } } }),
    );
    expect(mineQuotes.map((q) => q.id)).toEqual([seed.quoteMineA.id]);

    // Invoices: ownership resolved through intervention.customer.
    const mineInvoices = await prisma.withRlsContext(
      { userId: seed.userMine.id, accountKind: 'END_CLIENT' },
      (tx) => tx.companyInvoice.findMany({ where: { id: { in: [seed.invMineA.id, seed.invOtherB.id] } } }),
    );
    expect(mineInvoices.map((i) => i.id)).toEqual([seed.invMineA.id]);

    await prisma.withRlsContext({ userId: 'system', accountKind: 'PLATFORM_ADMIN' }, async (tx) => {
      await tx.companyInvoice.deleteMany({
        where: { id: { in: [seed.invMineA.id, seed.invOtherB.id] } },
      });
      await tx.intervention.deleteMany({
        where: { id: { in: [seed.intMineA.id, seed.intOtherB.id] } },
      });
      await tx.quote.deleteMany({
        where: { id: { in: [seed.quoteMineA.id, seed.quoteOtherB.id] } },
      });
      await tx.estimateProject.deleteMany({
        where: { id: { in: [seed.projMineA.id, seed.projMineB.id, seed.projOtherB.id] } },
      });
      await tx.companyCustomer.deleteMany({
        where: { id: { in: [seed.custMineA.id, seed.custMineB.id, seed.custOtherB.id] } },
      });
      await tx.company.deleteMany({ where: { id: { in: [seed.companyA.id, seed.companyB.id] } } });
      await tx.user.deleteMany({ where: { id: { in: [seed.userMine.id, seed.userOther.id] } } });
    });
  });
});
