# 05 · Implementación (prototipo funcional sobre MongoDB 7.x)

**Ítem 5 del avance:** _Comparativa técnica: del modelo relacional a NoSQL (caso real simulado)_ — caso **Eventix S.A.**

Este documento es el entregable del ítem 5: **qué se implementó** sobre el modelo
del [documento 04](./04-modelado-de-datos.md), **cómo se corre** y **qué miden los
NFR evaluados**, con los números que se obtuvieron al medirlos (no affirmed, medidos).

> El caso es simulado y los datos son sintéticos. Los volúmenes, métricas y nombres
> son realistas pero hipotéticos, y se declaran en el [documento 01](./01-analisis-del-problema.md).
> El estado vivo del roadmap de implementación, tarea por tarea, está en
> [`odd/tasks/eventix-implementacion.md`](../odd/tasks/eventix-implementacion.md).

---

## 1. Qué se implementó

Un prototipo **funcional**, no un esqueleto: la API está implementada, sembrada,
medida y servida en contenedores. El alcance es el del ítem 5: el backend del
modelo del documento 04, con su API REST, su carga sintética, su flujo crítico de
compra, su reporting y la evidencia de los NFR que el avance evalúa.

| Hito | Qué aporta | Tareas |
| --- | --- | --- |
| **H0 · Cimientos** | Workspace pnpm, TypeScript estricto, Vitest, ESLint + Prettier, configuración por variables de entorno, logger estructurado, `GET /api/health`, CI con MongoDB 7.x en replica set | T0.1–T0.6 |
| **H1 · Dominio** | Esquemas Zod de las 6 colecciones, normalización (`email_normalizado`, `slug`), mappers `ObjectId`↔`string`, errores de validación tipados y por campo | T1.1–T1.3 |
| **H2 · Colecciones** | `pnpm db:setup`: 6 colecciones con validator `$jsonSchema` (doc 04 §7) y los 27 índices del doc 04 §4 (`2dsphere`, `text`, TTL, unique parciales) | T2.1–T2.3 |
| **H3 · Lectura** | Repositorios con paginación, filtros y orden; todos los patrones de consulta del doc 04 §4, verificados con `explain("executionStats")` exigiendo IXSCAN sobre el índice esperado | T3.1–T3.4 |
| **H4 · API** | Servidor Express 5, router, middleware de error único, `request-id`, logging de acceso, CRUD de las 6 colecciones + tipos de ticket + promociones, contrato OpenAPI 3.1 | T4.1–T4.4 |
| **H5 · Seed** | Generador determinista de lugares, usuarios, eventos, tickets y transacciones; escala `dev`/`full`; reporte de conteos contra los volúmenes declarados | T5.1–T5.3 |
| **H6 · Compra** | La compra como **transacción multi-documento** (evento + ticket + transacción), motor de promociones (porcentaje, 2×1, early-bird), idempotencia por cargo, auditoría post-commit | T6.1–T6.5 |
| **H7 · Compra por HTTP y reporting** | `POST /api/compras` con su contrato OpenAPI y la traducción de los 8 motivos de error; las 4 consultas operativas del doc 01 §7.1 en `/api/reportes` | T6.6, T7.1–T7.3 |
| **H8 · NFR** | Los tres scripts de medición del doc 01 §4: p95 de CRUD, flexibilidad de esquema y no-doble-venta bajo carga | T8.1–T8.3 |
| **H9 · Entrega** | Este documento, el runbook del README, la imagen de entrega con arranque en un comando y el job de CI que lo prueba | T9.1–T9.3 |

