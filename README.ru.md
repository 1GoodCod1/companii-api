<div align="center">

**Language:** [English](README.md) · **Русский**

# Faber Companii — API

**Мультитенантная B2B/B2C платформа для сервисных компаний Молдовы**

NestJS · Prisma · PostgreSQL RLS · Redis · BullMQ

[![Node](https://img.shields.io/badge/Node-%3E%3D20-339933?logo=node.js&logoColor=white)](package.json)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io)

[Быстрый старт](#-быстрый-старт) · [Архитектура](#-архитектура) · [Модули](#-доменные-модули) · [API](#-карта-api) · [Безопасность](#-безопасность-и-мультитенантность)

</div>

---

## Что это за проект?

**Faber Companii** — изолированный backend для платформы, которая объединяет сервисные компании (строительство, сантехника, IT, климат и др.) и их конечных клиентов в единой экосистеме.

Платформа решает три задачи одновременно:

| Аудитория | Роль в системе | Что получает |
|-----------|----------------|--------------|
| **Сервисная компания** | `COMPANY_STAFF` | CRM, FSM (работы, календарь, оферты, счета), сметы, команда, публичный профиль |
| **Конечный клиент** | `END_CLIENT` | Личный портал: заявки, сметы, оферты, счета, оплата |
| **Администратор платформы** | `PLATFORM_ADMIN` | Модерация компаний, справочники, аналитика, blueprints смет |

Фронтенд живёт в отдельном репозитории **[companii-web](../companii-web)**. API — единственный источник правды для данных, авторизации и бизнес-логики.

---

## Общая схема системы

```mermaid
flowchart TB
    subgraph Clients["Клиенты"]
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
        RLS --> Modules["19 доменных модулей"]
        Modules --> Queue["BullMQ Workers"]
    end

    subgraph Data["Инфраструктура"]
        PG[("PostgreSQL 18<br/>Row Level Security")]
        RD[("Redis 7<br/>кэш · сессии · очереди")]
        B2[("Backblaze B2<br/>файлы prod")]
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

## Архитектура

### Слои приложения

Проект использует **гибрид NestJS + Hexagonal (Clean) Architecture**. Степень «чистоты» разная по модулям — самые сложные домены (сметы, платежи) выделены в полноценные порты и адаптеры.

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

| Слой | Расположение | Примеры |
|------|--------------|---------|
| **Presentation** | `*.controller.ts`, `dto/` | `auth.controller.ts`, `fsm-interventions.controller.ts` |
| **Application** | `use-cases/`, `application/commands` | `login.use-case.ts`, `generate-quote.use-case.ts` |
| **Domain** | `domain/ports/`, `domain/entities/` | `estimate-project.repository.port.ts` |
| **Infrastructure** | `infrastructure/persistence/` | `prisma-estimate-project.repository.ts` |
| **Cross-cutting** | `src/common/` | guards, interceptors, RLS, errors |

### Поток HTTP-запроса

```mermaid
sequenceDiagram
    participant Client as companii-web
    participant Guard as JwtAuthGuard
    participant RLS as RlsInterceptor
    participant Ctrl as Controller
    participant Prisma as PrismaService
    participant DB as PostgreSQL

    Client->>Guard: Authorization: Bearer + x-company-id
    Guard->>Guard: Валидация JWT, роли
    Guard->>RLS: req.user
    RLS->>Prisma: withRlsContext(user, companyId)
    Prisma->>DB: BEGIN + set_config(app.current_*)
    Ctrl->>Prisma: бизнес-запрос
    Prisma->>DB: SELECT ... (RLS policies)
    DB-->>Client: JSON response
```

---

## Доменные модули

19 модулей + shared-инфраструктура. Регистрация: `src/app.module.ts`.

```mermaid
mindmap
  root((companii-api))
    Ядро
      auth
      companies
      subscriptions
      consent
    Операции
      fsm
      estimates
      portal
      portal-invitation
    Платформа
      admin
      audit
      reviews
      seo
    Интеграции
      payments
      files
      email
      notifications
    Служебные
      end-client-link
      web-vitals
      shared
```

| Модуль | Назначение |
|--------|------------|
| **auth** | Регистрация, JWT, refresh rotation, сброс пароля, верификация email |
| **companies** | Профиль компании, публичные страницы, бронирование, команда, waitlist |
| **fsm** | CRM: лиды → работы → оферты → счета, календарь, бригады, аналитика |
| **estimates** | Сметы/проекты, pricing engine, PDF, actuals, blueprints по категориям |
| **portal** | Клиентский дашборд для `END_CLIENT` |
| **subscriptions** | Тарифы FREE / PRO / BUSINESS |
| **payments** | Checkout подписок, webhook с HMAC |
| **admin** | Модерация, справочники, статистика |
| **files** | Загрузка (локально dev / Backblaze B2 prod) |
| **email** | SMTP + шаблоны писем |
| **notifications** | In-app + Telegram через BullMQ |
| **reviews** | Отзывы о компаниях |
| **audit** | HTTP-аудит действий |
| **consent** | GDPR-согласия |
| **seo** | URL для sitemap фронтенда |
| **shared** | Prisma, Redis, Cache, Queue, Maintenance |

### Бизнес-поток FSM + Сметы

```mermaid
flowchart LR
    subgraph Public["Публичная витрина"]
        CAT["Каталог компаний"]
        REQ["Заявка с сайта"]
    end

    subgraph Company["Кабинет компании"]
        LEAD["Лид"]
        EST["Смета"]
        QUOTE["Оферта"]
        INT["Работа"]
        INV["Счёт"]
    end

    subgraph Portal["Клиентский портал"]
        VIEW["Просмотр"]
        ACCEPT["Принять оферту"]
        PAY["Подтверждение оплаты"]
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

## Безопасность и мультитенантность

### Три уровня авторизации

```mermaid
flowchart TD
    REQ["HTTP Request"] --> JWT["JwtAuthGuard<br/>все кроме @Public()"]
    JWT --> KIND{"AccountKind?"}
    KIND -->|PLATFORM_ADMIN| ADMIN["@Roles(PLATFORM_ADMIN)"]
    KIND -->|END_CLIENT| PORTAL["portal/* endpoints<br/>RLS через customer_id"]
    KIND -->|COMPANY_STAFF| CG["CompanyGuard<br/>@CompanyRoles(OWNER|MANAGER|MEMBER)"]
    CG --> RLS["PostgreSQL RLS<br/>company_id = tenant"]
```

### Row Level Security (RLS)

- **Tenant = Company** — большинство таблиц содержат `company_id`
- Приложение подключается ролью **`companii_app`** (без BYPASSRLS)
- На каждый запрос `RlsInterceptor` устанавливает session variables:

| Переменная | Назначение |
|------------|------------|
| `app.current_user_id` | ID пользователя |
| `app.current_company_id` | Активная компания |
| `app.user_role` | `COMPANY_STAFF` / `END_CLIENT` / `PLATFORM_ADMIN` |
| `app.current_company_role` | `OWNER` / `MANAGER` / `MEMBER` |
| `app.current_customer_id` | Для портала клиента |

Для `END_CLIENT` `company_id` сбрасывается — доступ через функцию `app_owns_customer()` по всем компаниям, где пользователь является клиентом портала.

### Аутентификация

| Механизм | Детали |
|----------|--------|
| Access token | JWT Bearer, TTL `15m`, поля: `sub`, `accountKind`, `activeCompanyId`, `companyRole`, `customerId` |
| Refresh token | 40-byte hex → SHA-256 в БД, rotation с grace period 60s |
| Хранение refresh | httpOnly cookie `companii_refresh` или body |
| Logout-all | Redis key `companii:auth:logout-since:{userId}` |
| Brute-force | 5 неудачных попыток → блокировка 15 мин (Redis) |

---

## Очереди и фоновые задачи

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

| Очередь | Назначение |
|---------|------------|
| `estimate-calculate` | Пересчёт сметы (pricing engine) |
| `estimate-pdf` | Генерация PDF сметы |
| `estimate-email` | Отправка сметы клиенту |
| `invoice-pdf` | PDF счёта |
| `estimate-convert` | Конвертация сметы в работы |
| `telegram` | Уведомления в Telegram |

Мелкие задачи (< 40 строк) могут выполняться синхронно (`QUEUE_SMALL_THRESHOLD`).

---

## Модель данных (ключевые сущности)

```mermaid
erDiagram
    User ||--o{ CompanyMember : "состоит в"
    User ||--o{ Company : "владеет"
    Company ||--o{ CompanyCustomer : "клиенты"
    Company ||--o{ CompanyLead : "лиды"
    Company ||--o{ Intervention : "работы"
    Company ||--o{ EstimateProject : "сметы"
    Company ||--|| CompanySubscription : "тариф"

    CompanyLead ||--o| Intervention : "convert"
    Intervention ||--o| Quote : "оферта"
    Intervention ||--o| CompanyInvoice : "счёт"
    EstimateProject ||--o{ EstimateStage : "этапы"
    EstimateStage ||--o{ EstimateLine : "строки"
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

**~50 моделей Prisma** — полная схема: `prisma/schema.prisma`

---

## Карта API

**Базовый префикс:** `/api/v1`  
**Swagger (dev):** `/docs`  
**Health:** `GET /health`

| Префикс | Доступ | Основные операции |
|---------|--------|-------------------|
| `/auth` | Public + Auth | register, login, refresh, forgot-password, me |
| `/companies` | Mixed | CRUD профиля, каталог, бронирование, switch |
| `/companies/members` | CompanyGuard | команда, приглашения, роли |
| `/fsm/customers` | CompanyGuard | CRM, импорт CSV |
| `/fsm/leads` | CompanyGuard | лиды, convert |
| `/fsm/interventions` | CompanyGuard | работы, фото, чеклисты |
| `/fsm/quotes` | CompanyGuard | оферты, PDF, send |
| `/fsm/invoices` | CompanyGuard | счета, оплата, PDF |
| `/fsm/calendar` | CompanyGuard | календарь |
| `/fsm/analytics` | CompanyGuard | дашборд |
| `/fsm/pipeline` | CompanyGuard | Kanban |
| `/estimates` | CompanyGuard | проекты, расчёт, PDF, actuals |
| `/portal` | END_CLIENT | dashboard, сметы, оферты, счета |
| `/admin` | PLATFORM_ADMIN | модерация, справочники |
| `/subscriptions` | Auth | планы, claim-free |
| `/payments` | OWNER / Public webhook | checkout, webhook |
| `/files` | Auth | upload, download |
| `/notifications` | Auth | список, SSE stream, Telegram |
| `/reviews` | Mixed | публичные + создание |
| `/seo/urls` | Public | sitemap URLs |

---

## Интеграции

```mermaid
flowchart TB
    API["companii-api"]

    API --> B2["Backblaze B2<br/>S3-compatible<br/>public + private buckets"]
    API --> SMTP["SMTP / nodemailer<br/>Mailtrap в dev"]
    API --> TG["Telegram Bot<br/>webhook + BullMQ"]
    API --> PAY["Payment Provider<br/>webhook HMAC-SHA256"]
    API --> PDF["PDFKit<br/>сметы и счета"]
```

| Интеграция | Dev | Production |
|------------|-----|------------|
| **Файлы** | `./uploads` + ServeStatic | Backblaze B2, signed URLs |
| **Email** | Mailtrap sandbox | SMTP production |
| **Telegram** | Опционально | `TELEGRAM_BOT_TOKEN` |
| **Платежи** | Stub checkout | Webhook по `externalId` |

---

## Быстрый старт

### Локальная разработка

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d postgres redis
npm install
npx prisma migrate deploy
npm run seed
npm run start:dev
```

| Сервис | URL |
|--------|-----|
| API | http://localhost:4100/api/v1 |
| Health | http://localhost:4100/health |
| Swagger | http://localhost:4100/docs |
| Prisma Studio | http://localhost:5555 |
| PostgreSQL | `localhost:5433` |
| Redis | `localhost:6380` |

### Docker (полный стек)

```bash
cp .env.docker.example .env.docker
npm run docker:dev:create
```

### Тестовые учётные данные (seed)

| Роль | Email | Пароль |
|------|-------|--------|
| Platform Admin | `admin@companii.local` | `Admin12345!` |

> См. `prisma/seed.ts` для демо-компаний и клиентов.

---

## Переменные окружения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `PORT` | HTTP-порт | `4100` |
| `DATABASE_URL` | Runtime DB (роль `companii_app`, RLS) | `postgresql://...@localhost:5433/companii` |
| `MIGRATION_DATABASE_URL` | Owner DB для миграций | `postgresql://postgres:...@localhost:5433/companii` |
| `REDIS_URL` | Redis | `redis://localhost:6380` |
| `JWT_SECRET` | Секрет JWT (≥32 символов) | — |
| `JWT_EXPIRES_IN` | TTL access token | `15m` |
| `FRONTEND_URL` | CORS + ссылки в email | `http://localhost:5174` |
| `USE_HTTPONLY_COOKIE` | Refresh в cookie | `true` |
| `EMAIL_ENABLED` | SMTP | `true` |
| `FILES_UPLOAD_DIR` | Локальные файлы (dev) | `./uploads` |

Production: см. `.env.production.example` — `B2_*`, `REDIS_PASSWORD`, `PAYMENTS_WEBHOOK_SECRET`.

---

## Структура репозитория

```
companii-api/
├── prisma/
│   ├── schema.prisma          # ~50 моделей
│   ├── migrations/            # SQL + RLS policies
│   ├── seed.ts
│   └── estimate-blueprints/   # шаблоны смет по категориям
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
├── test/                      # unit + e2e (включая RLS smoke)
├── docker-compose.dev.yml
├── docker-compose.prod.yml
└── Dockerfile                 # multi-stage: dev + production
```

---

## Скрипты

```bash
npm run start:dev          # hot reload
npm run test               # unit tests
npm run test:e2e           # e2e (включая RLS)
npm run prisma:migrate     # новая миграция
npm run seed               # демо-данные
npm run docker:studio      # Prisma Studio
npm run redis:cli          # Redis CLI
```

---

## Связь с фронтендом

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

Фронтенд: **[companii-web](../companii-web)** — React 19, TanStack Query, Zustand.

---

## Тарифные планы

| План | Возможности |
|------|-------------|
| **FREE** | Работы, календарь, услуги, отзывы |
| **PRO** | + CRM (клиенты, заявки), рабочие листы |
| **BUSINESS** | + Pipeline, сметы, оферты, счета |

Ограничения: `src/common/constants/plan-entitlements.constants.ts`

---

<div align="center">

**Faber Companii API** · Node ≥20 · UNLICENSED (private)

</div>
