import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { applyE2eAppConfig, api, unwrapBody } from './helpers/e2e-bootstrap';
import { PrismaService } from '../src/modules/shared/database/prisma.service';
import { ESTIMATE_BLUEPRINT_CATEGORY_SLUGS, ESTIMATE_EXCLUDED_CATEGORY_SLUGS } from '../src/common/constants/estimate-category-slugs.constants';

const describeE2e = process.env.DATABASE_URL ? describe : describe.skip;

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomInt(1000, 9999)}@test.local`;
}

describeE2e('Estimate QA (e2e - Epic Q)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cityId: string;
  let ownerToken: string;
  let memberToken: string;
  let portalToken: string;
  let portalCustomerId: string;

  const ownerEmail = uniqueEmail('owner-q');
  const memberEmail = uniqueEmail('member-q');
  const clientEmail = uniqueEmail('client-q');
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
        lastName: 'Q',
        acceptTerms: true,
      })
      .expect(201);

    const ownerLogin = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: ownerEmail, password, rememberMe: false })
      .expect(200);
    const ownerSession = unwrapBody<{ accessToken: string; user: { id: string } }>(ownerLogin.body);
    ownerToken = ownerSession.accessToken;

    // Create company
    const compRes = await request(app.getHttpServer())
      .post(api('/companies'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `Q Co ${Date.now()}`,
        legalName: 'Q SRL',
        idno: String(Date.now()).padStart(13, '0').slice(-13),
        legalAddress: 'Str. QA 1',
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

    // Register and add a technician (MEMBER)
    await request(app.getHttpServer())
      .post(api('/auth/register'))
      .send({
        email: memberEmail,
        password,
        accountKind: 'COMPANY_STAFF',
        firstName: 'Technician',
        lastName: 'Q',
        acceptTerms: true,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(api('/companies/members/add-direct'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ contact: memberEmail, role: 'MEMBER' })
      .expect(201);

    const memberLogin = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: memberEmail, password, rememberMe: false })
      .expect(200);
    const memberSession = unwrapBody<{ accessToken: string; user: { memberId?: string } }>(memberLogin.body);
    memberToken = memberSession.accessToken;

    const custRes = await request(app.getHttpServer())
      .post(api('/fsm/customers'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fullName: 'Client QA',
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
        lastName: 'QA',
        phone: clientPhone,
        acceptTerms: true,
      });

    if (regRes.status !== 201) {
      console.error('REGISTRATION FAILED:', regRes.body);
    }
    expect(regRes.status).toBe(201);

    const clientLogin = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: clientEmail, password, rememberMe: false })
      .expect(200);
    portalToken = unwrapBody<{ accessToken: string }>(clientLogin.body).accessToken;

    // Accept portal invitation on the correct portal controller route using client token
    await request(app.getHttpServer())
      .post(api('/portal/invitations/accept'))
      .set('Authorization', `Bearer ${portalToken}`)
      .send({ token: inviteToken })
      .expect(201);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('Q-01 · Blueprints for 13 Active Categories', () => {
    it('should retrieve all 13 active estimate blueprints', async () => {
      const res = await request(app.getHttpServer())
        .get(api('/estimates/blueprints'))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const blueprints = unwrapBody<Array<{ category: { slug: string } }>>(res.body);
      const slugs = blueprints.map((b) => b.category.slug);

      for (const activeSlug of ESTIMATE_BLUEPRINT_CATEGORY_SLUGS) {
        expect(slugs).toContain(activeSlug);
      }
    });

    it('should be able to fetch details for individual active blueprints by slug', async () => {
      for (const slug of ESTIMATE_BLUEPRINT_CATEGORY_SLUGS) {
        const res = await request(app.getHttpServer())
          .get(api(`/estimates/blueprints/category/${slug}`))
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(200);

        const blueprint = unwrapBody<{ config: object; name: string }>(res.body);
        expect(blueprint.name).toBeDefined();
        expect(blueprint.config).toBeDefined();
      }
    });
  });

  describe('Q-02 · Blueprints for 6 Excluded Categories', () => {
    it('should NOT list blueprints or return config for any of the 6 excluded categories', async () => {
      const res = await request(app.getHttpServer())
        .get(api('/estimates/blueprints'))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const blueprints = unwrapBody<Array<{ category: { slug: string } }>>(res.body);
      const slugs = blueprints.map((b) => b.category.slug);

      for (const excludedSlug of ESTIMATE_EXCLUDED_CATEGORY_SLUGS) {
        expect(slugs).not.toContain(excludedSlug);
      }
    });

    it('should fail with 404/400 for individual fetch of excluded categories', async () => {
      for (const slug of ESTIMATE_EXCLUDED_CATEGORY_SLUGS) {
        await request(app.getHttpServer())
          .get(api(`/estimates/blueprints/category/${slug}`))
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect((res) => {
            expect([400, 404]).toContain(res.status);
          });
      }
    });
  });

  describe('Q-03 & Q-07 · Security Leak Audit (OWNER vs MEMBER vs END_CLIENT)', () => {
    let projectId: string;

    beforeAll(async () => {
      const blueprintsRes = await request(app.getHttpServer())
        .get(api('/estimates/blueprints'))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const blueprints = unwrapBody<Array<{ categoryId: string; category: { slug: string } }>>(blueprintsRes.body);
      const santehnika = blueprints.find((b) => b.category.slug === 'santehnika')!;

      // Create a project
      const projRes = await request(app.getHttpServer())
        .post(api('/estimates/projects'))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          customerId: portalCustomerId,
          categoryId: santehnika.categoryId,
          title: 'Happy Path Santehnika',
          siteType: 'apartment',
          address: 'Str. Test 123',
        })
        .expect(201);
      projectId = unwrapBody<{ id: string }>(projRes.body).id;

      // Update diagnostics & plan
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

      // Perform calculation
      await request(app.getHttpServer())
        .post(api(`/estimates/projects/${projectId}/calculate`))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);
    });

    it('OWNER should see all pricing, laborRate, and margin details', async () => {
      const res = await request(app.getHttpServer())
        .get(api(`/estimates/projects/${projectId}`))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const project = unwrapBody<any>(res.body);
      expect(project.laborTotal).toBeDefined();
      expect(project.materialTotal).toBeDefined();
      expect(project.grandTotal).toBeDefined();
      expect(project.marginPct).toBeDefined();

      const stage = project.stages[0];
      expect(stage).toBeDefined();
      expect(stage.laborRate).toBeDefined();
      expect(stage.laborCost).toBeDefined();
      expect(stage.materialCost).toBeDefined();
      expect(stage.stageTotal).toBeDefined();

      const line = stage.lines[0];
      expect(line).toBeDefined();
      expect(line.unitPrice).toBeDefined();
      expect(line.lineTotal).toBeDefined();
    });

    it('MEMBER (Technician) should NOT see any price, margin, or subtotal details', async () => {
      // Technicians use the worksheet endpoint to query estimate project details
      const res = await request(app.getHttpServer())
        .get(api(`/estimates/projects/${projectId}`))
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      const project = unwrapBody<any>(res.body);

      // Verify that no pricing or financial fields exist in the returned payload
      expect(project.laborTotal).toBeUndefined();
      expect(project.materialTotal).toBeUndefined();
      expect(project.grandTotal).toBeUndefined();
      expect(project.marginPct).toBeUndefined();

      if (project.stages && project.stages.length > 0) {
        for (const stage of project.stages) {
          expect(stage.laborRate).toBeUndefined();
          expect(stage.laborCost).toBeUndefined();
          expect(stage.materialCost).toBeUndefined();
          expect(stage.stageTotal).toBeUndefined();

          if (stage.lines) {
            for (const line of stage.lines) {
              expect(line.unitPrice).toBeUndefined();
              expect(line.lineTotal).toBeUndefined();
            }
          }
        }
      }
    });

    it('END_CLIENT (Portal) should see totals and stage scope but NO internal labor rate or marginPct', async () => {
      // First, OWNER sends estimate to client (changing state to SENT and creating Portal Estimate view)
      await request(app.getHttpServer())
        .post(api(`/estimates/projects/${projectId}/send`))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);

      // Client queries the portal endpoint for the estimate
      const res = await request(app.getHttpServer())
        .get(api(`/portal/estimates/${projectId}`))
        .set('Authorization', `Bearer ${portalToken}`)
        .expect(200);

      const estimate = unwrapBody<any>(res.body);
      expect(estimate.grandTotal).toBeDefined(); // Client sees grand total
      expect(estimate.stages).toBeDefined();

      // Client MUST NOT see labor rate or margin percent leaks
      expect(estimate.marginPct).toBeUndefined();

      for (const stage of estimate.stages) {
        expect(stage.laborRate).toBeUndefined();
        expect(stage.laborCost).toBeUndefined();
        expect(stage.materialCost).toBeUndefined();

        if (stage.lines) {
          for (const line of stage.lines) {
            // Client sees public lines, but no internal cost rates
            expect(line.laborRate).toBeUndefined();
          }
        }
      }
    });
  });

  describe('Q-05 · Recalculate Idempotency (Manual lines survive)', () => {
    it('should keep manual line intact across multiple recalculations', async () => {
      const blueprintsRes = await request(app.getHttpServer())
        .get(api('/estimates/blueprints'))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const blueprints = unwrapBody<Array<{ categoryId: string; category: { slug: string } }>>(blueprintsRes.body);
      const santehnika = blueprints.find((b) => b.category.slug === 'santehnika')!;

      // Create new project
      const projRes = await request(app.getHttpServer())
        .post(api('/estimates/projects'))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          customerId: portalCustomerId,
          categoryId: santehnika.categoryId,
          title: 'Idempotency test',
          siteType: 'apartment',
        })
        .expect(201);
      const projectId = unwrapBody<{ id: string }>(projRes.body).id;

      // Update details to trigger staging
      await request(app.getHttpServer())
        .patch(api(`/estimates/projects/${projectId}`))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          diagnosticAnswers: { bathroomsCount: 1, pipeLengthM: 5 },
        })
        .expect(200);

      // Perform calculation 1
      const calc1Res = await request(app.getHttpServer())
        .post(api(`/estimates/projects/${projectId}/calculate`))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);

      const calc1Project = unwrapBody<any>(calc1Res.body);
      const stage = calc1Project.stages[0];

      // Add a manual line to the stage
      const manualLineRes = await request(app.getHttpServer())
        .post(api(`/estimates/projects/${projectId}/stages/${stage.id}/lines`))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          description: 'Special custom manual task',
          qty: 2,
          unit: 'buc',
          unitPrice: 150,
        })
        .expect(201);
      const projectWithManual = unwrapBody<any>(manualLineRes.body);
      const manualStage = projectWithManual.stages.find((s: any) => s.id === stage.id);
      const manualLine = manualStage.lines.find((l: any) => l.description === 'Special custom manual task');

      // Perform recalculation (calculation 2)
      const calc2Res = await request(app.getHttpServer())
        .post(api(`/estimates/projects/${projectId}/calculate`))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);

      const calc2Project = unwrapBody<any>(calc2Res.body);
      const calc2Stage = calc2Project.stages.find((s: any) => s.id === stage.id);

      // Verify that the manual line survived!
      const lines = calc2Stage.lines;
      const foundManual = lines.find((l: any) => l.description === 'Special custom manual task');
      expect(foundManual).toBeDefined();
      expect(foundManual.id).toBe(manualLine.id);
      expect(Number(foundManual.unitPrice)).toBe(150);
      expect(Number(foundManual.lineTotal)).toBe(300);
    });
  });

  describe('Q-09 · FSM Intervention Conversion Regression', () => {
    it('should successfully convert an approved estimate to FSM interventions', async () => {
      const blueprintsRes = await request(app.getHttpServer())
        .get(api('/estimates/blueprints'))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const blueprints = unwrapBody<Array<{ categoryId: string; category: { slug: string } }>>(blueprintsRes.body);
      const santehnika = blueprints.find((b) => b.category.slug === 'santehnika')!;

      const projRes = await request(app.getHttpServer())
        .post(api('/estimates/projects'))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          customerId: portalCustomerId,
          categoryId: santehnika.categoryId,
          title: 'Conversion test',
          siteType: 'apartment',
        })
        .expect(201);
      const projectId = unwrapBody<{ id: string }>(projRes.body).id;

      await request(app.getHttpServer())
        .patch(api(`/estimates/projects/${projectId}`))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          diagnosticAnswers: { bathroomsCount: 1, pipeLengthM: 5 },
        })
        .expect(200);

      await request(app.getHttpServer())
        .post(api(`/estimates/projects/${projectId}/calculate`))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);

      // Approve it (change status to ACCEPTED since conversion requires ACCEPTED state)
      await request(app.getHttpServer())
        .patch(api(`/estimates/projects/${projectId}`))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'ACCEPTED' })
        .expect(200);

      // Perform conversion
      const convertRes = await request(app.getHttpServer())
        .post(api(`/estimates/projects/${projectId}/convert`))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ mode: 'single' })
        .expect(201);

      const conversion = unwrapBody<any>(convertRes.body);
      expect(conversion.intervention || conversion.interventions).toBeDefined();
    });
  });
});
