# syntax=docker/dockerfile:1

# Imagen de entrega de la interfaz web de Eventix.
#
# El contexto de compilación es la raíz del repositorio (workspace pnpm) y la
# imagen final es nginx: sirve la SPA compilada y hace proxy de `/api` hacia
# la API, de modo que el navegador solo habla con un mismo origen (spec S5) y
# la API no recibe ni un solo cambio (spec S3).
#
# La usa el compose de entrega:
#   docker compose -f docker-compose.entrega.yml up --build
#
# Ojo: el workspace pnpm declara `apps/*`, así que el `package.json` de la API
# tiene que estar presente aunque esta imagen no la compile — el lockfile lo
# menciona y `pnpm install --frozen-lockfile` resuelve el workspace completo.

# --- Compilación: dependencias de desarrollo + vite build ---
FROM node:22-alpine AS compilacion

WORKDIR /app

# La versión de pnpm la fija el campo `packageManager` del package.json;
# corepack la instala a partir de ahí.
RUN corepack enable

# Los manifiestos van primero: mientras no cambien, la capa de instalación se
# reutiliza entre compilaciones.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile

# La web completa: `src`, las pruebas (el `tsconfig` las incluye en el
# typecheck), la configuración de Vite y el `index.html`.
COPY apps/web apps/web

# El typecheck de la web **alcanza el código de la API**: la prueba del
# contrato importa el generador real del OpenAPI (`apps/api/src/http/openapi.ts`)
# para renderizar contra el documento que la API sirve de verdad, en vez de
# contra una copia que puede quedarse vieja (decisión D-M del H5). Es el
# acoplamiento de la **prueba**, no del producto: lo que se ejecuta en el
# navegador no importa nada de `apps/api`.
#
# Por eso el código de la API tiene que estar en la imagen de compilación: sin
# él, el typecheck no resuelve el import y la imagen no construye. La imagen
# final no lo lleva (es nginx con el bundle).
COPY apps/api apps/api

# El `build` de la web es `tsc --noEmit && vite build`: el typecheck estricto
# primero, y el bundle después.
RUN pnpm --filter @eventix/web build

# --- Entrega: nginx con la SPA y el proxy de /api ---
FROM nginx:alpine AS entrega

# La configuración de nginx sustituye la que trae la imagen: es la que hace
# el *fallback* de la SPA y el proxy de `/api`.
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=compilacion /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

# Sin política de reinicio, como la API: si la configuración de nginx está
# rota, el contenedor tiene que quedar caído y visible (con el error en sus
# logs) en vez de reiniciarse en loop y parecer sano.
