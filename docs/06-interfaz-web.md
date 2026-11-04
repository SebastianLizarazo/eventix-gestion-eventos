# 06 · Interfaz web (showcase del modelo documental)

**Parte 06 del avance:** _Comparativa técnica: del modelo relacional a NoSQL (caso real simulado)_ — caso **Eventix S.A.**

Este documento es el entregable de la interfaz web: **qué muestra**, **cómo se
corre** y **qué evidencia tiene**. La interfaz es **consumidora pura** de la API
del [documento 05](./05-implementacion.md): no la modifica, no le añade rutas y
no le pide CORS. Habla con ella por el mismo origen que el navegador, con el
proxy de `/api`.

> El caso es simulado y los datos son sintéticos. El estado vivo del trabajo,
> hito por hito, está en [`odd/tasks/eventix-frontend.md`](../odd/tasks/eventix-frontend.md).

---

## 1. Qué se implementó

Una interfaz web pensada para **enseñar el modelo documental en una sala**: el
catálogo, la ficha de un evento con su configuración flexible, el dashboard en
vivo, los cuatro reportes, el flujo de compra completo, la gestión de eventos y
los exploradores de solo lectura. Todo contra la API que ya existía.

| Pantalla | Ruta | Qué muestra | Escribe |
| --- | --- | --- | --- |
| Inicio | `/` | La salud de la API y el resumen del dataset | no |
| Catálogo | `/catalogo` | Los eventos con filtros (tipo, estado, categoría, lugar, fecha, texto) y paginación | no |
| Ficha del evento | `/eventos/:id` | Los datos del evento, **su configuración propia del tipo** y sus tipos de ticket | no |
| Compra | `/compra` | El flujo crítico: evento → tipo → asistente → pago → pasarela y referencia → ticket emitido | **sí** |
| Reportes | `/reportes` | Dashboard del evento, asistentes, cierre contable y ranking | no |
| Gestión de eventos | `/gestion/eventos` | Alta, edición (con versión) y baja de eventos, con sus tipos de ticket y promociones | **sí** |
| Exploradores | `/exploradores` | Usuarios, tickets, transacciones y auditoría: tablas de solo lectura con filtros y paginación | no |
| Contrato | `/contrato` | El OpenAPI 3.1 que la API ya publica: **27 rutas, 47 operaciones** y los esquemas de las seis colecciones | no |

Ocho pantallas, once rutas. Las **cuatro colecciones de solo lectura**
(`usuarios`, `tickets`, `transacciones`, `auditoria_eventos`) no ofrecen ningún
botón de escritura: el rastro de auditoría es *append-only* y su router responde
`405`.

| Hito | Qué aporta | Tareas |
| --- | --- | --- |
| **H0 · Cimientos** | `apps/web` (React + Vite + TypeScript estricto + Tailwind), cliente HTTP tipado, capa de datos, proxy de `/api`, formateadores es-CO | T0.1–T0.9 |
| **H1 · Catálogo y ficha** | Catálogo con filtros y ficha de evento con la configuración flexible por tipo | T1.1–T1.4 |
| **H2 · Dashboard y reportes** | Dashboard en vivo y las cuatro consultas agregadas del documento 01 §7.1 | T2.1–T2.5 |
| **H3 · Compra** | El flujo de compra con su idempotencia y el mapa de motivos de error | T3.1–T3.3 |
| **H4 · Gestión de eventos** | Alta, edición con bloqueo por versión y baja de eventos, con tipos de ticket y promociones | T4.1–T4.4 |
| **H5 · Exploradores** | Las cuatro tablas de solo lectura y la pantalla del contrato OpenAPI | T5.1–T5.3 |
| **H6 · Entrega** | Imagen de la interfaz con nginx, compose de una sola URL, runbook, este documento y el CI del slice | T6.1–T6.4 |

---

## 2. Arquitectura

```
apps/web/
  src/api/        cliente HTTP tipado, tipos del contrato, hooks de React Query
  src/pantallas/  las ocho pantallas
  src/ui/         layout, tabla con paginación, filtros, piezas compartidas
  src/formato/    los formateadores es-CO (fechas, COP, porcentajes)
  tests/          los tests del frontend (Vitest + Testing Library)
  Dockerfile      imagen de entrega: compila la SPA y la sirve con nginx
  nginx.conf      el _fallback_ de la SPA y el proxy de `/api`
```

Tres decisiones que explican la forma del código:

**1 · La API no se toca.** Cero commits que modifiquen `apps/api/src/**`. La
interfaz consume el contrato OpenAPI 3.1 que la API ya publica. La razón
concreta: el test `apps/api/tests/http/openapi.test.ts` compara el contrato con
las rutas que la aplicación registra de verdad, en las dos direcciones (27 = 27).
Servir la SPA desde Express añadiría una ruta fuera del contrato y rompería esa
garantía; servirla con **un contenedor nginx aparte** la deja intacta por
construcción.

