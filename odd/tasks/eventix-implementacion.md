# Eventix — Implementación (ítem 5): prototipo funcional sobre MongoDB 7.x

**Objetivo:** materializar el modelo del documento 04 en un prototipo funcional: endpoints REST operativos, scripts de seed, suite de pruebas y validación de NFR-01/NFR-04/NFR-05.
**Branch:** `feat/eventix-implementacion` (línea de trabajo del ítem 5; `main` queda en la base con los entregables de los ítems 1–4 y recibe el cierre del ítem 5) · **Entrega:** por hitos, una sesión por hito (el desarrollo se segmenta entre sesiones) · **Test runner:** `pnpm test` (Vitest) · **Gestor de paquetes:** `pnpm` (nunca npm).

> **Cómo se mantiene vivo este documento:** al cerrar cada tarea se marca su estado, se anota el commit en la columna `Commit` y se agrega una entrada al `## Log`. Este archivo es el único lugar donde vive el estado del roadmap; si una tarea cambia de alcance, se actualiza la spec afectada y se reabre solo esa tarea.

---

## Specs

### S1 — Gestión de paquetes con pnpm (y no npm)

- **Alcance autorizado:** todo el proyecto JavaScript/TypeScript usa `pnpm` como gestor de paquetes. Prohibido `npm install`, `npm run`, `npm ci` y `package-lock.json`.
- **Criterios de aceptación:** `pnpm-lock.yaml` versionado; `packageManager: "pnpm@12.11.2"` en el `package.json` raíz; workspace con `apps/api`; todos los scripts documentados usan `pnpm`.
- **Checks:** instalación limpia con `pnpm install --frozen-lockfile`; búsqueda de `npm install` en el repo → 0 resultados.

### S2 — Estructura del proyecto y tooling base

- **Alcance autorizado:** workspace pnpm con un solo paquete `apps/api`; TypeScript en modo estricto; Vitest como runner; ESLint + Prettier; configuración por variables de entorno (`.env` + `.env.example`); logger estructurado; endpoint `GET /api/health` que reporta el estado de la conexión a MongoDB.
- **Criterios de aceptación:** `pnpm dev` levanta la API; `pnpm test` corre la suite; `pnpm lint` pasa sin errores; `GET /api/health` responde 200 con el estado de MongoDB.
- **Checks:** `pnpm test`, `pnpm lint`, `pnpm typecheck`, request a `/api/health`.

### S3 — MongoDB 7.x local y reproducible

- **Alcance autorizado:** `docker-compose` con MongoDB 7.x en **replica set de un solo nodo** (requisito duro para las transacciones multi-documento de S9), volumen nombrado, healthcheck, y scripts `pnpm mongo:up`, `pnpm mongo:down`, `pnpm mongo:logs`.
- **Criterios de aceptación:** `pnpm mongo:up` deja el nodo en estado `PRIMARY` y acepta transacciones; `MONGO_URI` incluye `replicaSet=rs0`.
- **Checks:** `docker compose ps` → healthy; `db.hello().isWritablePrimary === true`; transacción de escritura/rollback de prueba.

### S4 — Modelos de dominio y validación

- **Alcance autorizado:** esquemas de validación (Zod) para las 6 colecciones derivados del documento 04 §3; normalización de `email_normalizado` y `slug`; mappers `ObjectId` ↔ `string`; errores de validación tipados y por campo.
- **Criterios de aceptación:** los documentos de ejemplo del documento 04 validan sin error; un documento inválido se rechaza identificando el campo culpable; ninguna regla de negocio queda solo en el schema JSON del server.
- **Checks:** tests unitarios en RED→GREEN, uno por regla.

### S5 — Colecciones, índices y schema validation en el servidor

- **Alcance autorizado:** script idempotente `pnpm db:setup` que crea las 6 colecciones con validator `$jsonSchema` (documento 04 §7) y **todos** los índices del documento 04 §4 (incluidos `2dsphere`, `text`, TTL de 365 días y unique parciales).
- **Criterios de aceptación:** tras `pnpm db:setup`, `getIndexes()` de cada colección coincide con la tabla del documento 04 §4; el server rechaza un documento que viola el validator.
- **Checks:** test de integración que compara los índices reales contra la lista esperada del documento 04; test de rechazo por validator.

### S6 — Repositorios y consultas de lectura

