import 'dotenv/config';
import { PrismaClient, CompanySubscriptionPlan, type Prisma } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { withSeedRlsContext } from './seed-rls';
import { buildBlueprintConfig, buildBlueprintName } from './estimate-blueprints';

const SEED_TERMS_VERSION = '2026-05-25';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL required');

const pool = new Pool({ connectionString: url });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const CITIES: { name: string; slug: string }[] = [
  { name: 'Chișinău', slug: 'chisinau' },
  { name: 'Bălți', slug: 'balti' },
  { name: 'Cahul', slug: 'cahul' },
  { name: 'Comrat', slug: 'comrat' },
  { name: 'Ungheni', slug: 'ungeni' },
  { name: 'Orhei', slug: 'orhei' },
  { name: 'Soroca', slug: 'soroca' },
  { name: 'Hîncești', slug: 'hincesti' },
  { name: 'Florești', slug: 'floresti' },
  { name: 'Edineț', slug: 'edinet' },
  { name: 'Strășeni', slug: 'straseni' },
  { name: 'Ceadîr-Lunga', slug: 'ceadir-lunga' },
  { name: 'Taraclia', slug: 'taraclia' },
  { name: 'Cantemir', slug: 'cantemir' },
  { name: 'Căușeni', slug: 'causeni' },
  { name: 'Ialoveni', slug: 'ialoveni' },
  { name: 'Călărași', slug: 'calarasi' },
  { name: 'Criuleni', slug: 'criuleni' },
  { name: 'Briceni', slug: 'briceni' },
  { name: 'Anenii Noi', slug: 'anenii-noi' },
];

const CATEGORIES: { name: string; slug: string }[] = [
  { name: 'Instalații sanitare', slug: 'santehnika' },
  { name: 'Electricitate', slug: 'elektrika' },
  { name: 'Climatizare și încălzire', slug: 'clima' },
  { name: 'Lucrări de finisaj', slug: 'lucrari-finisaj' },
  { name: 'Acoperișuri', slug: 'acoperis' },
  { name: 'Fațade', slug: 'fatade' },
  { name: 'Ferestre și uși', slug: 'okna-dveri' },
  { name: 'Mobilier', slug: 'mobila' },
  { name: 'Servicii de curățenie', slug: 'cleaning' },
  { name: 'Servicii IT și Securitate', slug: 'it-networks' },
  { name: 'Panouri solare', slug: 'panouri-solare' },
  { name: 'Construcții generale', slug: 'constructii' },
  { name: 'Pavaj și amenajări exterioare', slug: 'pavaj' },
];

const PLANS: {
  code: CompanySubscriptionPlan;
  name: string;
  price: number;
  maxTech?: number;
  maxInt?: number;
  features: string[];
}[] = [
  {
    code: 'FREE',
    name: 'Free',
    price: 0,
    maxTech: 1,
    maxInt: 20,
    features: [
      'Profil companie public',
      '1 tehnician activ',
      'Până la 20 intervenții / lună',
      'Catalog pachete servicii',
      'Suport email',
    ],
  },
  {
    code: 'PRO',
    name: 'Pro',
    price: 499,
    maxTech: 10,
    maxInt: 150,
    features: [
      'Tot ce include Free',
      'Până la 10 tehnicieni',
      'Până la 150 intervenții / lună',
      'Clienți, calendar, lucrări',
      'Portal clienți securizat',
      'Istoric status intervenții',
    ],
  },
  {
    code: 'BUSINESS',
    name: 'Business',
    price: 999,
    features: [
      'Tot ce include Pro',
      'Tehnicieni nelimitați',
      'Intervenții nelimitate',
      'Oferte comerciale (devize)',
      'Facturi fiscale cu TVA',
      'Export date & rapoarte',
      'Suport prioritar',
    ],
  },
];

async function main() {
  await withSeedRlsContext(prisma, async (tx) => {
    await seedPlans(tx);
    await seedCities(tx);
    await seedCategories(tx);
    await seedEstimateBlueprints(tx);
    await seedAdmin(tx);
    await seedDemoOwner(tx);

    const freePlan = await tx.companyPlan.findUnique({ where: { code: 'FREE' } });
    if (!freePlan) throw new Error('FREE plan not seeded');

    console.log('Seed OK', {
      adminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@companii.local',
      demoOwnerEmail: process.env.SEED_DEMO_OWNER_EMAIL ?? 'owner@demo.local',
      demoOwnerPassword: process.env.SEED_DEMO_OWNER_PASSWORD ?? 'Demo12345!',
      cities: CITIES.length,
      categories: CATEGORIES.length,
      plans: PLANS.length,
      estimateBlueprints: CATEGORIES.length,
    });
  });
}

