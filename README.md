<div align="center">

**Language:** **English** · [Русский](README.ru.md)

# Faber Companii — API

**Multi-tenant B2B/B2C platform backend for service companies in Moldova**

NestJS · Prisma · PostgreSQL RLS · Redis · BullMQ

[![Node](https://img.shields.io/badge/Node-%3E%3D20-339933?logo=node.js&logoColor=white)](package.json)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io)

[Quick start](#quick-start) · [Architecture](#architecture) · [Modules](#domain-modules) · [API map](#api-map) · [Security](#security-and-multi-tenancy)

</div>

---

## What is this project?

**Faber Companii** is the backend for a platform that connects service companies (construction, plumbing, HVAC, IT, and more) with their end clients in a single ecosystem.

The platform serves three audiences at once:

| Audience | System role | What they get |
|----------|-------------|---------------|
| **Service company** | `COMPANY_STAFF` | CRM, FSM (jobs, calendar, quotes, invoices), estimates, team management, public profile |
| **End client** | `END_CLIENT` | Client portal: requests, estimates, quotes, invoices, payments |
| **Platform admin** | `PLATFORM_ADMIN` | Company moderation, reference data, analytics, estimate blueprints |

The frontend lives in a separate repository: **[companii-web](../companii-web)**. The API is the single source of truth for data, authorization, and business logic.

---

## System overview

```mermaid
flowchart TB
    subgraph Clients["Clients"]
        WEB["companii-web<br/>React + Vite"]
        TG["Telegram Bot"]
    end

    subgraph API["companii-api :4100"]
        direction TB
        HTTP["REST /api/v1"]
        SSE["SSE /notifications/stream"]
        WH["Webhooks"]
        HTTP --> Guards["JWT + Roles + CompanyGuard"]
        Guards --> RLS["RLS Interceptor"]
        RLS --> Modules["19 domain modules"]
        Modules --> Queue["BullMQ Workers"]
    end

    subgraph Data["Infrastructure"]
        PG[("PostgreSQL 18<br/>Row Level Security")]
        RD[("Redis 7<br/>cache · sessions · queues")]
        B2[("Backblaze B2<br/>files prod")]
        SMTP["SMTP<br/>email"]
    end

    WEB -->|"Bearer JWT + x-company-id<br/>httpOnly refresh cookie"| HTTP
    WEB --> SSE
    TG --> WH
    Modules --> PG
    Modules --> RD
    Queue --> RD
    Modules --> B2
    Modules --> SMTP
```

---

## Architecture

### Application layers

The project uses a **hybrid NestJS + Hexagonal (Clean) Architecture**. The degree of separation varies by module — the most complex domains (estimates, payments) use full ports and adapters.

```mermaid
flowchart LR
    subgraph Presentation["Presentation"]
        C["Controllers"]
        DTO["DTO + Validation"]
    end

    subgraph Application["Application"]
        UC["Use Cases"]
        CMD["Commands / Queries"]
    end

    subgraph Domain["Domain"]
        ENT["Entities"]
        PORT["Ports (interfaces)"]
        SVC["Domain Services"]
    end

    subgraph Infrastructure["Infrastructure"]
        REPO["Prisma Repositories"]
        PDF["PDF / Email"]
        EXT["S3 / Telegram"]
    end

    C --> UC
    UC --> PORT
    PORT --> REPO
    REPO --> PG[("PostgreSQL")]
```

| Layer | Location | Examples |
|-------|----------|----------|
| **Presentation** | `*.controller.ts`, `dto/` | `auth.controller.ts`, `fsm-interventions.controller.ts` |
| **Application** | `use-cases/`, `application/commands` | `login.use-case.ts`, `generate-quote.use-case.ts` |
| **Domain** | `domain/ports/`, `domain/entities/` | `estimate-project.repository.port.ts` |
| **Infrastructure** | `infrastructure/persistence/` | `prisma-estimate-project.repository.ts` |
| **Cross-cutting** | `src/common/` | guards, interceptors, RLS, errors |

### HTTP request flow

```mermaid
sequenceDiagram
    participant Client as companii-web
    participant Guard as JwtAuthGuard
    participant RLS as RlsInterceptor
    participant Ctrl as Controller
    participant Prisma as PrismaService
    participant DB as PostgreSQL

    Client->>Guard: Authorization: Bearer + x-company-id
    Guard->>Guard: Validate JWT, roles
    Guard->>RLS: req.user
    RLS->>Prisma: withRlsContext(user, companyId)
    Prisma->>DB: BEGIN + set_config(app.current_*)
    Ctrl->>Prisma: business query
    Prisma->>DB: SELECT ... (RLS policies)
    DB-->>Client: JSON response
```

---

## Domain modules

19 modules plus shared infrastructure. Registration: `src/app.module.ts`.

```mermaid
mindmap
  root((companii-api))
    Core
      auth
      companies
      subscriptions
      consent
    Operations
      fsm
      estimates
      portal
      portal-invitation
    Platform
      admin
      audit
      reviews
      seo
    Integrations
      payments
      files
      email
      notifications
    Utilities
      end-client-link
      web-vitals
      shared
```

| Module | Purpose |
|--------|---------|
| **auth** | Registration, JWT, refresh rotation, password reset, email verification |
| **companies** | Company profile, public pages, booking, team, waitlist |
| **fsm** | CRM: leads → jobs → quotes → invoices, calendar, crews, analytics |
| **estimates** | Estimate projects, pricing engine, PDF, actuals, category blueprints |
| **portal** | Client dashboard for `END_CLIENT` |
| **subscriptions** | FREE / PRO / BUSINESS plans |
| **payments** | Subscription checkout, HMAC webhook |
| **admin** | Moderation, reference data, statistics |
| **files** | Upload (local dev / Backblaze B2 prod) |
| **email** | SMTP + email templates |
| **notifications** | In-app + Telegram via BullMQ |
| **reviews** | Company reviews |
| **audit** | HTTP action audit log |
| **consent** | GDPR consents |
| **seo** | URLs for frontend sitemap |
| **shared** | Prisma, Redis, Cache, Queue, Maintenance |

### FSM + Estimates business flow

```mermaid
flowchart LR
    subgraph Public["Public storefront"]
        CAT["Company catalog"]
        REQ["Website request"]
    end

    subgraph Company["Company cabinet"]
        LEAD["Lead"]
        EST["Estimate"]
        QUOTE["Quote"]
        INT["Job"]
        INV["Invoice"]
    end

    subgraph Portal["Client portal"]
        VIEW["View"]
        ACCEPT["Accept quote"]
        PAY["Payment confirmation"]
    end

    CAT --> REQ --> LEAD
    LEAD -->|"convert"| INT
    LEAD --> EST
    EST -->|"generate-quote"| QUOTE
    QUOTE -->|"convert"| INT
    INT --> INV
    QUOTE --> VIEW
    EST --> VIEW
    INV --> PAY
    ACCEPT --> INT
```

---

## Security and multi-tenancy

### Three authorization levels

```mermaid
flowchart TD
    REQ["HTTP Request"] --> JWT["JwtAuthGuard<br/>all except @Public()"]
    JWT --> KIND{"AccountKind?"}
    KIND -->|PLATFORM_ADMIN| ADMIN["@Roles(PLATFORM_ADMIN)"]
    KIND -->|END_CLIENT| PORTAL["portal/* endpoints<br/>RLS via customer_id"]
    KIND -->|COMPANY_STAFF| CG["CompanyGuard<br/>@CompanyRoles(OWNER|MANAGER|MEMBER)"]
    CG --> RLS["PostgreSQL RLS<br/>company_id = tenant"]
```

### Row Level Security (RLS)

- **Tenant = Company** — most tables include `company_id`
- The app connects as the **`companii_app`** role (no BYPASSRLS)
- On each request, `RlsInterceptor` sets session variables:

| Variable | Purpose |
|----------|---------|
| `app.current_user_id` | User ID |
| `app.current_company_id` | Active company |
| `app.user_role` | `COMPANY_STAFF` / `END_CLIENT` / `PLATFORM_ADMIN` |
| `app.current_company_role` | `OWNER` / `MANAGER` / `MEMBER` |
| `app.current_customer_id` | For client portal access |

For `END_CLIENT`, `company_id` is cleared — access is granted via `app_owns_customer()` across all companies where the user is a portal client.

### Authentication

| Mechanism | Details |
|-----------|---------|
| Access token | JWT Bearer, TTL `15m`, fields: `sub`, `accountKind`, `activeCompanyId`, `companyRole`, `customerId` |
| Refresh token | 40-byte hex → SHA-256 in DB, rotation with 60s grace period |
| Refresh storage | httpOnly cookie `companii_refresh` or request body |
| Logout-all | Redis key `companii:auth:logout-since:{userId}` |
| Brute-force | 5 failed attempts → 15 min lockout (Redis) |

---

## Queues and background jobs

```mermaid
flowchart LR
    API["API Controller"] --> QS["QueueService"]
    QS --> RD[("Redis")]
    RD --> W1["estimate-calculate"]
    RD --> W2["estimate-pdf"]
    RD --> W3["estimate-email"]
    RD --> W4["invoice-pdf"]
    RD --> W5["estimate-convert"]
    RD --> W6["telegram"]
    W1 --> OUT["PDF / Email / Telegram"]
    W2 --> OUT
    W3 --> OUT
    W4 --> OUT
    W5 --> OUT
    W6 --> OUT
```

| Queue | Purpose |
|-------|---------|
| `estimate-calculate` | Recalculate estimate (pricing engine) |
| `estimate-pdf` | Generate estimate PDF |
| `estimate-email` | Send estimate to client |
| `invoice-pdf` | Invoice PDF |
| `estimate-convert` | Convert estimate to jobs |
| `telegram` | Telegram notifications |

Small jobs (< 40 lines) may run synchronously (`QUEUE_SMALL_THRESHOLD`).

---

## Data model (key entities)

```mermaid
erDiagram
    User ||--o{ CompanyMember : "member of"
    User ||--o{ Company : "owns"
    Company ||--o{ CompanyCustomer : "customers"
    Company ||--o{ CompanyLead : "leads"
    Company ||--o{ Intervention : "jobs"
    Company ||--o{ EstimateProject : "estimates"
    Company ||--|| CompanySubscription : "plan"

    CompanyLead ||--o| Intervention : "convert"
    Intervention ||--o| Quote : "quote"
    Intervention ||--o| CompanyInvoice : "invoice"
    EstimateProject ||--o{ EstimateStage : "stages"
    EstimateStage ||--o{ EstimateLine : "lines"
    EstimateProject ||--o| Quote : "generate"

    User {
        uuid id
        string email
        enum accountKind
    }
    Company {
        uuid id
        string slug
        enum verificationStatus
    }
    Intervention {
        uuid id
        enum status
    }
    EstimateProject {
        uuid id
        enum status
    }
```

**~50 Prisma models** — full schema: `prisma/schema.prisma`

---

## API map

**Base prefix:** `/api/v1`  
**Swagger (dev):** `/docs`  
**Health:** `GET /health`

| Prefix | Access | Main operations |
|--------|--------|-----------------|
| `/auth` | Public + Auth | register, login, refresh, forgot-password, me |
| `/companies` | Mixed | profile CRUD, catalog, booking, switch |
| `/companies/members` | CompanyGuard | team, invites, roles |
| `/fsm/customers` | CompanyGuard | CRM, CSV import |
| `/fsm/leads` | CompanyGuard | leads, convert |
| `/fsm/interventions` | CompanyGuard | jobs, photos, checklists |
| `/fsm/quotes` | CompanyGuard | quotes, PDF, send |
| `/fsm/invoices` | CompanyGuard | invoices, payment, PDF |
| `/fsm/calendar` | CompanyGuard | calendar |
| `/fsm/analytics` | CompanyGuard | dashboard |
| `/fsm/pipeline` | CompanyGuard | Kanban |
| `/estimates` | CompanyGuard | projects, calculate, PDF, actuals |
| `/portal` | END_CLIENT | dashboard, estimates, quotes, invoices |
| `/admin` | PLATFORM_ADMIN | moderation, reference data |
| `/subscriptions` | Auth | plans, claim-free |
| `/payments` | OWNER / Public webhook | checkout, webhook |
| `/files` | Auth | upload, download |
| `/notifications` | Auth | list, SSE stream, Telegram |
| `/reviews` | Mixed | public + create |
| `/seo/urls` | Public | sitemap URLs |

---

## Integrations

```mermaid
flowchart TB
    API["companii-api"]

    API --> B2["Backblaze B2<br/>S3-compatible<br/>public + private buckets"]
    API --> SMTP["SMTP / nodemailer<br/>Mailtrap in dev"]
    API --> TG["Telegram Bot<br/>webhook + BullMQ"]
    API --> PAY["Payment Provider<br/>webhook HMAC-SHA256"]
    API --> PDF["PDFKit<br/>estimates and invoices"]
```

| Integration | Dev | Production |
|-------------|-----|------------|
| **Files** | `./uploads` + ServeStatic | Backblaze B2, signed URLs |
| **Email** | Mailtrap sandbox | Production SMTP |
| **Telegram** | Optional | `TELEGRAM_BOT_TOKEN` |
| **Payments** | Stub checkout | Webhook by `externalId` |

---

## Quick start

### Local development

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d postgres redis
npm install
npx prisma migrate deploy
npm run seed
npm run start:dev
```

| Service | URL |
|---------|-----|
| API | http://localhost:4100/api/v1 |
| Health | http://localhost:4100/health |
| Swagger | http://localhost:4100/docs |
| Prisma Studio | http://localhost:5555 |
| PostgreSQL | `localhost:5433` |
| Redis | `localhost:6380` |

### Docker (full stack)

```bash
cp .env.docker.example .env.docker
npm run docker:dev:create
```

### Seed credentials

| Role | Email | Password |
|------|-------|----------|
| Platform Admin | `admin@companii.local` | `Admin12345!` |

> See `prisma/seed.ts` for demo companies and clients.

---

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP port | `4100` |
| `DATABASE_URL` | Runtime DB (`companii_app` role, RLS) | `postgresql://...@localhost:5433/companii` |
| `MIGRATION_DATABASE_URL` | Owner DB for migrations | `postgresql://postgres:...@localhost:5433/companii` |
| `REDIS_URL` | Redis | `redis://localhost:6380` |
| `JWT_SECRET` | JWT secret (≥32 chars) | — |
| `JWT_EXPIRES_IN` | Access token TTL | `15m` |
| `FRONTEND_URL` | CORS + email links | `http://localhost:5174` |
| `USE_HTTPONLY_COOKIE` | Refresh in cookie | `true` |
| `EMAIL_ENABLED` | SMTP | `true` |
| `FILES_UPLOAD_DIR` | Local files (dev) | `./uploads` |

Production: see `.env.production.example` — `B2_*`, `REDIS_PASSWORD`, `PAYMENTS_WEBHOOK_SECRET`.

---

## Repository structure

```
companii-api/
├── prisma/
│   ├── schema.prisma          # ~50 models
│   ├── migrations/            # SQL + RLS policies
│   ├── seed.ts
│   └── estimate-blueprints/   # estimate templates by category
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/                # guards, interceptors, RLS
│   ├── config/                # validation, winston, http
│   └── modules/
│       ├── auth/
│       ├── companies/
│       ├── fsm/
│       ├── estimates/         # hexagonal: domain/ports/infrastructure
│       ├── portal/
│       ├── admin/
│       ├── payments/
│       └── shared/            # prisma, redis, cache, queue
├── test/                      # unit + e2e (including RLS smoke)
├── docker-compose.dev.yml
├── docker-compose.prod.yml
└── Dockerfile                 # multi-stage: dev + production
```

---

## Scripts

```bash
npm run start:dev          # hot reload
npm run test               # unit tests
npm run test:e2e           # e2e (including RLS)
npm run prisma:migrate     # new migration
npm run seed               # demo data
npm run docker:studio      # Prisma Studio
npm run redis:cli          # Redis CLI
```

---

## Frontend integration

```mermaid
sequenceDiagram
    participant WEB as companii-web :5174
    participant VITE as Vite Proxy / nginx
    participant API as companii-api :4100

    WEB->>VITE: fetch /api/v1/fsm/customers
    VITE->>API: proxy → localhost:4100
    Note over WEB,API: Authorization: Bearer {accessToken}<br/>x-company-id: {activeCompanyId}<br/>Cookie: companii_refresh

    API-->>WEB: { data: [...], meta: { total } }

    WEB->>API: GET /api/v1/notifications/stream
    Note over WEB,API: Server-Sent Events (real-time)
```

Frontend: **[companii-web](../companii-web)** — React 19, TanStack Query, Zustand.

---

## Subscription plans

| Plan | Features |
|------|----------|
| **FREE** | Jobs, calendar, services, reviews |
| **PRO** | + CRM (customers, leads), worksheets |
| **BUSINESS** | + Pipeline, estimates, quotes, invoices |

Limits: `src/common/constants/plan-entitlements.constants.ts`

---

<div align="center">

**Faber Companii API** · Node ≥20 · UNLICENSED (private)

</div>
