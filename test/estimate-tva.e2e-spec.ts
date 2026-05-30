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

describeE2e('Estimate TVA & Rounding (e2e - Epic T)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cityId: string;
  let categoryId: string;
  
  let ownerAToken: string;
  let ownerBToken: string; 
  
  let customerAId: string;
  let customerBId: string;
  
  const ownerAEmail = uniqueEmail('owner-tva');
  const ownerBEmail = uniqueEmail('owner-tvb');
  const password = 'TestPass1!@#';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyE2eAppConfig(app);
    await app.init();

    prisma = app.get(PrismaService);

    // --- CLEANUP BEFORE RUNNING TESTS ---
    const testCompanyLegalNames = ['TVA Payer SRL', 'TVA NonPayer SRL'];
    const testCompanies = await prisma.company.findMany({
      where: { legalName: { in: testCompanyLegalNames } },
      select: { id: true },
    });
    const companyIds = testCompanies.map(c => c.id);

    if (companyIds.length > 0) {
      await prisma.payment.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.companyInvoice.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.quoteLine.deleteMany({
        where: { quote: { intervention: { companyId: { in: companyIds } } } },
      });
      await prisma.quote.deleteMany({
        where: { intervention: { companyId: { in: companyIds } } },
      });
      await prisma.interventionStatusHistory.deleteMany({
        where: { intervention: { companyId: { in: companyIds } } },
      });
      await prisma.interventionNote.deleteMany({
        where: { intervention: { companyId: { in: companyIds } } },
      });
      await prisma.interventionPhoto.deleteMany({
        where: { intervention: { companyId: { in: companyIds } } },
      });
      await prisma.intervention.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.estimateReceipt.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.estimateLine.deleteMany({
        where: { stage: { project: { companyId: { in: companyIds } } } },
      });
      await prisma.estimateStage.deleteMany({
        where: { project: { companyId: { in: companyIds } } },
      });
      await prisma.estimateMeasurement.deleteMany({
        where: { project: { companyId: { in: companyIds } } },
      });
      await prisma.estimateAppliedMutation.deleteMany({
        where: { project: { companyId: { in: companyIds } } },
      });
      await prisma.estimateSitePlan.deleteMany({
        where: { project: { companyId: { in: companyIds } } },
      });
      await prisma.estimateProject.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.companyMember.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.companyInvitation.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.companyDocument.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.companyGalleryImage.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.companyConsent.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.companyService.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.companySubscription.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.companyCustomerDocument.deleteMany({
        where: { customer: { companyId: { in: companyIds } } },
      });
      await prisma.companyCustomer.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.companyLead.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.portalInvitation.deleteMany({
        where: { customer: { companyId: { in: companyIds } } },
      });
      await prisma.company.deleteMany({
        where: { id: { in: companyIds } },
      });
    }

    await prisma.refreshToken.deleteMany({
      where: { user: { email: { startsWith: 'owner-tv' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'owner-tv' } },
    });

    // Get city
    const citiesRes = await request(app.getHttpServer()).get(api('/companies/cities')).expect(200);
    cityId = unwrapBody<Array<{ id: string }>>(citiesRes.body)[0]?.id;

    // Get category
    const blueprintsRes = await prisma.estimateBlueprint.findFirst({ where: { isActive: true } });
    categoryId = blueprintsRes!.categoryId;

    // --- SETUP COMPANY A (Payer TVA) ---
    await request(app.getHttpServer())
      .post(api('/auth/register'))
      .send({ email: ownerAEmail, password, accountKind: 'COMPANY_STAFF', firstName: 'TVA', lastName: 'Payer', acceptTerms: true })
      .expect(201);

    const loginA = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: ownerAEmail, password, rememberMe: false })
      .expect(200);
    ownerAToken = unwrapBody<{ accessToken: string }>(loginA.body).accessToken;

    const compARes = await request(app.getHttpServer())
      .post(api('/companies'))
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        name: `TVA Payer Co`,
        legalName: 'TVA Payer SRL',
        idno: String(Date.now()).padStart(13, '0').slice(-13),
        legalAddress: 'Chisinau, MD',
        cityId,
      })
      .expect(201);
    const companyA = unwrapBody<{ id: string }>(compARes.body);

    // Set as TVA Payer
    await prisma.company.update({
      where: { id: companyA.id },
      data: { isTvaPayer: true, tvaCode: '1234567' },
    });

    const plan = await prisma.companyPlan.findUnique({ where: { code: 'BUSINESS' } });
    await prisma.companySubscription.updateMany({
      where: { companyId: companyA.id },
      data: { planId: plan!.id },
    });

    // Relogin Owner A
    const reloginA = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: ownerAEmail, password, rememberMe: false })
      .expect(200);
    ownerAToken = unwrapBody<{ accessToken: string }>(reloginA.body).accessToken;

    // Create Customer A
    const custARes = await request(app.getHttpServer())
      .post(api('/fsm/customers'))
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ fullName: 'Cust A', phone: `+37368${randomInt(100000, 999999)}`, email: uniqueEmail('c-a'), address: 'Chisinau' })
      .expect(201);
    customerAId = unwrapBody<{ id: string }>(custARes.body).id;

    // --- SETUP COMPANY B (Neplătitor TVA) ---
    await request(app.getHttpServer())
      .post(api('/auth/register'))
      .send({ email: ownerBEmail, password, accountKind: 'COMPANY_STAFF', firstName: 'TVA', lastName: 'NonPayer', acceptTerms: true })
      .expect(201);

    const loginB = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: ownerBEmail, password, rememberMe: false })
      .expect(200);
    ownerBToken = unwrapBody<{ accessToken: string }>(loginB.body).accessToken;

    const compBRes = await request(app.getHttpServer())
      .post(api('/companies'))
      .set('Authorization', `Bearer ${ownerBToken}`)
      .send({
        name: `TVA NonPayer Co`,
        legalName: 'TVA NonPayer SRL',
        idno: String(Date.now() + 1).padStart(13, '0').slice(-13),
        legalAddress: 'Balti, MD',
        cityId,
      })
      .expect(201);
    const companyB = unwrapBody<{ id: string }>(compBRes.body);

    await prisma.companySubscription.updateMany({
      where: { companyId: companyB.id },
      data: { planId: plan!.id },
    });

    // Relogin Owner B
    const reloginB = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: ownerBEmail, password, rememberMe: false })
      .expect(200);
    ownerBToken = unwrapBody<{ accessToken: string }>(reloginB.body).accessToken;

    // Create Customer B
    const custBRes = await request(app.getHttpServer())
      .post(api('/fsm/customers'))
      .set('Authorization', `Bearer ${ownerBToken}`)
      .send({ fullName: 'Cust B', phone: `+37369${randomInt(100000, 999999)}`, email: uniqueEmail('c-b'), address: 'Balti' })
      .expect(201);
    customerBId = unwrapBody<{ id: string }>(custBRes.body).id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('TVA Creation & Calculations', () => {
    it('T-02 · TVA Payer company creates project with default tvaRate = 20%', async () => {
      const projRes = await request(app.getHttpServer())
        .post(api('/estimates/projects'))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ customerId: customerAId, categoryId, title: 'Payer Proj' })
        .expect(201);

      const project = unwrapBody<any>(projRes.body);
      expect(Number(project.tvaRate)).toBe(20);
      expect(Number(project.tvaAmount)).toBe(0);
      expect(Number(project.grandTotalWithVat)).toBe(0);
    });

    it('T-02 · Neplătitor TVA company creates project with default tvaRate = null', async () => {
      const projRes = await request(app.getHttpServer())
        .post(api('/estimates/projects'))
        .set('Authorization', `Bearer ${ownerBToken}`)
        .send({ customerId: customerBId, categoryId, title: 'NonPayer Proj' })
        .expect(201);

      const project = unwrapBody<any>(projRes.body);
      expect(project.tvaRate).toBeNull();
      expect(Number(project.tvaAmount)).toBe(0);
      expect(Number(project.grandTotalWithVat)).toBe(0);
    });

    it('T-04 · TVA Payer project calculate matches standard VAT rate', async () => {
      const projRes = await request(app.getHttpServer())
        .post(api('/estimates/projects'))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ customerId: customerAId, categoryId, title: 'Calculation Proj' })
        .expect(201);
      const project = unwrapBody<any>(projRes.body);

      // Force a manual stage line
      const stages = project.stages;
      expect(stages.length).toBeGreaterThan(0);
      const stageId = stages[0].id;

      await request(app.getHttpServer())
        .post(api(`/estimates/projects/${project.id}/stages/${stageId}/lines`))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ description: 'Material Line', qty: 10, unit: 'buc', unitPrice: 100 })
        .expect(201);

      // Calculate
      const calcRes = await request(app.getHttpServer())
        .post(api(`/estimates/projects/${project.id}/calculate`))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(201);

      const updated = unwrapBody<any>(calcRes.body);
      const grandTotal = Number(updated.grandTotal);
      expect(grandTotal).toBeGreaterThan(0);

      const expectedTva = Math.round(grandTotal * 0.20 * 100) / 100;
      expect(Number(updated.tvaAmount)).toBe(expectedTva);
      expect(Number(updated.grandTotalWithVat)).toBe(Math.round((grandTotal + expectedTva) * 100) / 100);
    });

    it('T-04 / T-10 · Mixed VAT rates calculation', async () => {
      const projRes = await request(app.getHttpServer())
        .post(api('/estimates/projects'))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ customerId: customerAId, categoryId, title: 'Mixed Proj' })
        .expect(201);
      const project = unwrapBody<any>(projRes.body);
      const stages = project.stages;
      const stageId = stages[0].id;

      // Clear auto-generated lines
      await prisma.estimateLine.deleteMany({
        where: { stageId: { in: stages.map((s: any) => s.id) } },
      });

      // Line 1: Standard 20% (qty 10 x unitPrice 10 = 100 MDL)
      await request(app.getHttpServer())
        .post(api(`/estimates/projects/${project.id}/stages/${stageId}/lines`))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ description: 'Standard rate', qty: 10, unit: 'buc', unitPrice: 10 })
        .expect(201);

      // Line 2: Custom 8% (qty 10 x unitPrice 5 = 50 MDL)
      await request(app.getHttpServer())
        .post(api(`/estimates/projects/${project.id}/stages/${stageId}/lines`))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ description: 'Reduced rate', qty: 10, unit: 'buc', unitPrice: 5 })
        .expect(201);

      // Find the line from the database using prisma
      const dbLine2 = await prisma.estimateLine.findFirst({
        where: {
          stageId,
          description: 'Reduced rate',
        },
      });
      expect(dbLine2).toBeDefined();

      // Set override vatRate to 8%
      await prisma.estimateLine.update({
        where: { id: dbLine2!.id },
        data: { vatRate: 8 },
      });

      // Trigger recalculation by PATCHing the line
      const patchRes = await request(app.getHttpServer())
        .patch(api(`/estimates/projects/${project.id}/stages/${stageId}/lines/${dbLine2!.id}`))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ qty: 10 })
        .expect(200);

      const updated = unwrapBody<any>(patchRes.body);
      // Margin on project
      const marginPct = Number(updated.marginPct);
      const marginFactor = 1 + marginPct / 100;

      // line 1 tva basis: 100 * marginFactor. TVA: 20 MDL * marginFactor
      // line 2 tva basis: 50 * marginFactor. TVA: 50 * 0.08 * marginFactor = 4 MDL * marginFactor
      // Total TVA = 24 MDL * marginFactor
      const expectedTva = Math.round(24 * marginFactor * 100) / 100;
      expect(Number(updated.tvaAmount)).toBe(expectedTva);
    });

    it('T-10 · Rounding edge cases (Bank rounding 20% on 1.05 MDL)', async () => {
      const projRes = await request(app.getHttpServer())
        .post(api('/estimates/projects'))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ customerId: customerAId, categoryId, title: 'Rounding Proj' })
        .expect(201);
      const project = unwrapBody<any>(projRes.body);
      const stages = project.stages;
      const stageId = stages[0].id;

      // Force project marginPct to 0% to avoid complications
      await prisma.estimateProject.update({
        where: { id: project.id },
        data: { marginPct: 0 },
      });

      // Clear auto-generated lines
      await prisma.estimateLine.deleteMany({
        where: { stageId: { in: stages.map((s: any) => s.id) } },
      });

      const addRes = await request(app.getHttpServer())
        .post(api(`/estimates/projects/${project.id}/stages/${stageId}/lines`))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ description: 'Micro Line', qty: 1, unit: 'buc', unitPrice: 1.05 })
        .expect(201);

      const updated = unwrapBody<any>(addRes.body);
      expect(Number(updated.grandTotal)).toBe(1.05);
      // 1.05 * 0.20 = 0.21.
      expect(Number(updated.tvaAmount)).toBe(0.21);
      expect(Number(updated.grandTotalWithVat)).toBe(1.26);
    });

    it('T-07 · Invoice inherits correct TVA settings', async () => {
      // 1. TVA-Paying company converts project & generates invoice
      const projRes = await request(app.getHttpServer())
        .post(api('/estimates/projects'))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ customerId: customerAId, categoryId, title: 'TVA Invoice Proj' })
        .expect(201);
      const project = unwrapBody<any>(projRes.body);
      
      // Calculate
      await request(app.getHttpServer())
        .post(api(`/estimates/projects/${project.id}/calculate`))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(201);

      await prisma.estimateProject.update({
        where: { id: project.id },
        data: { status: EstimateProjectStatus.ACCEPTED },
      });

      const convertRes = await request(app.getHttpServer())
        .post(api(`/estimates/projects/${project.id}/convert`))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ mode: 'single' })
        .expect(201);
      const interventionId = unwrapBody<any>(convertRes.body).intervention.id;

      await prisma.intervention.update({
        where: { id: interventionId },
        data: { status: 'COMPLETED' },
      });

      const invoiceRes = await request(app.getHttpServer())
        .post(api('/fsm/invoices'))
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ interventionId })
        .expect(201);
      const invoice = unwrapBody<any>(invoiceRes.body);

      expect(Number(invoice.tvaRate)).toBe(20);
      expect(Number(invoice.tvaAmount)).toBeGreaterThan(0);

      // 2. Non-TVA paying company converts project & generates invoice
      const projBRes = await request(app.getHttpServer())
        .post(api('/estimates/projects'))
        .set('Authorization', `Bearer ${ownerBToken}`)
        .send({ customerId: customerBId, categoryId, title: 'NoTVA Invoice Proj' })
        .expect(201);
      const projectB = unwrapBody<any>(projBRes.body);

      await request(app.getHttpServer())
        .post(api(`/estimates/projects/${projectB.id}/calculate`))
        .set('Authorization', `Bearer ${ownerBToken}`)
        .expect(201);

      await prisma.estimateProject.update({
        where: { id: projectB.id },
        data: { status: EstimateProjectStatus.ACCEPTED },
      });

      const convertBRes = await request(app.getHttpServer())
        .post(api(`/estimates/projects/${projectB.id}/convert`))
        .set('Authorization', `Bearer ${ownerBToken}`)
        .send({ mode: 'single' })
        .expect(201);
      const intIdB = unwrapBody<any>(convertBRes.body).intervention.id;

      await prisma.intervention.update({
        where: { id: intIdB },
        data: { status: 'COMPLETED' },
      });

      const invBRes = await request(app.getHttpServer())
        .post(api('/fsm/invoices'))
        .set('Authorization', `Bearer ${ownerBToken}`)
        .send({ interventionId: intIdB })
        .expect(201);
      const invoiceB = unwrapBody<any>(invBRes.body);

      expect(Number(invoiceB.tvaRate)).toBe(0);
      expect(Number(invoiceB.tvaAmount)).toBe(0);
    });
  });
});
