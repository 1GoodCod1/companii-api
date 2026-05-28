/**
 * Team role matrix E2E — requires DATABASE_URL and seeded cities/plans.
 * Run: npm run test:e2e
 */
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

describeE2e('Team access (e2e)', () => {
  let app: INestApplication;
  let cityId: string;
  let ownerToken: string;
  let memberToken: string;
  let memberId: string;

  const ownerEmail = uniqueEmail('owner');
  const memberEmail = uniqueEmail('member');
  const password = 'TestPass1!@#';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyE2eAppConfig(app);
    await app.init();

    const citiesRes = await request(app.getHttpServer()).get(api('/companies/cities')).expect(200);
    const cities = unwrapBody<Array<{ id: string }>>(citiesRes.body);
    cityId = cities[0]?.id;
    if (!cityId) {
      throw new Error('E2E requires seeded cities — run prisma seed');
    }

    await request(app.getHttpServer())
      .post(api('/auth/register'))
      .send({
        email: ownerEmail,
        password,
        accountKind: 'COMPANY_STAFF',
        firstName: 'Owner',
        lastName: 'E2E',
        acceptTerms: true,
      })
      .expect(201);

    const ownerLogin = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: ownerEmail, password, rememberMe: false })
      .expect(200);
    ownerToken = unwrapBody<{ accessToken: string }>(ownerLogin.body).accessToken;

    await request(app.getHttpServer())
      .post(api('/companies'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `E2E Co ${Date.now()}`,
        legalName: 'E2E SRL',
        idno: String(Date.now()).padStart(13, '0').slice(-13),
        legalAddress: 'Str. Test 1',
        cityId,
      })
      .expect(201);

    // Upgrade subscription to BUSINESS plan so that all feature checks (estimates, customers, etc.) pass
    const prisma = app.get(PrismaService);
    const businessPlan = await prisma.companyPlan.findUnique({ where: { code: 'BUSINESS' } });
    const ownerUser = await prisma.user.findUnique({ where: { email: ownerEmail } });
    await prisma.companySubscription.updateMany({
      where: { company: { ownerUserId: ownerUser!.id } },
      data: { planId: businessPlan!.id },
    });

    const ownerRelogin = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: ownerEmail, password, rememberMe: false })
      .expect(200);
    ownerToken = unwrapBody<{ accessToken: string }>(ownerRelogin.body).accessToken;

    await request(app.getHttpServer())
      .post(api('/auth/register'))
      .send({
        email: memberEmail,
        password,
        accountKind: 'COMPANY_STAFF',
        firstName: 'Tech',
        lastName: 'E2E',
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
    const memberSession = unwrapBody<{
      accessToken: string;
      user: { memberId?: string };
    }>(memberLogin.body);
    memberToken = memberSession.accessToken;
    memberId = memberSession.user.memberId ?? '';
  });

  afterAll(async () => {
    await app?.close();
  });

  it('MEMBER cannot list FSM customers', async () => {
    await request(app.getHttpServer())
      .get(api('/fsm/customers'))
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
  });

  it('OWNER can list FSM customers', async () => {
    await request(app.getHttpServer())
      .get(api('/fsm/customers'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
  });

  it('MEMBER members list returns only self', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/companies/members/list'))
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    const members = unwrapBody<Array<{ id: string }>>(res.body);
    expect(members).toHaveLength(1);
    expect(members[0]?.id).toBe(memberId);
  });

  it('OWNER cannot invite another OWNER role', async () => {
    await request(app.getHttpServer())
      .post(api('/companies/members/invite-link'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'OWNER' })
      .expect(400);
  });

  it('MEMBER can leave company', async () => {
    const res = await request(app.getHttpServer())
      .post(api('/companies/members/leave'))
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(201);

    const body = unwrapBody<{ accessToken?: string; success?: boolean }>(res.body);
    expect(body.accessToken || body.success).toBeDefined();
  });
});
