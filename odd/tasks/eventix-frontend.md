# Eventix — Interfaz web: showcase del modelo documental para la exposición académica

**Objetivo:** materializar una interfaz web que le permita al usuario exponer el proyecto ante su profesor, recorriendo el modelo documental, el flujo crítico de compra y el reporting sobre la API que ya existe — sin modificar la API.
**Branch:** `feat/eventix-frontend` (línea de trabajo propia; `main` conserva la entrega del ítem 5) · **Entrega:** por hitos, una sesión por hito (el desarrollo se segmenta entre sesiones) · **Test runner:** `pnpm test` (Vitest, API) + `pnpm --filter @eventix/web test` (Vitest + Testing Library) · **Gestor de paquetes:** `pnpm` (nunca npm).

> **Cómo se mantiene vivo este documento:** al cerrar cada tarea se marca su estado, se anota el commit en la columna `Commit` y se agrega una entrada al `## Log`. Este archivo es el único lugar donde vive el estado de este trabajo; si una tarea cambia de alcance, se actualiza la spec afectada y se reabre solo esa tarea.

---

## Specs

### S1 — Gestión de paquetes con pnpm (heredada del ítem 5, no negociable)

- **Alcance autorizado:** todo el frontend usa `pnpm` como gestor de paquetes. Prohibido `npm install`, `npm run`, `npm ci` y `package-lock.json`. El paquete nuevo es `apps/web` y vive en el workspace pnpm existente (`pnpm-workspace.yaml` ya declara `apps/*`).
- **Criterios de aceptación:** `apps/web/package.json` con `"packageManager"` heredado de la raíz; `pnpm-lock.yaml` versionado; todas las tareas de este roadmap usan `pnpm`.
- **Checks:** `pnpm install --frozen-lockfile`; búsqueda de `npm install` en el repo → 0 resultados.

### S2 — Stack del frontend

- **Alcance autorizado:** la decisión del usuario fue **"React + Vite + TypeScript + Tailwind (Recomendado)"**: React con Vite como bundler, TypeScript en modo estricto (igual que `apps/api`), Tailwind para el CSS y Vitest + Testing Library para los tests del frontend.
- **Criterios de aceptación:** `apps/web` compila (`pnpm --filter @eventix/web build`), pasa `typecheck` estricto, y `pnpm --filter @eventix/web test` corre la suite del frontend.
- **Checks:** `pnpm --filter @eventix/web build`; `pnpm typecheck`; `pnpm --filter @eventix/web test`.

### S3 — La API no se toca: el frontend es consumidor puro del contrato

- **Alcance autorizado:** el frontend consume **solo** el contrato OpenAPI 3.1 ya publicado en `/api/openapi.json`. **Cero commits que modifiquen `apps/api/src/**`.** La API no recibe CORS, ni rutas nuevas, ni middleware nuevo: el frontend habla siempre con el prefijo `/api`.
- **Criterios de aceptación:** `git diff --name-only main...HEAD` no lista ningún archivo bajo `apps/api/src/`; la suite de la API sigue verde sin cambios.
- **Checks:** `git diff --name-only main...HEAD -- apps/api/src` → vacío; `pnpm test` (API) sin regresiones.
- **Razón (decisión del orquestador):** el test `apps/api/tests/http/openapi.test.ts` compara el contrato con las rutas que la aplicación registra de verdad, en las dos direcciones (42 = 42). Montar la SPA desde Express añadiría una ruta fuera del contrato y rompería ese test. Servir la web con un contenedor nginx aparte evita tocar la API y evita ese riesgo por construcción.

### S4 — Alcance funcional de la interfaz

- **Alcance autorizado:** la decisión del usuario fue **"Showcase + compra + gestión de eventos (Recomendado)"**. Queda dentro: catálogo público de eventos, ficha de evento con su configuración flexible por tipo, dashboard en vivo, los cuatro reportes, compra de tickets con promoción, y alta/edición/baja de eventos con sus tipos de ticket y promociones. Queda **fuera del alcance de escritura**: `usuarios`, `tickets`, `transacciones` y `auditoria_eventos` (se consultan en tablas de solo lectura, con filtros y paginación).
- **Criterios de aceptación:** las cinco pantallas de escritura (compra, evento, tipo de ticket, promoción) persisten contra la API real; las cuatro colecciones de solo lectura no ofrecen botón de escritura.
- **Checks:** recorrido manual de las cuatro consultas de reporting del documento 01 §7.1 contra la UI.

