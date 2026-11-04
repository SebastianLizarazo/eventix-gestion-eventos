# Eventix — prototipo funcional sobre MongoDB 7.x

Implementación del **ítem 5** del avance: _Comparativa técnica: del modelo relacional a
NoSQL (caso real simulado)_ — caso **Eventix S.A.** — y su **parte 06**, la
interfaz web.

El diseño (ítems 1–4) vive en [`docs/`](./docs). **Qué se implementó, cómo se corre y
qué miden los NFR** está en [`docs/05-implementacion.md`](./docs/05-implementacion.md).
**La interfaz web** —qué muestra, cómo se corre y qué evidencia tiene— está en
[`docs/06-interfaz-web.md`](./docs/06-interfaz-web.md).
El roadmap de implementación, con el estado real de cada tarea, vive en
[`odd/tasks/eventix-implementacion.md`](./odd/tasks/eventix-implementacion.md), y el de
la interfaz en [`odd/tasks/eventix-frontend.md`](./odd/tasks/eventix-frontend.md).

## Arranque con Docker — un comando

La vía más corta: **solo necesita Docker**. Levanta MongoDB, aplica el esquema,
siembra el dataset `dev` y expone la API con la interfaz web.

```bash
docker compose -f docker-compose.entrega.yml up --build
```

```bash
curl http://localhost:5173/api/health
# {"status":"ok","mongo":"up","version":"0.1.0","uptimeSeconds":3}
```

La **interfaz web queda en http://localhost:5173** (esa es la puerta de entrada:
habla con la API por su proxy, así que el navegador solo ve un mismo origen), la
API en **http://localhost:3000** y MongoDB en `localhost:27018` (por si quieres
mirar la base). Para bajar todo: `docker compose -f docker-compose.entrega.yml
down` (o `down -v` para borrar también los datos).

El contenedor de la API **no tiene política de reinicio**, y el de la web tampoco:
si la preparación de la base o la configuración de nginx fallan, quedan **caídos
y visibles** (con el error en sus logs, y `docker compose ps` los muestra como
`exited`) en vez de reiniciarse en loop. Hay que volver a levantarlos a mano con
`up`.

| Variable                        | Por defecto | Qué hace                                                                               |
| ------------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| `EVENTIX_BIND`                  | `127.0.0.1` | Interfaz de publicación; `0.0.0.0` la expone a la red                                  |
| `EVENTIX_PORT`                  | `3000`      | Puerto publicado de la API                                                             |
| `EVENTIX_WEB_PORT`              | `5173`      | Puerto publicado de la interfaz web                                                    |
| `EVENTIX_MONGO_PORT`            | `27018`     | Puerto publicado de MongoDB                                                            |
| `EVENTIX_SEED`                  | `auto`      | `auto` siembra solo si la base está vacía; `always` reemplaza; `never` no siembra      |
| `EVENTIX_SEED_SCALE`            | `dev`       | `dev` o `full` (el dataset completo: ~3 min y ~405 MB; el tiempo depende del hardware) |
| `EVENTIX_MONGO_WAIT_TIMEOUT_MS` | `120000`    | Espera máxima por el primario, dentro del contenedor                                   |

## Arranque local — con pnpm

Requiere Node >= 22.12, pnpm >= 12 (el proyecto **no** usa npm) y Docker (para MongoDB).

```bash
pnpm install
pnpm mongo:up                      # MongoDB 7.x en replica set rs0 (espera PRIMARY)
cp apps/api/.env.example apps/api/.env
pnpm db:setup                      # colecciones, validadores e índices
pnpm seed --scale=dev              # dataset sintético
pnpm dev                           # API en http://localhost:3000 + web en http://localhost:5173
```

`pnpm dev` levanta los dos procesos del workspace en paralelo. La web habla con
la API **por el mismo origen**: el servidor de Vite hace proxy de `/api` hacia
`localhost:3000`, así que el navegador nunca hace una petición cruzada y no
hace falta CORS.

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
pnpm verificar:contrato            # el cliente y la API hablan el mismo idioma
```

`pnpm verificar:contrato` **contrasta la respuesta real de la API contra los
tipos que declara la interfaz** (`apps/web/src/api/tipos.ts`): pide los datos
de verdad y los recorre con el compilador de TypeScript. Si la API manda una
clave que el tipo no declara —o al revés— el comando falla y dice cuál, y
también falla si el tipo de un valor no coincide. Cubre hoy **todo lo que la
interfaz consume**: la salud, los eventos, los lugares, las promociones, las
cuatro vistas del reporting y las cuatro colecciones de solo lectura (**20
estructuras**; contra el dataset `dev` son **19 verificadas y 692 propiedades**,
porque la auditoría llega vacía: el seed no escribe rastro y el rastro solo lo
escribe una compra). Es la comprobación que sostiene que el cliente y el
servidor no se van a desincronizar; necesita la API arriba (`pnpm dev`) y
**corre también en el CI**, contra la API real del compose de entrega.

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
apps/web/          interfaz web (React + Vite + TypeScript estricto + Tailwind)
  src/api/         cliente HTTP tipado, tipos del contrato y hooks de datos
  src/pantallas/   las ocho pantallas
  src/ui/          layout, tabla con paginación y piezas compartidas
  tests/           tests del frontend (Vitest + Testing Library)
  Dockerfile       imagen de la interfaz: compila la SPA y la sirve con nginx
  nginx.conf       el _fallback_ de la SPA y el proxy de `/api`
scripts/           scripts de operación (levantar/apagar MongoDB, verificar el contrato)
docs/              entregables de los ítems 1–5 y de la parte 06 (interfaz web)
odd/tasks/         roadmaps de implementación (documentos vivos)
Dockerfile          imagen de entrega de la API (compilación + solo dependencias de producción)
docker-compose.yml            MongoDB 7.x en replica set de un solo nodo (desarrollo)
docker-compose.entrega.yml    MongoDB + API + interfaz web en contenedores, arranque en un comando
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
