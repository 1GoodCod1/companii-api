import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { applyE2eAppConfig, api, unwrapBody } from './helpers/e2e-bootstrap';
import { PrismaService } from '../src/modules/shared/database/prisma.service';

const describeE2e = process.env.DATABASE_URL ? describe : describe.skip;

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomInt(1000, 9999)}@test.local`;
}

describeE2e('Estimate Templates (e2e - Epic Template)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cityId: string;
  let categoryId: string;
  
  let ownerAToken: string;
  let customerAId: string;
  
  const ownerAEmail = uniqueEmail('owner-tpl');
  const password = 'TestPass1!@#';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyE2eAppConfig(app);
    await app.init();

    prisma = app.get(PrismaService);

    // --- CLEANUP ---
    await prisma.payment.deleteMany({});
    await prisma.companyInvoice.deleteMany({});
    await prisma.quoteLine.deleteMany({});
    await prisma.quote.deleteMany({});
    await prisma.interventionStatusHistory.deleteMany({});
    await prisma.interventionNote.deleteMany({});
    await prisma.interventionPhoto.deleteMany({});
    await prisma.intervention.deleteMany({});
    await prisma.estimateReceipt.deleteMany({});
    await prisma.estimateLine.deleteMany({});
    await prisma.estimateStage.deleteMany({});
    await prisma.estimateMeasurement.deleteMany({});
    await prisma.estimateAppliedMutation.deleteMany({});
    await prisma.estimateSitePlan.deleteMany({});
    await prisma.estimateProject.deleteMany({});
    await prisma.estimateTemplate.deleteMany({});
    await prisma.companyMember.deleteMany({});
    await prisma.companyInvitation.deleteMany({});
    await prisma.companyCustomer.deleteMany({});
    await prisma.company.deleteMany({});

    await prisma.user.deleteMany({
      where: { email: { startsWith: 'owner-tpl' } },
    });

    // Get city
    const citiesRes = await request(app.getHttpServer()).get(api('/companies/cities')).expect(200);
    cityId = unwrapBody<Array<{ id: string }>>(citiesRes.body)[0]?.id;

    // Get category
    const blueprintsRes = await prisma.estimateBlueprint.findFirst({ where: { isActive: true } });
    categoryId = blueprintsRes!.categoryId;

    // --- SETUP OWNER ---
    await request(app.getHttpServer())
      .post(api('/auth/register'))
      .send({ email: ownerAEmail, password, accountKind: 'COMPANY_STAFF', firstName: 'Template', lastName: 'Owner', acceptTerms: true })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: ownerAEmail, password, rememberMe: false })
      .expect(200);
    ownerAToken = unwrapBody<{ accessToken: string }>(loginRes.body).accessToken;

    const compRes = await request(app.getHttpServer())
      .post(api('/companies'))
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        name: `Template Owner Co`,
        legalName: 'Template Owner SRL',
        idno: String(Date.now()).padStart(13, '0').slice(-13),
        legalAddress: 'Chisinau, MD',
        cityId,
      })
      .expect(201);
    const company = unwrapBody<{ id: string }>(compRes.body);

    const plan = await prisma.companyPlan.findUnique({ where: { code: 'BUSINESS' } });
    await prisma.companySubscription.updateMany({
      where: { companyId: company.id },
      data: { planId: plan!.id },
    });

    // Relogin
    const relogin = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: ownerAEmail, password, rememberMe: false })
      .expect(200);
    ownerAToken = unwrapBody<{ accessToken: string }>(relogin.body).accessToken;

    // Create Customer
    const custRes = await request(app.getHttpServer())
      .post(api('/fsm/customers'))
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ fullName: 'Cust Template', phone: `+37367${randomInt(100000, 999999)}`, email: uniqueEmail('c-tpl'), address: 'Chisinau' })
      .expect(201);
    customerAId = unwrapBody<{ id: string }>(custRes.body).id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('CRUD Operations on Estimate Templates', () => {
    let templateId: string;

    it('should create an empty template or from custom stages payload', async () => {
      const res = await request(app.getHttpServer())
        .post(api('/estimates/templates'))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          name: 'Standard bathroom 5 sqm',
          description: 'Basic bathroom preset',
          stages: [
            {
              name: 'Demolition',
              code: 'demo',
              lines: [
                { description: 'Remove old tiles', qty: 15, unit: 'm2', unitPrice: 80 }
              ]
            }
          ]
        })
        .expect(201);

      const template = unwrapBody<any>(res.body);
      expect(template.name).toBe('Standard bathroom 5 sqm');
      expect(template.stages.length).toBe(1);
      templateId = template.id;
    });

    it('should list all templates for the active company', async () => {
      const res = await request(app.getHttpServer())
        .get(api('/estimates/templates'))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      const list = unwrapBody<any[]>(res.body);
      expect(list.length).toBeGreaterThan(0);
      expect(list.find(t => t.id === templateId)).toBeDefined();
    });

    it('should retrieve a template by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(api(`/estimates/templates/${templateId}`))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      const template = unwrapBody<any>(res.body);
      expect(template.id).toBe(templateId);
    });

    it('should update template fields', async () => {
      const res = await request(app.getHttpServer())
        .put(api(`/estimates/templates/${templateId}`))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          name: 'Standard bathroom 5 sqm - Updated',
          description: 'Updated basic bathroom preset'
        })
        .expect(200);

      const template = unwrapBody<any>(res.body);
      expect(template.name).toBe('Standard bathroom 5 sqm - Updated');
      expect(template.description).toBe('Updated basic bathroom preset');
    });

    it('should create a template from an existing project (clone)', async () => {
      // 1. Create a project
      const projRes = await request(app.getHttpServer())
        .post(api('/estimates/projects'))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ customerId: customerAId, categoryId, title: 'Base Project to Clone' })
        .expect(201);
      const project = unwrapBody<any>(projRes.body);

      // 2. Clone it as template
      const cloneRes = await request(app.getHttpServer())
        .post(api('/estimates/templates'))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          name: 'Cloned from estimate template',
          projectId: project.id
        })
        .expect(201);

      const template = unwrapBody<any>(cloneRes.body);
      expect(template.name).toBe('Cloned from estimate template');
      expect(template.stages.length).toBeGreaterThan(0);
    });
  });

  describe('Template Application on Estimate Projects', () => {
    let templateId: string;
    let projectId: string;

    beforeAll(async () => {
      // Create a nice template first
      const res = await request(app.getHttpServer())
        .post(api('/estimates/templates'))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          name: 'Apply Target Template',
          stages: [
            {
              name: 'Tiling Works',
              code: 'tiling',
              kind: 'MIXED',
              lines: [
                { description: 'Lay tiles', qty: 25, unit: 'm2', unitPrice: 120 },
                { description: 'Grout premium', qty: 5, unit: 'buc', unitPrice: 40 }
              ]
            }
          ]
        })
        .expect(201);
      templateId = unwrapBody<any>(res.body).id;

      // Create a fresh project
      const projRes = await request(app.getHttpServer())
        .post(api('/estimates/projects'))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ customerId: customerAId, categoryId, title: 'Apply Target Project' })
        .expect(201);
      projectId = unwrapBody<any>(projRes.body).id;
    });

    it('should overwrite project stages and lines and recalculate totals', async () => {
      const applyRes = await request(app.getHttpServer())
        .post(api(`/estimates/templates/${templateId}/apply/${projectId}`))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ mode: 'overwrite' })
        .expect(201);

      const project = unwrapBody<any>(applyRes.body);
      
      // Verify stages & lines are overwritten
      expect(project.stages.length).toBe(1);
      expect(project.stages[0].name).toBe('Tiling Works');
      expect(project.stages[0].lines.length).toBe(2);

      // Verify calculations:
      // lines cost: (25 * 120) = 3000 MDL, plus (5 * 40) = 200 MDL. Total cost = 3200 MDL.
      // margin = 10% (from default blueprint wizard).subtotal = 3200.
      // grandTotal = 3200 * (1 + margin/100)
      const grandTotal = Number(project.grandTotal);
      expect(grandTotal).toBeGreaterThan(0);
      expect(grandTotal).toBeCloseTo(3200 * (1 + Number(project.marginPct) / 100), 2);
    });

    it('should append template stages to existing project', async () => {
      // Apply templates with append mode
      const applyRes = await request(app.getHttpServer())
        .post(api(`/estimates/templates/${templateId}/apply/${projectId}`))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ mode: 'append' })
        .expect(201);

      const project = unwrapBody<any>(applyRes.body);

      // Stage count must now be 2!
      expect(project.stages.length).toBe(2);
      expect(project.stages[0].name).toBe('Tiling Works');
      expect(project.stages[1].name).toBe('Tiling Works');
    });
  });
});
