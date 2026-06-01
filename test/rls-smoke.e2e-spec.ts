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
});
