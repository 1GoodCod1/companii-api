import 'dotenv/config';
import { type Prisma } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  PLAN_CATALOG,
  PLAN_CODES,
  PLAN_LIMITS,
  PLAN_MARKETING_FEATURES,
} from '../src/common/constants/plan-entitlements.constants';
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

async function main() {
  await withSeedRlsContext(prisma, async (tx) => {
    await seedPlans(tx);
    await seedCities(tx);
    await seedCategories(tx);
    await seedEstimateBlueprints(tx);
    await seedAdmin(tx);

    console.log('Seed OK', {
      adminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@companii.local',
      cities: CITIES.length,
      categories: CATEGORIES.length,
      plans: PLAN_CODES.length,
      estimateBlueprints: CATEGORIES.length,
    });
  });
}

async function seedPlans(tx: Prisma.TransactionClient) {
  for (const code of PLAN_CODES) {
    const catalog = PLAN_CATALOG[code];
    const limits = PLAN_LIMITS[code];
    await tx.companyPlan.upsert({
      where: { code },
      create: {
        code,
        name: catalog.name,
        price: catalog.price,
        maxTechnicians: limits.maxTechnicians,
        maxInterventionsPerMonth: limits.maxInterventionsPerMonth,
        features: PLAN_MARKETING_FEATURES[code],
      },
      update: {
        name: catalog.name,
        price: catalog.price,
        maxTechnicians: limits.maxTechnicians,
        maxInterventionsPerMonth: limits.maxInterventionsPerMonth,
        features: PLAN_MARKETING_FEATURES[code],
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

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