- **Alcance autorizado:** repositorio por colección con CRUD, paginación, filtros y orden; catálogo público de eventos (`estado + fecha_inicio`); búsqueda por `slug`, por categoría, por texto y por lugar; lugares por `$near`; tickets por `codigo_qr`, por `evento_id + estado` y "mis tickets"; transacciones por `usuario_id + creada_en`; auditoría por `actor_id + ocurrido_en`.
- **Criterios de aceptación:** cada patrón de query del documento 04 §4 está implementado y verificado; los casos de uso del documento 02 §5 respondidos.
- **Checks:** tests de integración que exigen uso del índice correcto vía `explain("executionStats")` (evidencia directa de NFR-01).

### S7 — API REST CRUD

- **Alcance autorizado:** endpoints REST para `eventos`, `usuarios`, `lugares`, `tickets`, `transacciones` y `auditoria`; middleware de error con formato único; logging con `request-id`; paginación consistente; códigos HTTP correctos (201/204/400/404/409/422/500); contrato OpenAPI 3.1 generado.
- **Criterios de aceptación:** el contrato OpenAPI describe todos los endpoints; todo error sale con el mismo formato; los endpoints de eventos cubren alta/edición/baja, tipos de ticket y promociones.
- **Checks:** tests de integración HTTP (supertest) con happy path y al menos un caso 4xx por endpoint.

### S8 — Seed sintético y determinista

- **Alcance autorizado:** generador de datos sintéticos coherentes con los volúmenes declarados (180k usuarios, 340 eventos/año, 520k tickets/año) y con R-07; escala parametrizable (`--scale=dev|full`); semilla fija para reproducibilidad; emails de dominio `.test` y documentos de identidad sintéticos.
- **Criterios de aceptación:** dos corridas con la misma semilla producen el mismo dataset; `--scale=dev` corre en minutos; `--scale=full` alcanza los volúmenes documentados; el script imprime los conteos comparados contra los declarados.
- **Checks:** test de reproducibilidad (mismo checksum entre dos corridas); script de conteos con comparación contra el documento 01.

### S9 — Flujo crítico de compra con transacción multi-documento

- **Alcance autorizado:** sintaxis real del pseudocódigo del documento 04 §6 con el driver oficial; transacción que actualiza `eventos` (`aforo_vendido` + `metricas_evento`) e inserta `ticket` + `transacciones`; aplicación de promociones (porcentaje, 2×1, early-bird) validando vigencia y `usos_maximos`; idempotencia por `pasarela + referencia_pasarela`; auditoría append-only registrada **fuera** del camino crítico (post-commit, documento 04 §3.6).
- **Criterios de aceptación:** 0 sobreventas con compras concurrentes; una compra fallida no deja ticket ni transacción (rollback total); reintentar la misma `referencia_pasarela` no duplica el cobro ni el aforo.
- **Checks:** test de concurrencia (N compradores en paralelo contra un aforo limitado) en RED→GREEN — es la prueba de NFR-05; test de rollback; test de idempotencia.

### S10 — Reporting (mínimo tres consultas, documento 01 §7.1)

- **Alcance autorizado:** (1) dashboard live del evento resuelto con métricas embebidas, en una lectura (resuelve CB-1); (2) cierre contable diario por estado (CB-9); (3) ranking de eventos más vendidos con ocupación por tipo de ticket; (4) exportación paginada de asistentes (CB-1).
- **Criterios de aceptación:** las cuatro consultas responden en < 2 s con el dataset `full`; el dashboard del evento se resuelve en una única lectura sobre `eventos`.
- **Checks:** tests de integración + medición de latencia contra el dataset completo.

### S11 — Validación de los NFR evaluados

- **Alcance autorizado:** medición de p95 de CRUD (< 200 ms, NFR-01), demostración de flexibilidad de esquema sin migración ni downtime (NFR-04) y confirmación de no-doble-venta bajo carga (NFR-05).
- **Criterios de aceptación:** las tres mediciones quedan registradas con su método y su数据集; los scripts son reproducibles (`pnpm test:perf`).
- **Checks:** ejecución del script de performance con resultado anotado en el `## Log` de este roadmap.

### S12 — Entrega del ítem 5 y actualización de la entrega

