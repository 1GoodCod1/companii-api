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
import {
  buildBlueprintConfig,
  buildBlueprintName,
  categoryHasEstimateBlueprint,
} from './estimate-blueprints';
import {
  ESTIMATE_EXCLUDED_CATEGORY_SLUGS,
  EXPECTED_ESTIMATE_BLUEPRINT_COUNT,
} from '../src/common/constants/estimate-category-slugs.constants';

const SEED_TERMS_VERSION = '2026-05-25';

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL or MIGRATION_DATABASE_URL required');

const pool = new Pool({ connectionString: url });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type CatalogTranslation = { ro: { name: string }; ru: { name: string } };

type CitySeed = { name: string; slug: string; translations: CatalogTranslation };
type CategorySeed = { name: string; slug: string; translations: CatalogTranslation };

const CITIES: CitySeed[] = [
  {
    name: 'Chișinău',
    slug: 'chisinau',
    translations: { ro: { name: 'Chișinău' }, ru: { name: 'Кишинёв' } },
  },
  {
    name: 'Bălți',
    slug: 'balti',
    translations: { ro: { name: 'Bălți' }, ru: { name: 'Бельцы' } },
  },
  {
    name: 'Cahul',
    slug: 'cahul',
    translations: { ro: { name: 'Cahul' }, ru: { name: 'Кагул' } },
  },
  {
    name: 'Comrat',
    slug: 'comrat',
    translations: { ro: { name: 'Comrat' }, ru: { name: 'Комрат' } },
  },
  {
    name: 'Ungheni',
    slug: 'ungeni',
    translations: { ro: { name: 'Ungheni' }, ru: { name: 'Унгены' } },
  },
  {
    name: 'Orhei',
    slug: 'orhei',
    translations: { ro: { name: 'Orhei' }, ru: { name: 'Орхей' } },
  },
  {
    name: 'Soroca',
    slug: 'soroca',
    translations: { ro: { name: 'Soroca' }, ru: { name: 'Сорока' } },
  },
  {
    name: 'Hîncești',
    slug: 'hincesti',
    translations: { ro: { name: 'Hîncești' }, ru: { name: 'Хынчешть' } },
  },
  {
    name: 'Florești',
    slug: 'floresti',
    translations: { ro: { name: 'Florești' }, ru: { name: 'Флорешть' } },
  },
  {
    name: 'Edineț',
    slug: 'edinet',
    translations: { ro: { name: 'Edineț' }, ru: { name: 'Единец' } },
  },
  {
    name: 'Strășeni',
    slug: 'straseni',
    translations: { ro: { name: 'Strășeni' }, ru: { name: 'Стрэшень' } },
  },
  {
    name: 'Ceadîr-Lunga',
    slug: 'ceadir-lunga',
    translations: { ro: { name: 'Ceadîr-Lunga' }, ru: { name: 'Чадыр-Лунга' } },
  },
  {
    name: 'Taraclia',
    slug: 'taraclia',
    translations: { ro: { name: 'Taraclia' }, ru: { name: 'Тараклия' } },
  },
  {
    name: 'Cantemir',
    slug: 'cantemir',
    translations: { ro: { name: 'Cantemir' }, ru: { name: 'Кантемир' } },
  },
  {
    name: 'Căușeni',
    slug: 'causeni',
    translations: { ro: { name: 'Căușeni' }, ru: { name: 'Кэушень' } },
  },
  {
    name: 'Ialoveni',
    slug: 'ialoveni',
    translations: { ro: { name: 'Ialoveni' }, ru: { name: 'Яловены' } },
  },
  {
    name: 'Călărași',
    slug: 'calarasi',
    translations: { ro: { name: 'Călărași' }, ru: { name: 'Кэлэраш' } },
  },
  {
    name: 'Criuleni',
    slug: 'criuleni',
    translations: { ro: { name: 'Criuleni' }, ru: { name: 'Криулень' } },
  },
  {
    name: 'Briceni',
    slug: 'briceni',
    translations: { ro: { name: 'Briceni' }, ru: { name: 'Бричень' } },
  },
  {
    name: 'Anenii Noi',
    slug: 'anenii-noi',
    translations: { ro: { name: 'Anenii Noi' }, ru: { name: 'Анений-Ной' } },
  },
];