Lo que **no** se implementó, y por qué, está en la [sección 8](#8-divergencias-y-limitaciones-conocidas).

---

## 2. Arquitectura

```
apps/api/src/
  domain/schemas/   esquemas Zod: la forma y las reglas de negocio (fuente de verdad)
  domain/errors.ts   errores de dominio tipados
  db/                conexión, mapeo a BSON, repositorios, validators e índices
  services/          compra (transaccional) y reporting
  http/              router, recursos, middleware, contrato OpenAPI
  seed/              generador sintético determinista
  nfr/               las tres mediciones de los NFR
  reporting/         medición de latencia del reporting
apps/api/tests/      tests de integración (supertest) y unitarios (Vitest)
```

Cuatro decisiones que explican la forma del código:

**1 · La validación vive en dos capas, y el dominio manda.** Zod valida en la
aplicación; el `$jsonSchema` del servidor valida la forma. No es duplicación
accidental: el servidor rechaza lo que no tiene forma, el dominio rechaza lo que
no tiene sentido. Y el servidor **nunca** es más estricto que el dominio, porque
MongoDB no tiene la palabra clave condicional (`if`/`then`/`else`): medirlo dio
*"Unknown $jsonSchema keyword: if"* contra 7.0.45. Por eso la regla "el bloque
`configuracion_evento.academico` solo aplica a eventos de tipo `academico`" vive
solo en el dominio, y el servidor acepta la forma nueva sin que nadie le haya
enseñado la forma nueva (que es justo lo que demuestra el NFR-04).

**2 · MongoDB corre como replica set de un solo nodo.** No por moda, sino porque
el flujo de compra (doc 04 §6) usa transacciones multi-documento y **esas
transacciones no existen contra un `mongod` standalone**. La consecuencia practice
de esa elección es que la URI siempre lleva `replicaSet=rs0` y que el arranque
tiene un paso propio (inicializar el replica set).

**3 · El seed es determinista, y eso tiene un precio.** Los `_id` se derivan de
la semilla, así que dos corridas con la misma semilla producen el mismo dataset
(comprobado por checksum). El precio: **sembrar dos veces a la vez choca con el
índice único de `_id`**, porque los ids son los mismos. Con un seed determinista
eso es un error de operación, no un bug del seed.

**4 · Cada patrón de lectura del doc 04 §4 tiene su índice, y eso se prueba.** No
se comprueba que el índice exista: se comprueba que la consulta **lo use**
(`explain("executionStats")` con IXSCAN sobre el índice esperado). Un índice que
existe y no se usa es un índice que no paga su mantenimiento.

---

## 3. Puesta en marcha

### 3.1 Con contenedores — un comando

Requiere **solo Docker**. No hace falta Node, ni pnpm, ni una MongoDB local.

```bash
docker compose -f docker-compose.entrega.yml up --build
```

Eso levanta tres cosas: MongoDB 7.x en replica set, el servicio que inicializa el
replica set, y la API. La API queda en **http://localhost:3000** y **el dataset
`dev` ya está sembrado** cuando responde:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","mongo":"up","version":"0.1.0","uptimeSeconds":3}

curl "http://localhost:3000/api/eventos?limit=1"
# {"items":[…],"total":34,"skip":0,"limit":1}
```

El compose publica además MongoDB en `localhost:27018`, para poder mirar la base
con `mongosh` sin entrar al contenedor.

| Variable | Por defecto | Qué hace |
| --- | --- | --- |
| `EVENTIX_PORT` | `3000` | Puerto publicado de la API |
| `EVENTIX_MONGO_PORT` | `27018` | Puerto publicado de MongoDB |
| `EVENTIX_SEED` | `auto` | `auto` siembra solo si la base está vacía; `always` reemplaza; `never` no siembra |
| `EVENTIX_SEED_SCALE` | `dev` | `dev` o `full` (el dataset completo: ~3 min y ~405 MB) |

Para bajar todo: `docker compose -f docker-compose.entrega.yml down` (o `down -v`
para borrar también los datos).

**Lo que hace la imagen, en orden y de forma idempotente:** espera a que MongoDB
esté `PRIMARY` → aplica el esquema (`db:setup`) → siembra si la base está vacía →
arranca la API. Relanzar el contenedor no vuelve a sembrar ni duplica nada: la
semilla se decide por el estado de la base, no por un contador.

### 3.2 Local, con pnpm

Requiere Node >= 20, pnpm >= 12 y Docker (para MongoDB).

```bash
pnpm install
pnpm mongo:up                      # MongoDB 7.x en replica set rs0 (espera PRIMARY)
cp apps/api/.env.example apps/api/.env
pnpm db:setup                      # colecciones, validadores e índices
pnpm seed --scale=dev              # dataset sintético
pnpm dev                           # API en http://localhost:3000
```

El paso `cp` importa: `.env` no está versionado (está en `.gitignore`) y el
proyecto **no** tiene valores por defecto que apunten a otra máquina.

### 3.3 Verificación

```bash
pnpm test                          # suite completa (496 tests)
pnpm lint                          # ESLint
pnpm typecheck                     # tsc --noEmit
pnpm format:check                  # Prettier
pnpm check:utf8                    # guardián de codificación
```

### 3.4 Las dos bases no se mezclan

El compose de desarrollo publica MongoDB en `27017` y el de entrega en `27018`, y
**no es un capricho**: el replica set publica el nombre del host con el que se
inicializó, y ese nombre es el que resuelven los clientes. El de desarrollo se
inicializa como `localhost:27017` (porque el API corre en la máquina del
desarrollador) y el de entrega como `mongo:27017` (porque el API corre en otro
contenedor de la misma red). Un `mongod` con `--replSet` y sin replica set
configurado **no acepta escrituras**, así que un `mongod` no puede servir para
ambos a la vez: cada uno necesita su replica set, con su host.

---

## 4. La API

Contrato OpenAPI 3.1 generado desde los propios esquemas del dominio, disponible
en vivo en `GET /api/openapi.json` (**27 paths, 47 operaciones**).

| Superficie | Rutas |
| --- | --- |
| Salud y contrato | `GET /health`, `GET /openapi.json` |
| CRUD | `usuarios`, `lugares`, `eventos`, `tickets`, `transacciones` (con `GET`/`POST`/`PATCH`/`DELETE`) |
| Lecturas con patrón de query | `GET /eventos/catalogo`, `GET /lugares/cerca`, `GET /tickets/codigo/{codigo}`, `GET /usuarios/{id}/tickets` |
| Sub-recursos de evento | `GET/POST /eventos/{id}/tipos-ticket`, `GET/POST /eventos/{id}/promociones` (con `PATCH`/`DELETE` por id o código) |
| Compra | `POST /compras` |
| Reporting | `GET /reportes/eventos/{id}/dashboard`, `GET /reportes/cierre-contable`, `GET /reportes/mas-vendidos`, `GET /reportes/asistentes/{eventoId}` |

**Un solo formato de error**, en toda la API:

```json
{
  "error": {
    "codigo": "peticion_invalida",
    "mensaje": "…",
    "detalles": [{ "campo": "…", "codigo": "…", "mensaje": "…" }],
    "request_id": "…"
  }
}
```

`request_id` es el mismo que aparece en el log de acceso, así que un error se
puede seguir hasta la línea exacta del log que lo produjo.

Dos cosas del contrato que conviene saber:

- **`auditoria_eventos` es append-only**: el router responde **405** a `PATCH` y
  `DELETE`. No es un olvido, es el contrato.
- Los listados usan **`skip` y `limit`** (no `pagina`/`limite`). El parámetro
  `limite` existe solo en `GET /reportes/mas-vendidos`, donde limita el número de
  eventos del ranking y no pagina.

---

## 5. Resultados de los NFR

Los tres NFR que el avance evalúa (doc 01 §4) se miden con scripts
reproducibles, cada uno con su dataset y su método. Las tres corridas **dejan el
dataset exactamente como estaba**: escriben solo sobre documentos que ellas mismas
crean (con un identificador de corrida) y comparan los conteos de las 6
colecciones antes y después; si no coinciden, la corrida **falla con código de
salida 1**.

### 5.1 NFR-01 · p95 de las operaciones CRUD — **cumple**

`pnpm test:perf` — 20 iteraciones por operación más 3 de calentamiento, **por
HTTP**, sobre el dataset `full`.

**28 de 28 operaciones dentro de los 200 ms.** El peor caso es el listado de
`eventos` con **p95 33,50 ms**; los puntos de lectura y de escritura quedan entre
**17,58 ms** y **26,45 ms**.

El listado de cada colección se midió con el patrón de consulta que el modelo
indexa (doc 04 §4): `eventos?estado=publicado`, `usuarios?tipo_usuario=organizador`,
`lugares?ciudad=…&activo=true`, `tickets?evento_id=…`, `transacciones?usuario_id=…`,
`auditoria?actor_id=…`. El **listado crudo** de la colección completa se midió
aparte y **queda fuera del criterio**: `tickets` p95 **464,55 ms** y
`transacciones` p95 **388,74 ms**. Es una divergencia conocida, no un
ajuste de la medición; está escrita en la [sección 8](#8-divergencias-y-limitaciones-conocidas).

### 5.2 NFR-04 · Flexibilidad de esquema sin migración ni downtime — **cumple**

`pnpm test:esquema` — sobre un evento real del dataset (`"Concierto de rock 8"`,
`4b8ea7a11c68f90ab4e963da`), de tipo `academico`.

Se demuestra la incorporación de un bloque nuevo `configuracion_evento.academico`
(créditos y certificado) sobre un tipo de evento que hoy no tenía configuración
propia:

| Lo que se comprueba | Resultado |
| --- | --- |
| Sin migración | **1** comando de escritura (`updateOne` sobre **1** `_id`); documentos de `eventos` **340 → 340**; documentos con el bloque **0 → 1**; el validador vivo del servidor quedó **idéntico** (no hubo `collMod`) |
| El almacén acepta lo que su validador no declara | El `$jsonSchema` de MongoDB no usa `additionalProperties: false`, así que el servidor guardó el bloque sin que nadie le enseñara la forma nueva |
| Sin downtime | **61** peticiones lanzadas, **61** respuestas **2xx**, **0** no-2xx; **31** cayeron dentro de la ventana del cambio (el tráfico se lanza sin esperar la respuesta: un bucle que espera deja huecos justo en el instante que hay que demostrar) |
| Coexistencia | Un evento `masivo` del mismo dataset se leyó igual, sin el bloque |
| La API lo escribe y lo rechaza donde no aplica | `PATCH` → **200** en el evento académico; `PATCH` → **422** en el masivo, con el detalle por campo |
| El dataset quedó intacto | Documento restaurado con forma canónica idéntica; **0** documentos con el bloque al terminar; conteos de las 6 colecciones iguales |

### 5.3 NFR-05 · No doble venta bajo carga — **cumple**

`pnpm test:carga` — **100** peticiones `POST /api/compras` simultáneas contra un
evento con un tipo de ticket de aforo **50**, por HTTP.

- **50** compras creadas (201) y **50** rechazadas, **todas** con el motivo
  `aforo_agotado` (leído de `error.detalles[0].codigo`).
- **50** tickets y **50** transacciones, **0** tickets sin su transacción y **0**
  transacciones sin su ticket.
- `aforo_vendido` = **50 / 50**; `metricas_evento.tickets_vendidos_total` = **50**;
  `ingresos_cop` = **5.000.000** (= 50 × 100.000).

**Cero sobreventas: el criterio de NFR-05 se cumple exacto, no "aproximadamente".**

La latencia de esa ráfaga (**p50 9.911,06 ms**, **p95 9.988,90 ms**, 9,98 ops/s)
**no es una latencia de la API** y no se presenta como un SLA: mide contención de
escritura sobre un único documento. Está en la
[sección 8](#8-divergencias-y-limitaciones-conocidas).

### 5.4 El reporting también está medido

`pnpm perf:reporting` — 20 iteraciones por consulta más 3 de calentamiento, por
HTTP, sobre el dataset `full`. El criterio de aceptación del doc 01 §7.1 es que
las cuatro consultas respondan en **< 2 s**.

| Consulta | p50 | p95 | max |
| --- | --- | --- | --- |
| Dashboard live | 14,79 ms | 17,32 ms | 17,34 ms |
| Cierre contable | 1.470,45 ms | 1.700,53 ms | 1.721,64 ms |
| Ranking de vendidos | 15,01 ms | 21,84 ms | 25,47 ms |
| Exportación de asistentes | 22,94 ms | 35,26 ms | 36,59 ms |

Las cuatro dentro del umbral. El caso peor es el **cierre contable sin filtro**,
que recorre el histórico entero: con el índice `transacciones_confirmada_en`, el
`explain` muestra **509.686** claves examinadas sin rango frente a **44.139** con
un rango de un mes. El script **falla con código de salida 1** cuando una consulta
se pasa del umbral: no puede dar un falso verde.

### 5.5 El dataset con el que se midió

| Escala | lugares | usuarios | eventos | tickets | transacciones | Tiempo medido | Checksum |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `dev` | 12 | 1.800 | 34 | 5.200 | 5.200 | 2,97 s | `08de9b2a…25cc0f` |
| `full` | 120 | 180.000 | 340 | 520.000 | 520.000 | 181,29 s | `2e787ade…2bd` |

Los tiempos son los de la máquina donde se midieron, no una promesa de
rendimiento: cambian con el hardware. Lo que sí es una propiedad del generador es
que el **checksum es el mismo** en dos corridas con la misma semilla, en cualquier
máquina.

El `full` es el que usa el compose de entrega si se pide (`EVENTIX_SEED_SCALE=full`)
y el que miden los scripts de NFR. Pesa ~405 MB.

---

## 6. Evidencia continua

El CI corre en cada push y en cada PR a `main`: codificación UTF-8, instalación con
lockfile congelado, MongoDB 7.x en replica set, lint, typecheck y la suite completa
(**496 tests en 44 archivos**, ~32 s en el runner).

Además hay un job de **entrega**: construye la imagen, levanta el compose de
entrega completo y comprueba que la API responde con datos sembrados. Ese job es
lo que convierte "el arranque en un comando funciona" en una afirmación verificada
en cada commit, y no en una instrucción que alguien tiene que seguir a ciegas.

---

## 7. Cómo está verificado

| Afirmación | Cómo se comprobó |
| --- | --- |
| El modelo valida en dos capas | Test de integración que contrasta las reglas del validator del servidor contra las del dominio, y test de rechazo por validator |
| Cada consulta usa su índice | `explain("executionStats")` exigiendo IXSCAN sobre el índice esperado |
| La compra no deja sobreventa | Test de concurrencia en el servicio (8 contra 2) **y** prueba de carga por HTTP (100 contra 50) |
| Una compra fallida no deja nada | Test de rollback: cero tickets y cero transacciones huérfanas |
| Reintentar el mismo cargo no duplica | Test de idempotencia por `pasarela` + `referencia_pasarela` |
| La entrega arranca en un comando | Job de CI que construye la imagen, levanta el compose y consulta la API |
| El seed es reproducible | Mismo checksum entre dos corridas con la misma semilla |

---

## 8. Divergencias y limitaciones conocidas

Esta sección existe para que lo que **no** se cumple o no se cubre quede escrito, y
no se descubra después.

### 8.1 No hay autenticación, y el sistema legado sí la tiene

El prototipo **no tiene capa de autenticación en ninguna ruta**. La compra mueve
dinero (ticket emitido + transacción `aprobada` + contador del evento) y toma la
identidad del comprador **del cuerpo de la petición**. El sistema legado, en
cambio, usa **JWT firmado (HS256) en cookies httpOnly** (doc 02 §1.2). Esa es la
divergencia de fondo entre el prototipo y el sistema que describe el caso.

Lo que **sí** se corrigió: la repetición de una compra que pertenece a otro
comprador ya no devuelve el ticket ajeno. `ErrorCompra` gana el motivo
`compra_de_otro_comprador`, `leerCompraPorReferencia` lanza ese error cuando la
compra viva pertenece a otro comprador, y la capa HTTP lo traduce a **409
`conflicto`** con el motivo en `detalles[0].codigo` y el campo
`referencia_pasarela`. **Eso no es una solución de seguridad** (sin identidad,
quien quiera puede reclamar ser el comprador en el cuerpo): lo que elimina es la
**entrega cruzada silenciosa** —la API respondía 200 con el ticket y el QR de otra
persona— y sube el listón de "conocer la referencia" a "conocer la referencia **y**
el id del comprador".

**Qué costaría cerrarlo:** si algún día se decide implementar autenticación, tiene
que ser **un hito propio (H6.5) antes que una parte de este entregable** —nunca
apretado dentro de H9—, y la versión que demuestra la tesis es la **sesión
embebida en `usuarios`** (sin colección nueva y sin migración), que es un caso real
de NFR-04 y no un campo sintético de demostración.

### 8.2 El mapeo de motivos de error es un oráculo de existencia

La API responde **404** para un usuario inexistente y **409** para un evento no
vendible. Un cliente puede usar esa diferencia para **saber si un usuario existe**
sin tenerlo delante. Es exactamente la decisión del doc 01 §1.2 —"detalle para el
cliente a cambio de superficie de información"— y se documenta en vez de
esconderse. El coste de cerrarlo es autenticación (8.1) o una capa de
autorización que no existe.

### 8.3 El listado crudo de las dos colecciones grandes no cumple NFR-01

`GET /api/tickets` sin filtro: **p95 464,55 ms**. `GET /api/transacciones` sin
filtro: **p95 388,74 ms**. Los dos quedan **fuera** de los 200 ms de NFR-01,
mientras que `usuarios` (170,32 ms) y las otras tres quedan dentro.

La razón es el modelo, no la implementación: el orden por defecto de esas dos
colecciones (`emitido_en`, `creada_en`) **no tiene índice** (el doc 04 §4 indexa
otros campos), así que el listado crudo es un escaneo de colección con `sort`
bloqueante. Eso no es una "consulta CRUD simple" sino una consulta analítica, y
por el propio diseño del documento pertenece al presupuesto de **2 s** de los
reportes.

**La palanca, si algún día hay que cumplirlo:** un índice sobre `emitido_en` /
`creada_en`. El coste es de escritura, y no es trivial: son 520.000 filas y el
índice acompaña a cada inserción. **Lo que no se hizo, y no se va a hacer sin
decidirlo, es ajustar la medición.**

### 8.4 El p95 de la ráfaga de compra no es un SLA

La prueba de carga del NFR-05 da **p95 9.988,90 ms** y 9,98 ops/s. Ese número
**no es el costo de la API**: mide la contención de escritura sobre un único
documento. La reserva de cupo es un `updateOne` condicionado sobre el mismo `_id`
del evento, así que cien compradores se serializan en ese punto, y el
escalamiento es **superlineal** (20 compradores → 0,64 s; 100 → 7,06 s).

Lo que NFR-05 mide es la **consistencia fuerte del inventario** —cero sobreventas—,
que se cumple exacto. El número de latencia documenta **el techo del modelo
actual**: un evento con un solo tipo de ticket no puede absorber una apertura de
venta masiva sin revisar el cupo.

### 8.5 Un requisito para reproducir la evidencia cruda del NFR-04

El validador vivo de la base `eventix` **no declara** todavía el bloque
`academico` (fue aplicado en el seed, antes de ese cambio). Correr `pnpm db:setup`
**antes** de la demostración haría que la línea *"el almacén acepta el campo que su
validador no declara"* pasara a decir "sí", y la prueba cruda perdería su valor.
**El orden correcto es: demostración primero, `db:setup` después.**

### 8.6 El alcance del prototipo

- **No hay despliegue en la nube.** El avance evalúa el ítem 5 (prototipo backend);
  el despliegue no es un ítem evaluado y no está en el alcance de esta entrega.
- **No hay autenticación ni autorización** (8.1).
- **`auditoria_eventos` es append-only** y por eso el router responde 405 a `PATCH`
  y `DELETE`.
- **El seed no escribe `auditoria_eventos`** (0 documentos): el flujo de compra es
  su único escritor, y por eso el conteo de esa colección es 0 y no un olvido.
- **Dos bases de datos no se pueden compartir** entre el flujo de desarrollo y el
  de entrega (3.4).

---

## 9. Lo que este documento no promete

- No promete un SLA de latencia bajo carga de compra: lo que midió esa prueba es
  contención de escritura (8.4).
- No promete que el listado sin filtro de `tickets` y `transacciones` sea rápido
  (8.3).
- No promete autenticación: el prototipo no la tiene y su coste está escrito (8.1).
- No promete un despliegue: el avance evalúa el ítem 5, y el despliegue no es un
  ítem evaluado (8.6).