async function seedPlans(tx: Prisma.TransactionClient) {
  for (const p of PLANS) {
    await tx.companyPlan.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        name: p.name,
        price: p.price,
        maxTechnicians: p.maxTech,
        maxInterventionsPerMonth: p.maxInt,
        features: p.features,
      },
      update: {
        name: p.name,
        price: p.price,
        maxTechnicians: p.maxTech,
        maxInterventionsPerMonth: p.maxInt,
        features: p.features,
      },
    });
  }
}

async function seedCities(tx: Prisma.TransactionClient) {
  for (const city of CITIES) {
    await tx.city.upsert({
      where: { slug: city.slug },
      create: city,
      update: { name: city.name },
    });
  }
}

async function seedCategories(tx: Prisma.TransactionClient) {
  for (const category of CATEGORIES) {
    await tx.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: { name: category.name },
    });
  }
}

async function seedEstimateBlueprints(tx: Prisma.TransactionClient) {
  for (const category of CATEGORIES) {
    const row = await tx.category.findUnique({ where: { slug: category.slug } });
    if (!row) continue;
    const config = buildBlueprintConfig(category);
    await tx.estimateBlueprint.upsert({
      where: { categoryId: row.id },
      create: {
        categoryId: row.id,
        name: buildBlueprintName(category.name),
        config: config as unknown as Prisma.InputJsonValue,
      },
      update: {
        name: buildBlueprintName(category.name),
        config: config as unknown as Prisma.InputJsonValue,
        isActive: true,
      },
    });
  }
}

async function seedAdmin(tx: Prisma.TransactionClient) {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@companii.local';
  const hash = await argon2.hash(process.env.SEED_ADMIN_PASSWORD ?? 'Admin12345!', {
    type: argon2.argon2id,
  });

  await tx.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash: hash,
      accountKind: 'PLATFORM_ADMIN',
      firstName: 'Platform',
      lastName: 'Admin',
    },
    update: {},
  });
}

async function seedDemoOwner(tx: Prisma.TransactionClient) {
  const email = (process.env.SEED_DEMO_OWNER_EMAIL ?? 'owner@demo.local').toLowerCase();
  const password = process.env.SEED_DEMO_OWNER_PASSWORD ?? 'Demo12345!';
  const hash = await argon2.hash(password, { type: argon2.argon2id });

  const user = await tx.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash: hash,
      accountKind: 'COMPANY_STAFF',
      firstName: 'Demo',
      lastName: 'Owner',
      termsAcceptedAt: new Date(),
      termsVersion: SEED_TERMS_VERSION,
    },
    update: {},
  });

  const existingCompany = await tx.company.findFirst({
    where: { ownerUserId: user.id },
  });
  if (existingCompany) return;

  const chisinau = await tx.city.findUnique({ where: { slug: 'chisinau' } });
  const category = await tx.category.findUnique({ where: { slug: 'santehnika' } });
  const freePlan = await tx.companyPlan.findUnique({ where: { code: 'FREE' } });
  if (!chisinau || !freePlan) throw new Error('Demo owner seed prerequisites missing');

  const company = await tx.company.create({
    data: {
      slug: 'demo-service',
      ownerUserId: user.id,
      name: 'Demo Service SRL',
      legalName: 'Demo Service SRL',
      idno: '1000000000123',
      legalAddress: 'str. Demo 1, Chișinău',
      cityId: chisinau.id,
      categoryId: category?.id,
      contactEmail: email,
      contactPhone: '+37360000000',
      showPublicPhone: true,
      showPublicEmail: true,
      description: 'Companie demo pentru testarea cabinetului manager.',
      isPublished: true,
    },
  });

  await tx.companyMember.create({
    data: {
      companyId: company.id,
      userId: user.id,
      role: 'OWNER',
      status: 'ACTIVE',
      joinedAt: new Date(),
    },
  });

  await tx.companySubscription.create({
    data: {
      companyId: company.id,
      planId: freePlan.id,
      status: 'TRIAL',
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