- **Alcance autorizado:** `docs/05-implementacion.md` (entregable del ítem 5: qué se implementó, cómo se corre, resultados de NFR), README raíz con runbook, fila `05` agregada a `docs/README.md`, Dockerfiles de entrega, arranque en un solo comando.
- **Criterios de aceptación:** un evaluador puede clonar → `pnpm install` → `pnpm mongo:up` → `pnpm db:setup` → `pnpm seed --scale=dev` → `pnpm dev` → `pnpm test` sin pasos ocultos ni documentación implícita.
- **Checks:** runbook ejecutado en limpio siguiendo solo el README.

### S13 — Roadmap vivo y segmentado por sesiones

- **Alcance autorizado:** este documento es el estado del proyecto; cada tarea cerrada queda con estado y commit; cada sesión deja su `## Log` actualizado; el trabajo se avanza por hitos, no de una sentada.
- **Criterios de aceptación:** ninguna tarea queda en `pendiente` sin nota; al retomar una sesión se lee el `## Log` antes de escribir código.
- **Checks:** revisión del `## Log` al inicio de cada sesión.

---

## Tasks

| ID | S# | Hito | Tarea | Ruta | Riesgo | Estado | Commit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T0.1 | S1,S2 | H0 · Cimientos | Inicializar git, `.gitignore`, `package.json` raíz del workspace pnpm, `pnpm-workspace.yaml` | inline | none | **hecho** | `7571529` |
| T0.2 | S2 | H0 · Cimientos | Configurar TypeScript estricto, ESLint, Prettier, Vitest en `apps/api` | inline | none | **hecho** | `7571529` |
| T0.3 | S3 | H0 · Cimientos | `docker-compose.yml` con MongoDB 7.x en replica set de un nodo + scripts `mongo:up/down/logs` | inline | none | **hecho** | `7571529` |
| T0.4 | S2,S3 | H0 · Cimientos | Capa de config por env, logger y `GET /api/health` con estado de MongoDB | inline | none | **hecho** | `7571529` |
| T0.5 | S2 | H0 · Cimientos | Primer test RED→GREEN del healthcheck + suite base | inline | none | **hecho** | `7571529` |
| T0.6 | S2 | H0 · Cimientos | GitHub Actions: `install --frozen-lockfile` + lint + typecheck + test, con MongoDB 7.x en replica set | inline | item 5 | **hecho** | `a0e617c` |
| T1.1 | S4 | H1 · Dominio | Esquemas Zod de `usuarios`, `lugares`, `eventos`, `tickets`, `transacciones`, `auditoria_eventos` | inline | none | **hecho** | `6478e47`, `9d905f1` |
| T1.2 | S4 | H1 · Dominio | Normalización (`email_normalizado`, `slug`), mappers `ObjectId`↔`string`, errores tipados | inline | none | **hecho** | `6478e47`, `9d905f1` |
| T1.3 | S4 | H1 · Dominio | Tests unitarios de cada regla de validación | inline | none | **hecho** | `6478e47`, `9d905f1` |
| T2.1 | S5 | H2 · Colecciones | `pnpm db:setup`: crear colecciones con validator `$jsonSchema` (doc 04 §7) | inline | item 3 | pendiente | — |
| T2.2 | S5 | H2 · Colecciones | Creación idempotente de los índices del doc 04 §4 (2dsphere, text, TTL, unique parciales) | inline | item 3 | pendiente | — |
| T2.3 | S5 | H2 · Colecciones | Tests de integración: índices reales vs lista esperada + rechazo del validator + contraste de las reglas del validator del servidor contra las del dominio (cierra el criterio de S4) | inline | none | pendiente | — |
| T3.1 | S6 | H3 · Lectura | Repositorios base con paginación, filtros y orden | inline | none | pendiente | — |
| T3.2 | S6 | H3 · Lectura | Consultas de eventos: slug, catálogo público, categoría, texto, por lugar | inline | none | pendiente | — |
| T3.3 | S6 | H3 · Lectura | Consultas de lugares (`$near`), tickets (`codigo_qr`, `evento_id+estado`, "mis tickets") y transacciones | inline | none | pendiente | — |
| T3.4 | S6 | H3 · Lectura | Tests con `explain("executionStats")` exigiendo IXSCAN sobre el índice esperado | inline | none | pendiente | — |
| T4.1 | S7 | H4 · API | Servidor HTTP, router, middleware de error único, `request-id`, logging | inline | none | pendiente | — |
| T4.2 | S7 | H4 · API | Endpoints CRUD de `eventos` (incluye tipos de ticket y promociones) | inline | item 3 | pendiente | — |
| T4.3 | S7 | H4 · API | Endpoints CRUD de `usuarios`, `lugares`, `tickets`, `transacciones`, `auditoria` | inline | item 3 | pendiente | — |
| T4.4 | S7 | H4 · API | Contrato OpenAPI 3.1 + tests HTTP de happy path y 4xx por endpoint | inline | none | pendiente | — |
| T5.1 | S8 | H5 · Seed | Generador determinista de `lugares`, `usuarios`, `eventos` con sus embebidos | inline | none | pendiente | — |
| T5.2 | S8 | H5 · Seed | Generación de `tickets` y `transacciones` coherentes con los volúmenes declarados | inline | none | pendiente | — |
| T5.3 | S8 | H5 · Seed | Script `pnpm seed --scale=dev|full` + reporte de conteos vs documento 01 | inline | none | pendiente | — |
| T6.1 | S9 | H6 · Compra | Servicio de compra transaccional (evento + ticket + transacción) | inline | item 4 | pendiente | — |
| T6.2 | S9 | H6 · Compra | Motor de promociones (porcentaje, 2×1, early-bird) con vigencia y límites de uso | inline | item 4 | pendiente | — |
| T6.3 | S9 | H6 · Compra | Idempotencia por `pasarela + referencia_pasarela` y auditoría post-commit | inline | item 4 | pendiente | — |
| T6.4 | S9 | H6 · Compra | Test de concurrencia RED→GREEN: 0 sobreventas con aforo limitado | inline | item 4 | pendiente | — |
| T7.1 | S10 | H7 · Reporting | Dashboard live del evento en una lectura + cierre contable diario | inline | none | pendiente | — |
| T7.2 | S10 | H7 · Reporting | Ranking de vendidos, ocupación por tipo de ticket y exportación de asistentes | inline | none | pendiente | — |
| T7.3 | S10 | H7 · Reporting | Tests de integración + medición de latencia sobre dataset `full` | inline | none | pendiente | — |
| T8.1 | S11 | H8 · NFR | Script `pnpm test:perf`: p95 de CRUD con dataset `full` | inline | none | pendiente | — |
| T8.2 | S11 | H8 · NFR | Demostración de NFR-04: campo nuevo por tipo de evento sin migración | inline | none | pendiente | — |
| T8.3 | S11 | H8 · NFR | Prueba de carga del flujo de compra (NFR-05) y registro de resultados | inline | none | pendiente | — |
| T9.1 | S12 | H9 · Entrega | `docs/05-implementacion.md` con implementación, runbook y resultados de NFR | inline | none | pendiente | — |
| T9.2 | S12 | H9 · Entrega | README raíz + fila `05` en `docs/README.md` | inline | none | pendiente | — |
| T9.3 | S12 | H9 · Entrega | Dockerfile y compose de entrega; arranque en un comando | inline | item 5 | pendiente | — |

