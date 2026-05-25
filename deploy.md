# Companii API deploy

## Staging / production

1. Set secrets: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `REDIS_URL`.
2. Run migrations: `npm run prisma:deploy`.
3. Seed plans: `npm run seed`.
4. Start API on port **4100**, health: `GET /api/v1/health`.

## Domains (example)

- Web: `https://companii.faber.md`
- API: `https://api.companii.faber.md`
- CORS must include web origin only.
- JWT cookies: set `COOKIE_DOMAIN=.faber.md` in production.