### S5 — Un solo origen: proxy, no CORS

- **Alcance autorizado:** en desarrollo, el servidor de Vite sirve la aplicación y hace proxy de `/api` hacia `http://localhost:3000`. El navegador nunca hace una petición a otro origen; la UI **no** necesita CORS y la API **no** necesita cambios de configuración.
- **Criterios de aceptación:** la aplicación cargada desde el servidor de Vite pide `/api/health` al mismo origen y recibe `200` con `{"status":"ok","mongo":"up"}`.
- **Checks:** pestaña de red del navegador: la URL pedida es `/api/health` en el mismo origen; la respuesta no tiene preflight `OPTIONS`.

### S6 — El formato único de error se consume por código, no por mensaje

- **Alcance autorizado:** la UI consume el cuerpo `{ "error": { "codigo": ..., "mensaje": ..., "detalles"?, "request_id": ... } }` y decide el comportamiento por `codigo` (`peticion_invalida`, `no_encontrado`, `conflicto`, `validacion`, `metodo_no_permitido`, `error_interno`). El `mensaje` se muestra, pero **nunca** se parsea. El `request_id` se muestra en pantalla para correlacionar con el log del servidor.
- **Criterios de aceptación:** un `422` de validación muestra el detalle por campo (`detalles[].campo` y `detalles[].mensaje`); un `409` de conflicto muestra el mensaje y el `request_id`; ningún componente compara texto de `mensaje` para decidir.
- **Checks:** tests RED→GREEN del cliente HTTP con un `404`, un `409` y un `422` reales de la API.

### S7 — Idioma, formato local y correlación con el servidor

- **Alcance autorizado:** toda la interfaz está en **español** (el proyecto, sus documentos y los mensajes de la API están en español). Fechas y horas en `es-CO`, moneda en COP con su formato local, números con separador de miles. El `request_id` de cada error fallido queda visible en la UI.
- **Criterios de aceptación:** no hay texto de interfaz en inglés; los importes se muestran como `COP 120.000`; las fechas como `15/03/2026`.
- **Checks:** recorrido de las pantallas buscando strings en inglés; test de los formateadores.

### S8 — Entrega con un comando

- **Alcance autorizado:** la decisión del usuario fue **"Un comando en tu máquina, y también en Docker (Recomendado)"**. Local: `pnpm dev` levanta la API y la web a la vez, y el profesor mira `http://localhost:5173` en la sala. Entrega: el compose levanta Mongo + API + web y publica **una sola URL**. Los puertos se publican en `127.0.0.1`, nunca en `0.0.0.0` (la base no tiene autenticación — ver la limitación 8.7 del documento 05).
- **Criterios de aceptación:** `pnpm dev` levanta los dos procesos; `docker compose -f docker-compose.entrega.yml up` levanta los tres servicios y la UI responde por una sola URL.
- **Checks:** runbook ejecutado en limpio siguiendo solo el README.

### S9 — Datos: se reusa el seed existente

- **Alcance autorizado:** la decisión del usuario fue **"Reusar el seed dev actual (Recomendado)"**: el frontend consume el dataset que ya produce `pnpm seed --scale=dev` (1.800 usuarios, 34 eventos, 5.200 tickets, 5.200 transacciones). El frontend **no** escribe un seed nuevo ni altera el generador. Las compras de la demo sí escriben datos reales (tickets, transacciones, aforo): eso es intencional y se revierte con `pnpm seed --scale=dev --reset`.
- **Criterios de aceptación:** la UI muestra datos sin ningún paso extra de preparación; la base no necesita un segundo dataset.
- **Checks:** `pnpm seed --scale=dev --reset` y luego la UI lista eventos, tickets y transacciones.

### S10 — La configuración flexible por tipo se ve en pantalla (NFR-04)

- **Alcance autorizado:** la ficha de evento muestra los campos **propios del tipo de evento** (por ejemplo el bloque `academico`) tal como vienen en el documento, **sin que la UI los hardcodee**. Es la demostración visible del requisito flexible: el mismo modelo sirve a eventos de tipos distintos sin migración.
- **Criterios de aceptación:** la ficha de un evento de tipo académico muestra su bloque `academico`; la de un evento de otro tipo muestra el suyo o no muestra ninguno; la UI no contiene una lista de campos por tipo.
- **Checks:** test que renderiza la ficha con un documento que trae campos extra y verifica que aparecen sin código nuevo.

### S11 — La compra muestra el flujo crítico y sus fallos