---

## Log

- **L1 — 2026-10-27 (pedido original, verbatim):**
  > "Vale, ya debemos comenzar con la implementación del proyecto, porque ya presentamos los avances de los cuatro prieros items, pero quiero que creemos un archivo markdown donde se evidencie el roadmap que tendremos que cumplir de aquí en adelante para llegar a la implementación final del proyecto y que a medida que vayamos desarrollando las tareas, ese roadmap se vaya actualizando, creo que actualmente lo haces con ODD ¿verdad?. EL tema es que este proyecto es grande por ende no lo vamos a desarrollar todo en una sola sesión sino que mi idea es segmetar el desarrollo de las tareas y las funcionaldiad en diferentes sesiones. Teniendo en cuenta eso, comencemos con la planeación, por ejemplo: - Para lo relacionado con javascript no quiero que utilicemos npm sino que en su lugar utilicemos pnpm"
- **L2 — 2026-10-27 — Decisiones de arranque (derivadas de los documentos 01–04, no inventadas):** Node.js + TypeScript estricto (el driver del documento 04 §6 era la única variable abierta y `pnpm` la resuelve hacia el ecosistema JS); Vitest como runner; MongoDB 7.x en Docker local por R-01 ("instancia local"); replica set de un solo nodo porque las transacciones multi-documento del documento 04 §6 no funcionan sobre un `mongod` standalone; Zod para validación en aplicación **combinada** con el `$jsonSchema` del documento 04 §7 (defensa en capas, no duplicación accidental: el server valida forma, la aplicación valida reglas de negocio).
- **L3 — 2026-10-27 — Decisión abierta D1 (bloquea H10):** el avance evaluado cubre los ítems 1–5 según `docs/README.md`; no hay ítem de despliegue documentado, pero el documento 01 fija AWS `us-east-1` y `db.m5.large` como entorno del caso. Por eso H10 y S14 quedan **condicionados** a la confirmación del usuario. Hitos 0–9 no dependen de D1.
- **L4 — 2026-10-27 — Nota de riesgo:** la venta de tickets es el único punto del sistema con riesgo de concurrencia (item 4). El test de concurrencia de T6.4 es bloqueante para el ítem 5: sin él, NFR-05 queda sin evidencia.
- **L5 — 2026-10-27 — Frontier de la siguiente sesión:** H0 (T0.1–T0.5) es el bloque que habilita todo lo demás; si el entorno queda estable, la sesión 2 arranca en H1.
- **L6 — 2026-10-27 — D1 resuelta por el usuario:** *«Solo ítem 5 — prototipo backend»*. Consecuencia: se eliminan la spec **S14** y el hito **H10** (T10.1 y T10.2), y el roadmap cierra en H9 con `docs/05-implementacion.md`. El despliegue en la nube no es ítem evaluado y queda fuera del alcance de la entrega.
- **L7 — 2026-10-27 — Hito 0 cerrado** (commit `7571529`, rama `feat/eventix-implementacion`). Evidencias observadas: `pnpm install` sin errores; `pnpm test` → 3/3 tests en verde; `pnpm typecheck` → sin errores; `pnpm lint` → sin errores; `pnpm format:check` → limpio; `pnpm mongo:up` → nodo **PRIMARY** en `rs0`; `GET /api/health` → `HTTP 200 {"status":"ok","mongo":"up"}` contra la API compilada (`tsc` + `node dist/server.js`); smoke test de transacción multi-documento con `withTransaction` → `TRANSACCION_OK` (deja el camino del ítem 5 técnicamente desbloqueado).
- **L8 — 2026-10-27 — Fricciones técnicas de H0 (resueltas, para no repetirlas):** (1) pnpm 12 ya no lee el campo `pnpm` de `package.json` y **reemplazó `onlyBuiltDependencies` por `allowBuilds`** en `pnpm-workspace.yaml`; sin esa entrada la instalación falla con `ERR_PNPM_IGNORED_BUILDS` porque `esbuild` no puede colocar su binario; (2) `eslint@9` está deprecado → se fijó `eslint@^10.13.0`; (3) `core.autocrlf=true` en Windows ensuciaba los diffs → se agregó `.gitattributes` con `* text=auto eol=lf`.
- **L9 — 2026-10-27 — Riesgo de T0.3 reevaluado a `none`:** el `docker-compose` es tooling de desarrollo local, no superficie de entrega; su fallo se ve de inmediato en `GET /api/health` (503 / `mongo: down`), así que no cumple el criterio de "difícil de detectar" del ítem 5. Los riesgos `item 5` se reservan para T9.3 (contenedor de entrega) y el resto del H9.
- **L10 — 2026-10-27 — Frontier de la sesión 2:** **H1 · Dominio** (T1.1–T1.3): esquemas Zod de las 6 colecciones según el documento 04 §3, normalización (`email_normalizado`, `slug`), mappers `ObjectId`↔`string` y sus tests unitarios en RED→GREEN.
- **L11 — 2026-10-27 — Repo remoto creado (autorizado por el usuario):** `https://github.com/SebastianLizarazo/eventix-gestion-eventos` (público, rama por defecto `main`). `main` queda en la base con los entregables de los ítems 1–4; la implementación del ítem 5 avanza en `feat/eventix-implementacion` y se integra al cerrar H9. Se corrigió la identidad de git: los commits quedaron como `SebastianLizarazo <sebastian.lizarazo03@uptc.edu.co>` (se reescribió el historial local, todavía sin publicar al momento del rewrite).
- **L12 — 2026-10-27 — T0.6 (CI) cerrado** (commits `85ffbb5` → `efe1589` → `a0e617c`). Workflow: `pnpm install --frozen-lockfile` + lint + typecheck + test, con MongoDB 7.x en replica set. **Evidencia de ejecución real, no un check verde vacío:** run `40542902949` → 12/12 pasos ✓ en 31 s, y el log del runner muestra `Test Files 1 passed (1)` / `Tests 3 passed (3)`. Tres fallas reales encontradas y corregidas en el camino: (1) **GitHub Actions no permite sobrescribir el comando de un service container**, así que el `mongod` del CI arrancaba sin `--replSet` (error 76 `NoReplicationEnabled`) → se cambió a levantar el contenedor desde un step (`docker run … mongod --replSet rs0`), igual que en local; (2) el `health-cmd` con comillas anidadas no era parseable por el runner → se eliminó, la espera de disponibilidad la hace el propio script; (3) el **host del miembro del replica set debe mapear al puerto que escucha el servidor** (dentro del contenedor), no al puerto del host → con mapeos distintos da error 93 `InvalidReplicaSetConfig`; por eso el mapeo debe ser `host:puerto == contenedor:puerto` (27017 en CI y en local). Además, el lint de los `.mjs` fallaba con `process`/`console` no definidos → se declararon los globals de Node en `eslint.config.mjs` en vez de silenciar el archivo.
- **L13 — 2026-10-27 — Cierre de la sesión:** el Hito 0 queda completo (T0.1–T0.6) con CI verde en GitHub Actions. Frontier para la sesión 2: **H1 · Dominio** (T1.1–T1.3). Nota de contexto: la sesión 1 arrastró ~55 llamadas a herramientas (la lectura del doc 04, la escritura del roadmap, tres `mem_save` de ~15 KB y el ruido del `docker pull`); todo el estado quedó persistido en disco y en Engram, así que la sesión 2 arranca limpia leyendo el `## Log` de este documento.
- **L14 — 2026-10-27 — Costura de Engram resuelta:** la memoria del proyecto vivía bajo la clave `proyecto-empresa-gestion-eventos` (nombre de la carpeta) mientras que, desde la creación del remote, Engram resuelve el proyecto por el nombre del repo → `eventix-gestion-eventos`, y eso disparaba un conflicto de transición al escribir. Resolución: `engram init eventix-gestion-eventos` (crea `.engram/config.json`, que ahora es la fuente de resolución del directorio y queda versionado) + migración del historial con `engram export` → reescritura de `project`/`session_id`/`sync_id` → `engram import`, verificando integridad por code points (el round-trip por PowerShell 5.1 corrompe UTF-8 si no se lee con `[System.IO.File]::ReadAllText(..., UTF8)`). Resultado: 5 observaciones (incluido este espejo) bajo `eventix-gestion-eventos`, con `topic_key` y contenido intactos; el proyecto viejo quedó eliminado. `engram projects merge` no sirve para renombres reales: solo acepta variantes de nombre (mayúsculas/separadores).
- **L15 — 2026-10-27 — Hito 1 cerrado** (commits `6478e47` → `9d905f1`, rama `feat/eventix-implementacion`, push `7518534..9d905f1` con CI disparado). Capa de dominio en `apps/api/src/domain/` (13 módulos) + `apps/api/tests/domain/` (11 suites). **Evidencia RED→GREEN:** RED observado = 10 suites en rojo por módulo inexistente (el suite previo de healthcheck quedó verde); GREEN = 102/102; tras la corrección = **128/128**, con `pnpm typecheck`, `pnpm lint` y `pnpm format:check` limpios. **Decisiones de modelado (documentadas porque el documento 04 no las fija):** (1) `tipos_ticket ≤ 10` — el doc 04 se contradice consigo mismo: §1.2 línea 31 y §3.3 línea 223 dicen ≤10, y el ejemplo de validator §7 línea 458 dice `maxItems: 20`; se adopta **≤10** (la regla de modelado enunciada dos veces) en el dominio, y **H2 debe usar `maxItems: 10`** en el validator del servidor para que las dos capas no se contradigan — anote esto en T2.1; (2) `email_normalizado` es **derivado y cerrado** (el esquema exige que el valor persistido sea exactamente el de `normalizeEmail`), mientras que `slug` es **derivado por defecto pero no cerrado**: se respeta el slug explícito (una URL comercial puede no derivar del nombre) y lo que se valida es el formato, porque la unicidad la garantiza el índice; (3) `normalizeEmail` elimina los puntos **solo de la parte local** — los del dominio son parte del nombre de host (`ana@mail.eventix.test`); (4) catálogos cerrados definidos en H1 porque el doc 04 solo muestra valores de ejemplo: `estado_ticket` = emitido/usado/anulado, `estado_transaccion` = pendiente/aprobada/rechazada/anulada/reembolsada, `metodo_pago` = tarjeta_credito/tarjeta_debito/efectivo/transferencia, `tipo_promocion` = porcentaje/2x1/early_bird, `rol_actor` = asistente/organizador/sistema, `tipo_sujeto` = ticket/evento/transaccion/usuario/lugar/promocion; el "vendido" del §4.4 (reporte de tickets) se modela como **emitido** (vendido y emitido son el mismo hecho) y "no usados" como `emitido − usado`; (5) fechas: parseo ISO **manual** (`src/domain/fechas.ts`) porque `new Date` desplaza solo las fechas inexistentes ("2025-02-30" se guardaba como 2 de marzo) y lee las fechas sin zona en la hora local del servidor — ahora se rechazan y **sin zona = UTC**; (6) errores: `ErrorValidacion` con detalle por campo (`campo` = ruta anidada, p. ej. `tipos_ticket.0.aforo_vendido`) y un `errorMap` de Zod **por parseo** (`src/domain/error-map.ts`) que pone los mensajes por defecto en español sin tocar el estado global — el punto de entrada tipado es `validar()`, no el `.parse()` crudo; (7) `objectIdSchema` acepta el `ObjectId` nativo y lo normaliza a hexadecimal: es el **punto único de conversión** al leer de MongoDB, que era una trampa real para H3.
- **L16 — 2026-10-27 — Verificación independiente del H1 (y por qué se hizo):** el diff del H1 tocaba `eslint.config.mjs`, que es **config compartida ejecutada por CI** → ítem 5 de riesgo → un verificador independiente sobre el work unit completo. Resultado: **FAIL** con 3 blockers + 12 advisories. Blockers: (a) `tipos_ticket ≤10` no se aplicaba en ninguna capa (yo había copiado el `20` del ejemplo §7); (b) **las fechas de calendario inexistentes se desplazaban solas** ("2025-02-30" → 2 de marzo) y las fechas sin zona dependían de la zona horaria del servidor; (c) mi comentario en `normalization.ts` **afirmaba una coherencia del `slug` que el código no tenía** (afirmación falsa, no defecto de comportamiento: la decisión de respetar el slug explícito es correcta y quedó documentada y fijada con tests). Corrección en una sola tanda (`9d905f1`): ≤10 en el dominio, parseo ISO estricto, comentario corregido, `_id` de MongoDB normalizado, y **relajación de los formatos que rechazaban datos realistas** (categorías con acentos, código QR y código de promoción en cualquier caja y normalizados a mayúsculas, teléfono, documento de identidad, tipo de sala, pasarela) más los tests que faltaban (promociones activas, ventana de venta, fechas, `_id` nativo). Rechequeo acotado a los 3 blockers: **ALL BLOCKERS CLOSED, sin regresiones**; los 6 documentos de ejemplo del doc 04 §3 siguen validando. Chequeo diferencial del cambio de ESLint: con la config base los 5 errores aparecen **solo** en los tests nuevos y ningún archivo preexistente cambia de resultado. **Pendientes conscientemente asumidos:** (i) el criterio de S4 "ninguna regla de negocio queda solo en el schema JSON del server" **no es automatizable hasta que exista el validator del servidor** → lo ataqué a T2.3; (ii) `Date.UTC` mapea los años 0000–0099 al siglo XX (irrelevante para el dominio, y está fuera del presupuesto de una sola tanda de corrección); (iii) `fromObjectId` sobre un valor que no es `ObjectId` lanza `TypeError` en vez de `ErrorIdInvalido` → se endurece en H3, cuando exista el repositorio. **Frontier de la sesión 3: H2 · Colecciones** (T2.1–T2.3), y arranca leyendo este `## Log`.
