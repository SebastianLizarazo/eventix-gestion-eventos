# Eventix — prototipo funcional sobre MongoDB 7.x

Implementación del **ítem 5** del avance: _Comparativa técnica: del modelo relacional a
NoSQL (caso real simulado)_ — caso **Eventix S.A.**

El diseño (ítems 1–4) vive en [`docs/`](./docs). **Qué se implementó, cómo se corre y
qué miden los NFR** está en [`docs/05-implementacion.md`](./docs/05-implementacion.md).
El roadmap de implementación, con el estado real de cada tarea, vive en
[`odd/tasks/eventix-implementacion.md`](./odd/tasks/eventix-implementacion.md).

## Arranque con Docker — un comando

La vía más corta: **solo necesita Docker**. Levanta MongoDB, aplica el esquema,
siembra el dataset `dev` y expone la API.

```bash
docker compose -f docker-compose.entrega.yml up --build
```

```bash
curl http://localhost:3000/api/health
# {"status":"ok","mongo":"up","version":"0.1.0","uptimeSeconds":3}
```

La API queda en **http://localhost:3000** y MongoDB en `localhost:27018` (por si
quieres mirar la base). Para bajar todo: `docker compose -f docker-compose.entrega.yml
down` (o `down -v` para borrar también los datos).

| Variable             | Por defecto | Qué hace                                                                          |
| -------------------- | ----------- | --------------------------------------------------------------------------------- |
| `EVENTIX_PORT`       | `3000`      | Puerto publicado de la API                                                        |
| `EVENTIX_MONGO_PORT` | `27018`     | Puerto publicado de MongoDB                                                       |
| `EVENTIX_SEED`       | `auto`      | `auto` siembra solo si la base está vacía; `always` reemplaza; `never` no siembra |
| `EVENTIX_SEED_SCALE` | `dev`       | `dev` o `full` (el dataset completo: ~3 min y ~405 MB)                            |

## Arranque local — con pnpm

Requiere Node >= 20, pnpm >= 12 (el proyecto **no** usa npm) y Docker (para MongoDB).

```bash
pnpm install
pnpm mongo:up                      # MongoDB 7.x en replica set rs0 (espera PRIMARY)
cp apps/api/.env.example apps/api/.env
pnpm db:setup                      # colecciones, validadores e índices
pnpm seed --scale=dev              # dataset sintético
pnpm dev                           # API en http://localhost:3000
```

El paso `cp` importa: `.env` no está versionado y el proyecto no tiene valores por
defecto que apunten a otra máquina.

Detener MongoDB: `pnpm mongo:down` (o `pnpm mongo:down --volumes` para borrar datos).

> Las dos bases no se pueden compartir: el compose de desarrollo publica MongoDB en
> `27017` y el de entrega en `27018`, porque el replica set publica el host con el
> que se inicializó y cada uno necesita el suyo. El detalle está en
> [`docs/05-implementacion.md`](./docs/05-implementacion.md#34-las-dos-bases-no-se-mezclan).

## Verificación

```bash
pnpm test                          # suite Vitest
pnpm lint                          # ESLint
pnpm typecheck                     # tsc --noEmit
pnpm format:check                  # Prettier
pnpm check:utf8                    # guardián de codificación
```

## Estructura

```
apps/api/          API REST (Express 5 + TypeScript estricto)
  src/config.ts    configuración por variables de entorno (validada con Zod)
  src/db/mongo.ts  conexión y ping a MongoDB
  src/domain/      esquemas Zod: la forma y las reglas de negocio
  src/http/        routers HTTP y contrato OpenAPI
  src/services/    compra transaccional y reporting
  src/seed/        generador sintético determinista
  src/nfr/         las tres mediciones de los NFR
  tests/           tests de integración HTTP (supertest)
scripts/           scripts de operación (levantar/apagar MongoDB)
docs/              entregables de los ítems 1–5
odd/tasks/         roadmap de implementación (documento vivo)
Dockerfile          imagen de entrega (compilación + solo dependencias de producción)
docker-compose.yml            MongoDB 7.x en replica set de un solo nodo (desarrollo)
docker-compose.entrega.yml    MongoDB + API en contenedores, arranque en un comando
```

## Notas de diseño relevantes

- MongoDB corre como **replica set de un solo nodo** a propósito: el flujo de compra
  de tickets usa transacciones multi-documento (documento 04 §6) y esas
  transacciones no existen contra un `mongod` standalone.
- La **validación vive en dos capas**: Zod en la aplicación y `$jsonSchema` en el
  servidor. El servidor valida la forma; el dominio valida las reglas, y el
  servidor nunca es más estricto que el dominio.
- El **seed es determinista**: la misma semilla produce el mismo dataset (verificado
  por checksum). Por eso sembrar dos veces a la vez choca con el índice único de
  `_id` — es un error de operación, no un bug.
- **Lo que este prototipo no tiene** (autenticación, entre otras cosas) está
  escrito en las [divergencias y limitaciones conocidas](./docs/05-implementacion.md#8-divergencias-y-limitaciones-conocidas) del
  entregable, con su coste.