**2 · Un solo origen: proxy, no CORS.** En desarrollo, el servidor de Vite
reenvía `/api` a `http://localhost:3000`; en la entrega, nginx reenvía `/api` al
servicio `api` del compose. El navegador nunca hace una petición cruzada, así
que no hay CORS que configurar y la API no recibe ni un cambio de configuración.

**3 · El error se consume por código, nunca por mensaje.** La interfaz lee el
cuerpo único `{ "error": { "codigo", "mensaje", "detalles"?, "request_id" } }` y
decide por `codigo` (`peticion_invalida`, `no_encontrado`, `conflicto`,
`validacion`, `metodo_no_permitido`, `error_interno`). El `mensaje` se muestra,
pero **no se parsea**: un `codigo` que la API no mandó no se inventa, porque un
código falso decide mal. El `request_id` queda visible en pantalla para
correlacionar con el log del servidor.

---

## 3. Puesta en marcha

### 3.1 Con contenedores — un comando

Requiere **solo Docker**. No hace falta Node, ni pnpm, ni MongoDB local.

```bash
docker compose -f docker-compose.entrega.yml up --build
```

Eso levanta cuatro cosas: MongoDB 7.x en replica set, el servicio que
inicializa el replica set, la API y la interfaz web. La **interfaz queda en
http://localhost:5173** y el dataset `dev` ya está sembrado cuando responde:

```bash
curl http://localhost:5173/api/health
# {"status":"ok","mongo":"up","version":"0.1.0","uptimeSeconds":3}
```

La URL es la misma que en el modo local: **la interfaz es la puerta de
entrada**, y la API se habla por su proxy. Para bajarlo todo:
`docker compose -f docker-compose.entrega.yml down` (o `down -v` para borrar
también los datos).

> El contenedor de la API **no tiene política de reinicio**, y el de la web
> tampoco: si la preparación de la base o la configuración de nginx fallan, el
> contenedor queda **caído y visible** (con el error en sus logs, y
> `docker compose ps` lo muestra como `exited`) en vez de reiniciarse en loop y
> parecer sano. Hay que volver a levantarlo a mano con `up`.

### 3.2 Local, con pnpm

Requiere Node >= 22.12, pnpm >= 12 (el proyecto **no** usa npm) y Docker (para
MongoDB).

```bash
pnpm install
pnpm mongo:up                      # MongoDB 7.x en replica set rs0 (espera PRIMARY)
cp apps/api/.env.example apps/api/.env
pnpm db:setup                      # colecciones, validadores e índices
pnpm seed --scale=dev              # dataset sintético
pnpm dev                           # API en http://localhost:3000 + web en http://localhost:5173
```

`pnpm dev` levanta los dos procesos del workspace en paralelo. El navegador
pide `/api/...` al mismo origen que sirve la aplicación.

### 3.3 El recorrido de la demo

Lo que se enseña, en este orden, y **qué mirar en cada pantalla**:

1. **Inicio** — la API está viva y el dataset tiene los conteos esperados.
2. **Catálogo** — filtros combinables (un tipo, un estado, un lugar, un texto).
3. **Ficha de un evento de tipo académico** — el bloque `academico` aparece
   **sin que la interfaz lo conozca**: es la demostración visible del requisito
   flexible (NFR-04). El mismo modelo sirve eventos de tipos distintos sin
   migración.
4. **Reportes** — el dashboard del evento y las cuatro consultas agregadas del
   documento 01 §7.1. El cierre contable **con un rango de un mes**: sin filtro
   agrega las transacciones de todo el dataset y pinta cientos de filas.
5. **Compra** — el flujo crítico, con su transacción multi-documento. **Antes
   hay que crear un evento con la venta abierta** (ver §5.2).
6. **Gestión de eventos** — editar un evento y ver el `409` cuando la versión
   que el navegador tenía ya no es la vigente.
7. **Exploradores** — las cuatro colecciones de solo lectura, con filtros y
   paginación.
8. **Contrato** — el OpenAPI que la API ya publica: 27 rutas, 47 operaciones y
   los esquemas de las seis colecciones, **derivados del documento**, no
   escritos a mano.

---

## 4. Evidencia

Lo que se comprobó y cómo:

| Comprobación | Cómo | Resultado |
| --- | --- | --- |
| Los tipos de la interfaz contra la API real | `pnpm verificar:contrato` | 19 de 20 estructuras y 692 propiedades comprobadas contra la respuesta real (la 20.ª, la auditoría, viene vacía en una base recién sembrada) |
| La entrega en contenedores | `docker compose -f docker-compose.entrega.yml up --build` | Los tres servicios arriba y sanos; la interfaz responde por `/`, el _fallback_ de la SPA responde por `/catalogo` y el proxy trae la respuesta de la API |
| La suite | `pnpm test` | 496 pruebas de la API (44 archivos) y 155 de la web (23 archivos), en verde |
| El typecheck estricto | `pnpm typecheck` | Limpio, con `strict`, `noUncheckedIndexedAccess` y el resto de banderas |
| El formato | `pnpm format:check` | Limpio |
| La codificación | `pnpm check:utf8` | Correcta en todos los archivos de texto |
| El CI | `.github/workflows/ci.yml` | Lint, formato, tipos, tests y build; y el compose completo con la web, la comprobación de la interfaz y el verificador del contrato contra la API real |

El verificador del contrato **se probó fallando**: con una clave renombrada a
propósito en `apps/web/src/api/tipos.ts`, reporta el desajuste en las dos
direcciones ("la API lo manda y el tipo no lo declara" y "el tipo lo declara y
la API no lo manda"), y vuelve a estar en verde con el tipo restaurado. Un
verificador que nunca se ha visto fallar no es un verificador.

**El contrato publicado se renderiza contra el documento real**: la prueba de la
pantalla `/contrato` importa el mismo módulo que la API sirve
(`apps/api/src/http/openapi.ts`), así que si la API cambia una ruta, la prueba
falla. No hay una copia del `openapi.json` guardada en el repositorio que pueda
quedarse vieja sin que nadie se entere.

---

## 5. Divergencias y limitaciones conocidas

### 5.1 No hay autenticación, y la UI no finge que la haya

La API no tiene autenticación ni autorización (documento 05 §8.1). La interfaz
**no simula un login que no existe**: es una herramienta de demostración local.
La mitigación es la de siempre — los puertos se publican en `127.0.0.1`, nunca en
`0.0.0.0` — porque la base no tiene autenticación (documento 05 §8.7).

### 5.2 El dataset sembrado no permite comprar

El generador pone la ventana de venta de cada tipo de ticket entre los 90 días
previos al evento y el día anterior, y el dataset es una foto de julio de 2023:
con el reloj de hoy, **todas** las ventanas están cerradas y la API responde
`409` con el motivo `venta_cerrada`.

En la demo, el camino feliz de la compra se hace sobre **un evento creado desde
la interfaz** (pantalla de gestión), con su ventana de venta abierta. La
interfaz muestra la ventana de venta del tipo elegido antes de comprar, para
que ese rechazo no sea una sorpresa en la sala.

### 5.3 El rastro de auditoría llega vacío

El seed **no escribe auditoría**: el rastro se escribe cuando la API **actúa**
(una compra), no cuando se siembra. En una base recién sembrada, el explorador
de auditoría se ve vacío hasta que se compre un ticket. La interfaz lo dice en
pantalla en vez de dejar un «no hay datos» sin explicación.

### 5.4 Lo que el verificador del contrato no puede comprobar en el CI

El CI corre el verificador contra la API real del compose, con el dataset `dev`
sembrado. La **auditoría** es la única colección que puede venir vacía (ver
§5.3), así que el verificador la marca como *sin datos para comparar* en vez de
fallar: una colección sin filas no es un desajuste de tipos. Las demás
colecciones siempre traen filas, y si una vuelve vacía el verificador **falla**:
eso sería un defecto de la API.

### 5.5 Otros detalles menores

- El **selector de organizador** muestra el identificador crudo: la API no
  expone el nombre del organizador en la lista de eventos (habría que leer
  `GET /api/usuarios/{id}`).
- El **cierre contable sin filtro** agrega todas las transacciones del dataset y
  pinta cientos de filas; la tabla no pagina. No es un defecto (los datos son
  correctos y el filtro de rango está a mano), pero conviene aplicar un rango
  en la demo.
- El **rastro de auditoría es *append-only***: la interfaz no puede modificarlo ni
  borrarlo, y su router responde `405` a cualquier intento.

---

## 6. Lo que este documento no promete

- **No es un producto**: no hay cuentas, ni roles, ni pasarela de pago real. La
  compra usa la `pasarela` y la `referencia_pasarela` del dominio.
- **No es un despliegue**: no hay nube, ni túnel, ni URL pública. Es una demo en
  la máquina del expositor, con los puertos en `127.0.0.1`.
- **No acelera la base**: la interfaz no escribe fuera de lo que la API ya
  permite (`usuarios`, `tickets`, `transacciones` y `auditoria_eventos` son de
  solo lectura).
- **No sustituye al documento 05**: la evidencia de los NFR, el modelo de datos y
  el detalle de la API están en el [documento 05](./05-implementacion.md) y en el
  [documento 04](./04-modelado-de-datos.md).