- **Alcance autorizado:** el flujo `POST /api/compras` con su cuerpo completo (`evento_id`, `tipo_ticket_id`, `usuario_id`, `asistente_id`, `metodo_pago`, `pasarela`, `referencia_pasarela`, `promocion_codigo` opcional) y la semántica de idempotencia: reintentar con la misma referencia devuelve el mismo resultado (200) y no cobra dos veces.
- **Criterios de aceptación:** la UI permite elegir evento, tipo de ticket, asistente y método de pago; genera una `referencia_pasarela`; muestra el ticket emitido con su código; un reintento con la misma referencia no crea un segundo ticket; un aforo agotado o un evento no vendible se muestran con su motivo.
- **Checks:** test RED→GREEN del mapeo de los motivos de compra a su estado visible.

### S12 — Entregable académico

- **Alcance autorizado:** la interfaz web es la **parte 06 del avance** (decisión del usuario): `docs/06-interfaz-web.md` (qué muestra la interfaz, cómo corre, qué evidencia tiene), fila nueva en `docs/README.md` con el ítem del avance "Interfaz web", fila correspondiente en el resumen ejecutivo de ese mismo archivo, y runbook en el README raíz.
- **Criterios de aceptación:** un evaluador puede clonar → `pnpm install` → `pnpm mongo:up` → `pnpm db:setup` → `pnpm seed --scale=dev` → `pnpm dev` y ver la interfaz, sin pasos ocultos.
- **Checks:** runbook ejecutado en limpio.

### S13 — Roadmap vivo y segmentado por sesiones

- **Alcance autorizado:** este documento es el estado de este trabajo; cada tarea cerrada queda con estado y commit; cada sesión deja su `## Log` actualizado; el trabajo se avanza por hitos, no de una sentada.
- **Criterios de aceptación:** ninguna tarea queda en `pendiente` sin nota; al retomar una sesión se lee el `## Log` antes de escribir código.
- **Checks:** revisión del `## Log` al inicio de cada sesión.

---

## Tasks

