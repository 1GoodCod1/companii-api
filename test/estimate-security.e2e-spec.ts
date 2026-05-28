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

describeE2e('Estimate Multi-Tenant & Security (e2e - Epic S)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cityId: string;
  let ownerAToken: string;
  let ownerBToken: string;
  let clientAToken: string;
  let clientBToken: string;
  let customerAId: string;
  let customerBId: string;
  let categoryId: string;
  let projectAId: string;
  let stageAId: string;
  let quoteAId: string;
  let interventionAId: string;
  let invoiceAId: string;

  const ownerAEmail = uniqueEmail('owner-sa');
  const ownerBEmail = uniqueEmail('owner-sb');
  const clientAEmail = uniqueEmail('client-sa');
  const clientBEmail = uniqueEmail('client-sb');
  const password = 'TestPass1!@#';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyE2eAppConfig(app);
    await app.init();

    prisma = app.get(PrismaService);

    const clientAPhone = `+3736${String(randomInt(1000000, 9999999))}`;
    const clientBPhone = `+3736${String(randomInt(1000000, 9999999))}`;

    // Get city
    const citiesRes = await request(app.getHttpServer()).get(api('/companies/cities')).expect(200);
    cityId = unwrapBody<Array<{ id: string }>>(citiesRes.body)[0]?.id;

    // --- SETUP COMPANY A ---
    await request(app.getHttpServer())
      .post(api('/auth/register'))
      .send({
        email: ownerAEmail,
        password,
        accountKind: 'COMPANY_STAFF',
        firstName: 'OwnerA',
        lastName: 'S',
        acceptTerms: true,
      })
      .expect(201);

    const ownerALogin = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: ownerAEmail, password, rememberMe: false })
      .expect(200);
    ownerAToken = unwrapBody<{ accessToken: string }>(ownerALogin.body).accessToken;

    const compARes = await request(app.getHttpServer())
      .post(api('/companies'))
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        name: `SA Co ${Date.now()}`,
        legalName: 'SA SRL',
        idno: String(Date.now()).padStart(13, '0').slice(-13),
        legalAddress: 'Str. Security A',
        cityId,
      })
      .expect(201);
    const companyA = unwrapBody<{ id: string }>(compARes.body);

    const businessPlan = await prisma.companyPlan.findUnique({ where: { code: 'BUSINESS' } });
    await prisma.companySubscription.updateMany({
      where: { companyId: companyA.id },
      data: { planId: businessPlan!.id },
    });

    // Relogin Owner A
    const ownerARelogin = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: ownerAEmail, password, rememberMe: false })
      .expect(200);
    ownerAToken = unwrapBody<{ accessToken: string }>(ownerARelogin.body).accessToken;

    // Create Customer A
    const custARes = await request(app.getHttpServer())
      .post(api('/fsm/customers'))
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        fullName: 'Client A',
        phone: clientAPhone,
        email: clientAEmail,
        address: 'Chisinau, MD A',
      })
      .expect(201);
    customerAId = unwrapBody<{ id: string }>(custARes.body).id;

    // Invite & register Customer A to portal
    const inviteARes = await request(app.getHttpServer())
      .post(api(`/companies/members/customers/${customerAId}/portal-invite`))
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(201);
    const inviteAToken = unwrapBody<{ token: string }>(inviteARes.body).token;

    await request(app.getHttpServer())
      .post(api('/auth/register'))
      .send({
        email: clientAEmail,
        password,
        accountKind: 'END_CLIENT',
        firstName: 'Client',
        lastName: 'A',
        phone: clientAPhone,
        acceptTerms: true,
      })
      .expect(201);

    const clientALogin = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: clientAEmail, password, rememberMe: false })
      .expect(200);
    clientAToken = unwrapBody<{ accessToken: string }>(clientALogin.body).accessToken;

    await request(app.getHttpServer())
      .post(api('/portal/invitations/accept'))
      .set('Authorization', `Bearer ${clientAToken}`)
      .send({ token: inviteAToken })
      .expect(201);

    // Get a category from the seeded ones
    const blueprintsRes = await request(app.getHttpServer())
      .get(api('/estimates/blueprints'))
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);
    const blueprintList = unwrapBody<Array<{ categoryId: string }>>(blueprintsRes.body);
    categoryId = blueprintList[0]?.categoryId;

    // Create Estimate Project A
    const projARes = await request(app.getHttpServer())
      .post(api('/estimates/projects'))
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        customerId: customerAId,
        categoryId,
        title: 'Project A',
        siteType: 'apartment',
        address: 'Str. Test A',
      })
      .expect(201);
    projectAId = unwrapBody<{ id: string }>(projARes.body).id;

    // Calculate to generate stages & lines
    const calcARes = await request(app.getHttpServer())
      .post(api(`/estimates/projects/${projectAId}/calculate`))
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(201);
    const fullProjA = unwrapBody<any>(calcARes.body);
    stageAId = fullProjA.stages[0]?.id;

    // Generate Quote for A
    const quoteARes = await request(app.getHttpServer())
      .post(api(`/estimates/projects/${projectAId}/generate-quote`))
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(201);
    quoteAId = unwrapBody<{ id: string }>(quoteARes.body).id;

    // Transition project to ACCEPTED
    await prisma.estimateProject.update({
      where: { id: projectAId },
      data: { status: EstimateProjectStatus.ACCEPTED },
    });

    // Convert to Intervention A
    const convertARes = await request(app.getHttpServer())
      .post(api(`/estimates/projects/${projectAId}/convert`))
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ mode: 'single' })
      .expect(201);
    interventionAId = unwrapBody<{ intervention: { id: string } }>(convertARes.body).intervention.id;

    // Create Invoice for A
    const invNumber = `INV-${Date.now()}`;
    const invoiceA = await prisma.companyInvoice.create({
      data: {
        companyId: companyA.id,
        interventionId: interventionAId,
        number: invNumber,
        amount: 1000,
        tvaAmount: 200,
        tvaRate: 20,
        paymentStatus: 'UNPAID',
      },
    });
    invoiceAId = invoiceA.id;


    // --- SETUP COMPANY B ---
    await request(app.getHttpServer())
      .post(api('/auth/register'))
      .send({
        email: ownerBEmail,
        password,
        accountKind: 'COMPANY_STAFF',
        firstName: 'OwnerB',
        lastName: 'S',
        acceptTerms: true,
      })
      .expect(201);

    const ownerBLogin = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: ownerBEmail, password, rememberMe: false })
      .expect(200);
    ownerBToken = unwrapBody<{ accessToken: string }>(ownerBLogin.body).accessToken;

    const compBRes = await request(app.getHttpServer())
      .post(api('/companies'))
      .set('Authorization', `Bearer ${ownerBToken}`)
      .send({
        name: `SB Co ${Date.now()}`,
        legalName: 'SB SRL',
        idno: String(Date.now()).padStart(13, '0').slice(-13),
        legalAddress: 'Str. Security B',
        cityId,
      })
      .expect(201);
    const companyB = unwrapBody<{ id: string }>(compBRes.body);

    await prisma.companySubscription.updateMany({
      where: { companyId: companyB.id },
      data: { planId: businessPlan!.id },
    });

    // Relogin Owner B
    const ownerBRelogin = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: ownerBEmail, password, rememberMe: false })
      .expect(200);
    ownerBToken = unwrapBody<{ accessToken: string }>(ownerBRelogin.body).accessToken;

    // Create Customer B
    const custBRes = await request(app.getHttpServer())
      .post(api('/fsm/customers'))
      .set('Authorization', `Bearer ${ownerBToken}`)
      .send({
        fullName: 'Client B',
        phone: clientBPhone,
        email: clientBEmail,
        address: 'Chisinau, MD B',
      })
      .expect(201);
    customerBId = unwrapBody<{ id: string }>(custBRes.body).id;

    // Invite & register Customer B to portal
    const inviteBRes = await request(app.getHttpServer())
      .post(api(`/companies/members/customers/${customerBId}/portal-invite`))
      .set('Authorization', `Bearer ${ownerBToken}`)
      .expect(201);
    const inviteBToken = unwrapBody<{ token: string }>(inviteBRes.body).token;

    await request(app.getHttpServer())
      .post(api('/auth/register'))
      .send({
        email: clientBEmail,
        password,
        accountKind: 'END_CLIENT',
        firstName: 'Client',
        lastName: 'B',
        phone: clientBPhone,
        acceptTerms: true,
      })
      .expect(201);

    const clientBLogin = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: clientBEmail, password, rememberMe: false })
      .expect(200);
    clientBToken = unwrapBody<{ accessToken: string }>(clientBLogin.body).accessToken;

    await request(app.getHttpServer())
      .post(api('/portal/invitations/accept'))
      .set('Authorization', `Bearer ${clientBToken}`)
      .send({ token: inviteBToken })
      .expect(201);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('S-02 & S-07 · Cross-Tenant Multi-Tenant Isolation Negative Tests', () => {
    it('Owner B cannot GET Estimate Project A', async () => {
      await request(app.getHttpServer())
        .get(api(`/estimates/projects/${projectAId}`))
        .set('Authorization', `Bearer ${ownerBToken}`)
        .expect(404);
    });

    it('Owner B cannot UPDATE Estimate Project A', async () => {
      await request(app.getHttpServer())
        .patch(api(`/estimates/projects/${projectAId}`))
        .set('Authorization', `Bearer ${ownerBToken}`)
        .send({ title: 'Hacked title' })
        .expect(404);
    });

    it('Owner B cannot DELETE Estimate Project A', async () => {
      await request(app.getHttpServer())
        .delete(api(`/estimates/projects/${projectAId}`))
        .set('Authorization', `Bearer ${ownerBToken}`)
        .expect(404);
    });

    it('Owner B cannot add estimate line to Stage A', async () => {
      await request(app.getHttpServer())
        .post(api(`/estimates/projects/${projectAId}/stages/${stageAId}/lines`))
        .set('Authorization', `Bearer ${ownerBToken}`)
        .send({
          description: 'Hacked line',
          qty: 1,
          unit: 'buc',
          unitPrice: 1000,
        })
        .expect(404);
    });

    it('Owner B cannot convert Estimate Project A to interventions', async () => {
      await request(app.getHttpServer())
        .post(api(`/estimates/projects/${projectAId}/convert`))
        .set('Authorization', `Bearer ${ownerBToken}`)
        .send({ mode: 'single' })
        .expect(404);
    });

    it('Owner B cannot view Intervention A', async () => {
      await request(app.getHttpServer())
        .get(api(`/fsm/interventions/${interventionAId}`))
        .set('Authorization', `Bearer ${ownerBToken}`)
        .expect(404);
    });

    it('Client B cannot view Estimate Project A via Portal', async () => {
      await request(app.getHttpServer())
        .get(api(`/portal/estimates/${projectAId}`))
        .set('Authorization', `Bearer ${clientBToken}`)
        .expect(404);
    });

    it('Client B cannot ACCEPT Estimate Project A via Portal', async () => {
      await request(app.getHttpServer())
        .post(api(`/portal/estimates/${projectAId}/status`))
        .set('Authorization', `Bearer ${clientBToken}`)
        .send({ status: 'ACCEPTED' })
        .expect(404);
    });

    it('Client B cannot view Invoice A via Portal', async () => {
      await request(app.getHttpServer())
        .get(api(`/portal/invoices/${invoiceAId}`))
        .set('Authorization', `Bearer ${clientBToken}`)
        .expect(404);
    });

    it('Client B cannot view Quote A via Portal', async () => {
      await request(app.getHttpServer())
        .get(api(`/portal/quotes/${quoteAId}`))
        .set('Authorization', `Bearer ${clientBToken}`)
        .expect(404);
    });
  });
});
