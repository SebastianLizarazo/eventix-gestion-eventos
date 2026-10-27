# Eventix — prototipo funcional sobre MongoDB 7.x

Implementación del **ítem 5** del avance: _Comparativa técnica: del modelo relacional a
NoSQL (caso real simulado)_ — caso **Eventix S.A.**

El diseño (ítems 1–4) vive en [`docs/`](./docs). El roadmap de implementación, con el
estado real de cada tarea, vive en [`odd/tasks/eventix-implementacion.md`](./odd/tasks/eventix-implementacion.md).

## Requisitos

- Node.js >= 20
- pnpm >= 12 (el proyecto **no** usa npm)
- Docker (para MongoDB 7.x local)

## Puesta en marcha

```bash
pnpm install
pnpm mongo:up                      # MongoDB 7.x en replica set rs0 (espera PRIMARY)
cp apps/api/.env.example apps/api/.env
pnpm dev                           # API en http://localhost:3000
```

Verificación:

```bash
pnpm test                          # suite Vitest
pnpm lint                          # ESLint
pnpm typecheck                     # tsc --noEmit
curl http://localhost:3000/api/health
```

Detener MongoDB: `pnpm mongo:down` (o `pnpm mongo:down --volumes` para borrar datos).

## Estructura

```
apps/api/          API REST (Express 5 + TypeScript estricto)
  src/config.ts    configuración por variables de entorno (validada con Zod)
  src/db/mongo.ts  conexión y ping a MongoDB
  src/http/        routers HTTP
  tests/           tests de integración HTTP (supertest)
scripts/           scripts de operación (levantar/apagar MongoDB)
docs/              entregables de los ítems 1–4 (y el 5 al cerrarlo)
odd/tasks/         roadmap de implementación (documento vivo)
docker-compose.yml MongoDB 7.x en replica set de un solo nodo
```

## Nota de diseño relevante

MongoDB corre como **replica set de un solo nodo** a propósito: el flujo de compra de
tickets usa transacciones multi-documento (documento 04 §6) y esas transacciones no
existen contra un `mongod` standalone.
