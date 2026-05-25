# companii-api

Faber Companii — isolated B2B/B2C multi-tenant API (NestJS + Prisma + PostgreSQL RLS).

## Quick start

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d
npm install
npx prisma migrate dev
npm run seed
npm run start:dev
```

API: `http://localhost:4100/api/v1` — health: `/api/v1/health`

## Modules

- `auth` — JWT, register COMPANY_STAFF / END_CLIENT / PLATFORM_ADMIN
- `companies` — tenant CRUD, waitlist, team invites
- `packages` — service packages + public booking
- `fsm` — customers, interventions, calendar, quotes, invoices
- `portal` — B2C client dashboard
- `subscriptions` — CompanyPlan FREE/PRO/BUSINESS
- `admin` — verify companies, stats
- `payments` — COMPANY_SUBSCRIPTION checkout stub

## RLS

Use `PrismaService.withRlsContext()` for tenant-scoped transactions. Session vars: `app.current_user_id`, `app.current_company_id`, etc.
