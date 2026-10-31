# syntax=docker/dockerfile:1

# Imagen de entrega del ítem 5 de Eventix.
#
# El contexto de compilación es la raíz del repositorio (workspace pnpm) y la
# imagen final lleva solo dependencias de producción. La usa el compose de
# entrega: `docker compose -f docker-compose.entrega.yml up --build`.

# --- Compilación: dependencias de desarrollo + tsc ---
FROM node:22-alpine AS compilacion

WORKDIR /app

# La versión de pnpm la fija el campo `packageManager` del package.json;
# corepack la instala a partir de ahí.
RUN corepack enable

# Los manifiestos van primero: mientras no cambien, la capa de instalación se
# reutiliza entre compilaciones.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api apps/api

RUN pnpm --filter @eventix/api build

# --- Entrega: solo dependencias de producción ---
FROM node:22-alpine AS entrega

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json

# `--prod` deja fuera las dependencias de desarrollo (TypeScript, Vitest,
# tsx): la imagen no compila ni ejecuta tests, solo sirve la API.
RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/api

COPY --from=compilacion /app/apps/api/dist ./dist
COPY apps/api/scripts/entrada.sh apps/api/scripts/preparar.mjs ./scripts/

USER node

EXPOSE 3000

ENTRYPOINT ["sh", "scripts/entrada.sh"]
