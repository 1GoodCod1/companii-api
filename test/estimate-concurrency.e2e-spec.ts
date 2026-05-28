import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { applyE2eAppConfig, api, unwrapBody } from './helpers/e2e-bootstrap';
import { PrismaService } from '../src/modules/shared/database/prisma.service';
import { EstimateProjectStatus } from '@prisma/client';

const describeE2e = process.env.DATABASE_URL ? describe : describe.skip;

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomInt(1000, 9999)}@test.local`;
}

describeE2e('Estimate Concurrency & Security (e2e - Epic S)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cityId: string;
  let ownerToken: string;
  let portalToken: string;
  let portalCustomerId: string;
  let blueprints: Array<{ categoryId: string; category: { slug: string } }>;

  const ownerEmail = uniqueEmail('owner-s');
  const clientEmail = uniqueEmail('client-s');
  const password = 'TestPass1!@#';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyE2eAppConfig(app);
    await app.init();

    prisma = app.get(PrismaService);

    const clientPhone = `+3736${String(randomInt(1000000, 9999999))}`;

    // Get city
    const citiesRes = await request(app.getHttpServer()).get(api('/companies/cities')).expect(200);
    cityId = unwrapBody<Array<{ id: string }>>(citiesRes.body)[0]?.id;

    // Register & login owner
    await request(app.getHttpServer())
      .post(api('/auth/register'))
      .send({
        email: ownerEmail,
        password,
        accountKind: 'COMPANY_STAFF',
        firstName: 'Owner',
        lastName: 'S',
        acceptTerms: true,
      })
      .expect(201);

    const ownerLogin = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: ownerEmail, password, rememberMe: false })
      .expect(200);
    const ownerSession = unwrapBody<{ accessToken: string }>(ownerLogin.body);
    ownerToken = ownerSession.accessToken;

    // Create company
    const compRes = await request(app.getHttpServer())
      .post(api('/companies'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `S Co ${Date.now()}`,
        legalName: 'S SRL',
        idno: String(Date.now()).padStart(13, '0').slice(-13),
        legalAddress: 'Str. Concurrency 1',
        cityId,
      })
      .expect(201);
    const company = unwrapBody<{ id: string }>(compRes.body);

    // Upgrade company subscription to BUSINESS
    const businessPlan = await prisma.companyPlan.findUnique({ where: { code: 'BUSINESS' } });
    await prisma.companySubscription.updateMany({
      where: { companyId: company.id },
      data: { planId: businessPlan!.id },
    });

    // Relogin owner to refresh token/context
    const ownerRelogin = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: ownerEmail, password, rememberMe: false })
      .expect(200);
    ownerToken = unwrapBody<{ accessToken: string }>(ownerRelogin.body).accessToken;

    // Create an end-customer
    const custRes = await request(app.getHttpServer())
      .post(api('/fsm/customers'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fullName: 'Client Concurrency',
        phone: clientPhone,
        email: clientEmail,
        address: 'Chisinau, MD',
      })
      .expect(201);
    portalCustomerId = unwrapBody<{ id: string }>(custRes.body).id;

    // Invite customer to portal
    const inviteRes = await request(app.getHttpServer())
      .post(api(`/companies/members/customers/${portalCustomerId}/portal-invite`))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    const inviteToken = unwrapBody<{ token: string }>(inviteRes.body).token;

    // Register & Login client
    const regRes = await request(app.getHttpServer())
      .post(api('/auth/register'))
      .send({
        email: clientEmail,
        password,
        accountKind: 'END_CLIENT',
        firstName: 'Client',
        lastName: 'S',
        phone: clientPhone,
        acceptTerms: true,
      })
      .expect(201);

    const clientLogin = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: clientEmail, password, rememberMe: false })
      .expect(200);
    portalToken = unwrapBody<{ accessToken: string }>(clientLogin.body).accessToken;

    // Accept portal invitation
    await request(app.getHttpServer())
      .post(api('/portal/invitations/accept'))
      .set('Authorization', `Bearer ${portalToken}`)
      .send({ token: inviteToken })
      .expect(201);

    // Fetch active blueprints
    const blueprintsRes = await request(app.getHttpServer())
      .get(api('/estimates/blueprints'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    blueprints = unwrapBody<Array<{ categoryId: string; category: { slug: string } }>>(blueprintsRes.body);
  });

  afterAll(async () => {
    await app?.close();
  });

  async function createFreshProject(title: string) {
    const santehnika = blueprints.find((b) => b.category.slug === 'santehnika')!;
    const projRes = await request(app.getHttpServer())
      .post(api('/estimates/projects'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        customerId: portalCustomerId,
        categoryId: santehnika.categoryId,
        title,
        siteType: 'apartment',
        address: 'Str. Test Concurrency',
      })
      .expect(201);
    const projectId = unwrapBody<{ id: string }>(projRes.body).id;

    // Update diagnostics
    await request(app.getHttpServer())
      .patch(api(`/estimates/projects/${projectId}`))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        diagnosticAnswers: {
          bathroomsCount: 1,
          pipeLengthM: 10,
          waterHeater: true,
          wallMaterial: 'beton',
          complexity: 'medium',
        },
      })
      .expect(200);

    return projectId;
  }

  describe('Concurrency Lock Verifications', () => {
    it('S-03 · should enforce optimistic locking on concurrent /calculate calls', async () => {
      const projectId = await createFreshProject('S-03 Optimistic Lock');

      // We send 2 calculate requests in parallel.
      // One must succeed (201 Created) and increment version to 2,
      // and the other must fail with 409 Conflict.
      const p1 = request(app.getHttpServer())
        .post(api(`/estimates/projects/${projectId}/calculate`))
        .set('Authorization', `Bearer ${ownerToken}`);

      const p2 = request(app.getHttpServer())
        .post(api(`/estimates/projects/${projectId}/calculate`))
        .set('Authorization', `Bearer ${ownerToken}`);

      const [res1, res2] = await Promise.all([p1, p2]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(201);
      expect(statuses).toContain(409);

      // Verify that version in database is exactly 2
      const dbProject = await prisma.estimateProject.findUnique({
        where: { id: projectId },
      });
      expect(dbProject?.version).toBe(2);
    });

    it('S-04 · should prevent race conditions during concurrent additions of manual lines', async () => {
      const projectId = await createFreshProject('S-04 Pessimistic lock');

      // Perform initial calculate to generate the stages
      const calcRes = await request(app.getHttpServer())
        .post(api(`/estimates/projects/${projectId}/calculate`))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);

      const project = unwrapBody<any>(calcRes.body);
      const stage = project.stages[0];
      expect(stage).toBeDefined();

      const initialStageTotal = Number(stage.stageTotal);

      // We concurrently add 10 manual lines to the stage.
      const linesToAdd = Array.from({ length: 10 }).map((_, i) => ({
        description: `Manual Line Concurrency ${i}`,
        qty: 1,
        unit: 'buc',
        unitPrice: 100, // 100 MDL each
      }));

      const requests = linesToAdd.map((line) =>
        request(app.getHttpServer())
          .post(api(`/estimates/projects/${projectId}/stages/${stage.id}/lines`))
          .set('Authorization', `Bearer ${ownerToken}`)
          .send(line)
      );

      const responses = await Promise.all(requests);

      // Verify that all 10 requests completed successfully with 201
      for (const res of responses) {
        expect(res.status).toBe(201);
      }

      // Check the final totals in the database
      const dbProject = await prisma.estimateProject.findUnique({
        where: { id: projectId },
        include: { stages: true },
      });

      const dbStage = dbProject?.stages.find((s) => s.id === stage.id);
      expect(dbStage).toBeDefined();

      // Since each manual line was 100 MDL, adding 10 manual lines should add exactly 1000 MDL.
      const expectedStageTotal = initialStageTotal + 1000;
      expect(Number(dbStage?.stageTotal)).toBeCloseTo(expectedStageTotal, 2);

      // Also grandTotal should reflect the stage totals aggregate with marginPct
      const subtotal = dbProject!.stages.reduce((sum, s) => sum + Number(s.stageTotal), 0);
      const expectedGrandTotal = subtotal * (1 + Number(dbProject!.marginPct) / 100);
      expect(Number(dbProject?.grandTotal)).toBeCloseTo(expectedGrandTotal, 2);
    });

    it('S-05 · should enforce pessimistic lock on concurrent convert-to-interventions requests', async () => {
      const projectId = await createFreshProject('S-05 Atomic Convert');

      // Calculate the project
      await request(app.getHttpServer())
        .post(api(`/estimates/projects/${projectId}/calculate`))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);

      // Approve the project by changing status to ACCEPTED
      await prisma.estimateProject.update({
        where: { id: projectId },
        data: { status: EstimateProjectStatus.ACCEPTED },
      });

      // Send two convert requests in parallel
      const p1 = request(app.getHttpServer())
        .post(api(`/estimates/projects/${projectId}/convert`))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ mode: 'single' });

      const p2 = request(app.getHttpServer())
        .post(api(`/estimates/projects/${projectId}/convert`))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ mode: 'single' });

      const [res1, res2] = await Promise.all([p1, p2]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(201);
      expect(statuses).toContain(409); // The second one must return 409 Conflict

      // Verify that only one intervention is created for this project
      const interventions = await prisma.intervention.findMany({
        where: { estimateProjectId: projectId },
      });
      expect(interventions.length).toBe(1);

      // Verify status is IN_EXECUTION
      const dbProject = await prisma.estimateProject.findUnique({
        where: { id: projectId },
      });
      expect(dbProject?.status).toBe(EstimateProjectStatus.IN_EXECUTION);
    });

    it('S-06 · should enforce pessimistic locks on concurrent portal status transitions', async () => {
      const projectId = await createFreshProject('S-06 Portal Status Concurrency');

      // Calculate the project
      await request(app.getHttpServer())
        .post(api(`/estimates/projects/${projectId}/calculate`))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);

      // Change status to SENT so client can accept/reject
      await prisma.estimateProject.update({
        where: { id: projectId },
        data: { status: EstimateProjectStatus.SENT },
      });

      // Send two ACCEPT/REJECT requests concurrently from the portal user
      const p1 = request(app.getHttpServer())
        .post(api(`/portal/estimates/${projectId}/status`))
        .set('Authorization', `Bearer ${portalToken}`)
        .send({ status: 'ACCEPTED' });

      const p2 = request(app.getHttpServer())
        .post(api(`/portal/estimates/${projectId}/status`))
        .set('Authorization', `Bearer ${portalToken}`)
        .send({ status: 'REJECTED' });

      const [res1, res2] = await Promise.all([p1, p2]);

      const statuses = [res1.status, res2.status];
      // One request should successfully transition the project, other return 409
      expect(statuses).toContain(201);
      expect(statuses).toContain(409);

      // Verify the final status in the database is terminal and matches the successful operation
      const dbProject = await prisma.estimateProject.findUnique({
        where: { id: projectId },
      });
      expect([EstimateProjectStatus.ACCEPTED, EstimateProjectStatus.CANCELLED]).toContain(dbProject?.status);
    });
  });
});
