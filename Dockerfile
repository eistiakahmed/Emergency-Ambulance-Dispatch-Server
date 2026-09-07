# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
RUN pnpm exec prisma generate

COPY tsconfig.json biome.json ./
COPY src ./src
RUN pnpm run build

# Stage 2: Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY prisma ./prisma
RUN pnpm exec prisma generate

COPY --from=builder /app/dist ./dist
COPY src/docs/swagger.json ./dist/docs/swagger.json
COPY src/docs/postman_collection.json ./dist/docs/postman_collection.json

EXPOSE 5000

CMD ["node", "dist/server.js"]