| ID | S# | Hito | Tarea | Ruta | Riesgo | Estado | Commit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T0.1 | S1,S2 | H0 · Cimientos | Crear `apps/web` (React + Vite + TS estricto + Tailwind + Vitest/Testing Library) y registrarlo en el workspace pnpm | inline | item 5 | pendiente | — |
| T0.2 | S2 | H0 · Cimientos | Tailwind, `tsconfig` estricto, ESLint/Prettier del repo, alias y `.env.example` | inline | none | pendiente | — |
| T0.3 | S5 | H0 · Cimientos | Proxy de Vite: `/api` → `http://localhost:3000` (mismo origen, sin CORS) | inline | none | pendiente | — |
| T0.4 | S6 | H0 · Cimientos | Cliente HTTP tipado (`apiClient`): `request-id`, formato único de error, `codigo` → estado visible | inline | none | pendiente | — |
| T0.5 | S6,S7 | H0 · Cimientos | Capa de datos: tipos del contrato + hooks de React Query (listar, detalle, mutar, invalidar) | inline | none | pendiente | — |
| T0.6 | S7 | H0 · Cimientos | Layout, navegación y formateadores es-CO (fechas, COP, números) | inline | none | pendiente | — |
| T0.7 | S9 | H0 · Cimientos | Pantalla de inicio: salud de la API y resumen (conteos, últimos eventos) | inline | none | pendiente | — |
| T0.8 | S1,S2,S5 | H0 · Cimientos | Scripts raíz: `pnpm dev` (API + web en paralelo), `pnpm dev:web`, `pnpm build`, `pnpm typecheck`, `pnpm test` | inline | item 5 | pendiente | — |
| T0.9 | S6 | H0 · Cimientos | Tests RED→GREEN del cliente HTTP (404, 409, 422, `request_id`, detalle por campo) | inline | none | pendiente | — |
| T1.1 | S4,S9 | H1 · Catálogo y ficha | Catálogo público: grid de eventos con filtros (tipo, estado, categoría, lugar, fecha, texto `q`) y paginación | inline | none | pendiente | — |
| T1.2 | S4,S10 | H1 · Catálogo y ficha | Ficha de evento: datos, **campos extra del tipo** (configuración flexible) y tipos de ticket con su ocupación | inline | none | pendiente | — |
| T1.3 | S4 | H1 · Catálogo y ficha | Promociones del evento: listado, alta y edición | inline | none | pendiente | — |
| T1.4 | S4,S10 | H1 · Catálogo y ficha | Tests RED→GREEN de los hooks de eventos y del render de la configuración flexible | inline | none | pendiente | — |
| T2.1 | S4 | H2 · Dashboard y reportes | Dashboard en vivo del evento: métricas, ocupación por tipo de ticket e ingresos | inline | none | pendiente | — |
| T2.2 | S4 | H2 · Dashboard y reportes | Cierre contable diario (desde/hasta) con su serie | inline | none | pendiente | — |
| T2.3 | S4 | H2 · Dashboard y reportes | Ranking de más vendidos con ocupación por tipo | inline | none | pendiente | — |
| T2.4 | S4 | H2 · Dashboard y reportes | Exportación de asistentes (paginado + filtro por estado de ticket) | inline | none | pendiente | — |
| T2.5 | S4,S7 | H2 · Dashboard y reportes | Tests RED→GREEN de la capa de reportes y del formateo es-CO | inline | none | pendiente | — |
| T3.1 | S11 | H3 · Compra | Flujo de compra: evento → tipo de ticket → asistente → método de pago → pasarela y referencia → promoción opcional | inline | none | pendiente | — |
| T3.2 | S11 | H3 · Compra | Resultado: ticket emitido con su código, mapa de motivos de error (409/422) e idempotencia | inline | none | pendiente | — |
| T3.3 | S11 | H3 · Compra | Tests RED→GREEN del flujo de compra y del mapeo de errores | inline | none | pendiente | — |
| T4.1 | S4 | H4 · Gestión de eventos | Tabla de eventos con filtros y alta/edición/baja (fusión, `_v`, 409 por versión) | inline | none | pendiente | — |
| T4.2 | S4 | H4 · Gestión de eventos | Formulario de tipos de ticket: precio, aforo y restricciones | inline | none | pendiente | — |
| T4.3 | S4 | H4 · Gestión de eventos | Formulario de promociones: porcentaje, 2×1, early-bird, vigencia y usos máximos | inline | none | pendiente | — |
| T4.4 | S4 | H4 · Gestión de eventos | Tests RED→GREEN del CRUD de eventos | inline | none | pendiente | — |
| T5.1 | S4 | H5 · Explorador | Tablas de solo lectura de usuarios, tickets, transacciones y auditoría, con filtros y paginación | inline | none | pendiente | — |
| T5.2 | S4 | H5 · Explorador | Tests RED→GREEN de los hooks de lectura y del 405 de auditoría | inline | none | pendiente | — |
| T6.1 | S8 | H6 · Entrega | Dockerfile + nginx de `apps/web` (SPA + proxy `/api`) y servicio `web` en el compose de entrega, publicado solo en `127.0.0.1` | inline | item 5, item 2 | pendiente | — |
| T6.2 | S8 | H6 · Entrega | Runbook verificado: local con `pnpm dev` y entrega con compose (una URL) | inline | none | pendiente | — |
| T6.3 | S12 | H6 · Entrega | `docs/06-interfaz-web.md`, fila nueva en `docs/README.md` y README raíz | inline | none | pendiente | — |
| T6.4 | S12,S13 | H6 · Entrega | CI verde del slice: install, lint, typecheck, test y build del frontend | inline | item 5 | pendiente | — |

---

## Log

- **L1 — 2026-11-03 (pedido original, verbatim):**
  > "Vale, probé las urls que me diste y sí funcionan. Por otro lado, obviamente que necesitamos frontend, este proyecto es un proyecto academico que yo le pueda exponer a mi profesor a traves de una interfaz web. Comencemos con la planificación para eso"
