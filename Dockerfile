FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline --no-audit
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --prefer-offline --no-audit --ignore-scripts && \
    npm install prisma --no-audit --ignore-scripts
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

FROM node:22-alpine AS production
RUN apk add --no-cache dumb-init ca-certificates wget && update-ca-certificates
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
WORKDIR /app
RUN chown -R nodejs:nodejs /app
USER nodejs
ENV NODE_ENV=production NODE_OPTIONS="--use-system-ca"
COPY --chown=nodejs:nodejs --from=dependencies /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs --from=builder /app/dist ./dist
COPY --chown=nodejs:nodejs --from=builder /app/prisma ./prisma
COPY --chown=nodejs:nodejs --from=builder /app/assets ./assets
COPY --chown=nodejs:nodejs --from=builder /app/prisma.config.ts ./
COPY --chown=nodejs:nodejs package*.json ./
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:4100/health || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]

FROM node:25-bookworm-slim AS development
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init ca-certificates wget \
  && rm -rf /var/lib/apt/lists/* && update-ca-certificates
ENV NODE_OPTIONS="--use-system-ca"
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline --no-audit
COPY . .
RUN npx prisma generate
EXPOSE 4100
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "start:dev"]