const CATEGORIES: CategorySeed[] = [
  {
    name: 'Instalații sanitare',
    slug: 'santehnika',
    translations: { ro: { name: 'Instalații sanitare' }, ru: { name: 'Сантехника' } },
  },
  {
    name: 'Electricitate',
    slug: 'elektrika',
    translations: { ro: { name: 'Electricitate' }, ru: { name: 'Электрика' } },
  },
  {
    name: 'Climatizare și încălzire',
    slug: 'clima',
    translations: { ro: { name: 'Climatizare și încălzire' }, ru: { name: 'Климатизация и отопление' } },
  },
  {
    name: 'Lucrări de finisaj',
    slug: 'lucrari-finisaj',
    translations: { ro: { name: 'Lucrări de finisaj' }, ru: { name: 'Отделочные работы' } },
  },
  {
    name: 'Acoperișuri',
    slug: 'acoperis',
    translations: { ro: { name: 'Acoperișuri' }, ru: { name: 'Кровля' } },
  },
  {
    name: 'Acoperișuri plate / terase',
    slug: 'acoperis-plat',
    translations: { ro: { name: 'Acoperișuri plate / terase' }, ru: { name: 'Плоская кровля / террасы' } },
  },
  {
    name: 'Fațade',
    slug: 'fatade',
    translations: { ro: { name: 'Fațade' }, ru: { name: 'Фасады' } },
  },
  {
    name: 'Ferestre și uși',
    slug: 'okna-dveri',
    translations: { ro: { name: 'Ferestre și uși' }, ru: { name: 'Окна и двери' } },
  },
  {
    name: 'Mobilier',
    slug: 'mobila',
    translations: { ro: { name: 'Mobilier' }, ru: { name: 'Мебель' } },
  },
  {
    name: 'Servicii de curățenie',
    slug: 'cleaning',
    translations: { ro: { name: 'Servicii de curățenie' }, ru: { name: 'Уборка и клининг' } },
  },
  {
    name: 'Servicii IT și Securitate',
    slug: 'it-networks',
    translations: { ro: { name: 'Servicii IT și Securitate' }, ru: { name: 'IT и безопасность' } },
  },
  {
    name: 'Reparații și deservire hardware IT',
    slug: 'it-hardware',
    translations: { ro: { name: 'Reparații și deservire hardware IT' }, ru: { name: 'Ремонт и обслуживание IT оборудования' } },
  },
  {
    name: 'Dezvoltare Web și Aplicații',
    slug: 'it-web',
    translations: { ro: { name: 'Dezvoltare Web și Aplicații' }, ru: { name: 'Веб-разработка и приложения' } },
  },
  {
    name: 'Panouri solare',
    slug: 'panouri-solare',
    translations: { ro: { name: 'Panouri solare' }, ru: { name: 'Солнечные панели' } },
  },
  {
    name: 'Construcții generale',
    slug: 'constructii',
    translations: { ro: { name: 'Construcții generale' }, ru: { name: 'Общее строительство' } },
  },
  {
    name: 'Pavaj și amenajări exterioare',
    slug: 'pavaj',
    translations: { ro: { name: 'Pavaj și amenajări exterioare' }, ru: { name: 'Мощение и благоустройство' } },
  },
  {
    name: 'SMM și publicitate',
    slug: 'smm-marketing',
    translations: { ro: { name: 'SMM și publicitate' }, ru: { name: 'SMM и реклама' } },
  },
  {
    name: 'Design grafic',
    slug: 'design-grafic',
    translations: { ro: { name: 'Design grafic' }, ru: { name: 'Графический дизайн' } },
  },
  {
    name: 'Frumusețe și îngrijire (machiaj, manichiură, pedichiură)',
    slug: 'frumusete-ingrijire',
    translations: {
      ro: { name: 'Frumusețe și îngrijire (machiaj, manichiură, pedichiură)' },
      ru: { name: 'Красота и уход (макияж, маникюр, педикюр)' },
    },
  },
  {
    name: 'Asigurări',
    slug: 'asigurari',
    translations: { ro: { name: 'Asigurări' }, ru: { name: 'Страхование' } },
  },
  {
    name: 'Servicii juridice',
    slug: 'servicii-juridice',
    translations: { ro: { name: 'Servicii juridice' }, ru: { name: 'Юридические услуги' } },
  },
  {
    name: 'Service auto',
    slug: 'avto',
    translations: { ro: { name: 'Service auto' }, ru: { name: 'Автосервис' } },
  },
];

async function main() {
  await withSeedRlsContext(prisma, async (tx) => {
    await seedPlans(tx);
    await seedCities(tx);
    await seedCategories(tx);
    await seedEstimateBlueprints(tx);
    await seedAdmin(tx);

    const estimateBlueprintCount = CATEGORIES.filter((c) =>
      categoryHasEstimateBlueprint(c.slug),
    ).length;

    console.log('Seed OK', {
      adminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@companii.local',
      cities: CITIES.length,
      categories: CATEGORIES.length,
      plans: PLAN_CODES.length,
      estimateBlueprints: estimateBlueprintCount,
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
      update: { name: city.name, translations: city.translations },
    });
  }
}

async function seedCategories(tx: Prisma.TransactionClient) {
  for (const category of CATEGORIES) {
    await tx.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: { name: category.name, translations: category.translations },
    });
  }
}

async function seedEstimateBlueprints(tx: Prisma.TransactionClient) {
  let seededCount = 0;
  for (const category of CATEGORIES) {
    if (!categoryHasEstimateBlueprint(category.slug)) continue;
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
    seededCount += 1;
  }

  if (seededCount !== EXPECTED_ESTIMATE_BLUEPRINT_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_ESTIMATE_BLUEPRINT_COUNT} estimate blueprints, seeded ${seededCount}`,
    );
  }

  for (const slug of ESTIMATE_EXCLUDED_CATEGORY_SLUGS) {
    if (categoryHasEstimateBlueprint(slug)) {
      throw new Error(`Excluded category "${slug}" must not have an estimate blueprint`);
    }
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