- **L2 — 2026-11-03 — Contexto heredado del turno anterior (verbatim):** el usuario ya había reportado que `pnpm dev` levantaba la API correctamente y que `GET /` respondía 404 con el cuerpo `{"error":{"codigo":"no_encontrado","mensaje":"No existe el recurso GET /","request_id":"5b73eb2a-a3fd-4623-9643-fd2630b5f5a1"}}`; se verificó que todas las rutas cuelgan bajo `/api` y que el 404 de `/` es el comportamiento correcto.
- **L3 — 2026-11-03 — Decisiones cerradas con el usuario (4 preguntas, 4 respuestas):** (1) **Alcance:** "Showcase + compra + gestión de eventos (Recomendado)"; (2) **Stack:** "React + Vite + TypeScript + Tailwind (Recomendado)"; (3) **Entrega:** "Un comando en tu máquina, y también en Docker (Recomendado)"; (4) **Datos:** "Reusar el seed dev actual (Recomendado)". Quedan fijadas en S2, S4, S8 y S9.
- **L4 — 2026-11-03 — Decisión del orquestador D-A (la API no se toca) y por qué:** el frontend es **consumidor puro** del contrato OpenAPI ya publicado. La alternativa obvia —servir la SPA desde Express para tener un solo puerto— se descartó porque `apps/api/tests/http/openapi.test.ts` compara el contrato con las rutas registradas en las dos direcciones (42 = 42): una ruta de estáticos fuera del contrato rompe ese test, y el test es la garantía que sostiene el ítem 5. Con un contenedor nginx aparte que hace proxy de `/api`, la API queda intacta y el compose expone una sola URL. Es S3.
- **L5 — 2026-11-03 — Decisión del orquestador D-B (proxy, no CORS):** ni la API ni el navegador hacen una petición cruzada: el servidor de Vite hace proxy de `/api` en desarrollo, y nginx hace lo mismo en el compose. Consecuencia: cero CORS que configurar y cero cambios de configuración en la API. Es S5.
- **L6 — 2026-11-03 — Decisión del orquestador D-C (sin autenticación, y sin fingirla):** la API no tiene autenticación ni autorización y su coste ya está escrito (documento 05 §8.1 y §9). La UI **no** simula un login que no existe: es una herramienta de demostración local. La mitigación real es la de siempre — los puertos se publican en `127.0.0.1` (documento 05 §8.7). Es S8.
- **L7 — 2026-11-03 — No-objetivos de esta interfaz (decidido, para que no crezcan solos):** sin autenticación ni roles reales; sin pasarela de pago real (la compra usa la `pasarela` y la `referencia_pasarela` del dominio, que es lo que ya existe); sin app móvil; sin despliegue en la nube; sin multi-idioma (la UI es en español, y punto); sin escritura sobre `tickets`, `transacciones` ni `auditoria_eventos` (la auditoría es append-only y su router responde 405); sin un seed nuevo.
- **L8 — 2026-11-03 — Lo que la interfaz tiene que mostrar para contar el relato académico:** la configuración flexible por tipo de evento (NFR-04 y NF-07) **visible en la ficha**, el dashboard en vivo y los cuatro reportes (las consultas agregadas del documento 01 §7.1, que son el argumento de por qué el modelo documental rinde), y el flujo de compra con su transacción multi-documento (NFR-05). Son las tres cosas que un profesor de base de datos puede cuestionar y que la interfaz responde en pantalla.
- **L9 — 2026-11-03 — Pendiente de confirmar con el usuario:** (1) si el avance evaluado tiene un ítem propio para la interfaz o si esta se presenta como ampliación del ítem 5 — de eso dependen el nombre de `docs/06-interfaz-web.md` y la fila de `docs/README.md`; (2) si el profesor expone **solo** la interfaz o también el código de la API, porque eso decide si hace falta una vista que muestre el contrato OpenAPI como parte de la propia interfaz.
- **L10 — 2026-11-03 — Frontier:** **H0 · Cimientos** (T0.1–T0.9). Es el bloque que habilita todo lo demás: sin el cliente HTTP tipado y la capa de datos, cada pantalla reimplementaría el manejo de errores y la paginación.
- **L11 — 2026-11-03 — Convenciones heredadas:** se mantiene el patrón del roadmap del ítem 5: specs con alcance y criterios, tareas con ruta (inline/delegated) y línea de riesgo, y este `## Log` como registro vivo. El test-first del proyecto sigue igual: **RED→GREEN** por regla, un test por regla, y el que escribe es el que corre la prueba. El dialecto técnico (código, comentarios, mensajes de la UI) va en español, igual que el resto del repositorio.
- **L12 — 2026-11-03 — L9 (1) resuelta por el usuario:** la interfaz web es una **parte 06 nueva** del avance, no una ampliación del ítem 5. Consecuencias: el documento de entrega se llama `docs/06-interfaz-web.md`; la tabla "Estructura de la entrega" de `docs/README.md` suma la fila `06` con el ítem del avance "Interfaz web"; y el resumen ejecutivo de ese archivo suma la fila del acceso por interfaz web. Con esto, **la única pregunta abierta de L9 es la (2)** (si el profesor expone solo la interfaz o también el código de la API), y no bloquea H0–H5: se resuelve antes de H6.
