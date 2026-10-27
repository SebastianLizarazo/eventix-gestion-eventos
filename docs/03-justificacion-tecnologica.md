# 03 — Justificación tecnológica

> **Ítem evaluado:** Justificación tecnológica (comparación de alternativas, criterios técnicos, ventajas esperadas, relación tecnología ↔ problema).

---

## 1. Contexto de la decisión

A partir del diagnóstico del documento 02, Eventix necesita una **capa de persistencia** que:

1. Permita **esquemas flexibles por tipo de evento** sin migraciones.
2. Soporte **lecturas agregadas rápidas** (dashboard operativo).
3. Escale horizontalmente ante **picos de escritura** durante ventas masivas.
4. Mantenga **transacciones ACID fuertes** sobre el inventario de tickets (NFR-05).
5. Sea operable por un equipo con **experiencia SQL** y bajo presupuesto de adopción (R-05, R-01).

> **Pregunta de diseño:** ¿qué paradigma de base de datos NoSQL (o híbrida) cumple mejor estos requisitos?

---

## 2. Alternativas consideradas

Se evaluaron **cuatro alternativas documentales / column-family** representativas del estado del arte en NoSQL. Quedaron fuera del análisis: bases de grafos (exceso para el caso), key-value puras (escasas para queries), series temporales (no aplica al dominio).

### 2.1 Alternativa A — **MongoDB (documental)**

Modelo: documentos BJSON auto-descritos en colecciones.

- **Fortalezas:** modelo de datos natural para JSON; soporta transacciones multi-documento desde 4.0; secondary indexes flexibles; aggregations framework nativo; tiers gratuitos para prototipar.
- **Debilidades:** single primary por replica set (escala de escritura acotada al primario); tuning requerido para evitar hot shards.
- **Madurez:** alta (10+ años, dueño comercial + comunidad).

### 2.2 Alternativa B — **Amazon DynamoDB (key-value + documentos)**

Modelo: tablas con clave primaria simple o compuesta, ítems libres (atributos JSON-like), secondary indexes globales y locales.

- **Fortalezas:** serverless, escala automática, latencia consistente de un dígito de ms; Integración nativa con AWS; transacciones ACID desde 2018.
- **Debilidades:** requiere single-table design para ser óptimo (curva de aprendizaje); costos por RCU/WCU difíciles de predecir; vendor lock-in AWS; query patterns son rígidos una vez definidos.
- **Madurez:** alta (AWS-managed).

### 2.3 Alternativa C — **Apache Cassandra (column-family distribuida)**

Modelo: wide-rows con particionado por clave; CQL similar a SQL pero con semántica eventual-consistency-first.

- **Fortalezas:** escala lineal de escritura; multi-región nativa; ideal para series temporales y writes masivos.
- **Debilidades:** CQL no soporta JOIN, ni agregaciones; agregados requieren Spark/Hadoop; modelo mental complejo; menor ecosistema en talento local.
- **Madurez:** alta (10+ años).

### 2.4 Alternativa D — **Firestore (documental, Google Cloud)**

Modelo: documentos jerárquicos en colecciones.

- **Fortalezas:** SDKs móviles de primera clase; realtime updates nativos; sync offline.
- **Debilidades:** orientado a sincronización cliente, menos a reporting; consistencia eventual en queries cross-document; query patterns limitados (no `OR`, no joins); costo por documento leído puede dispararse.
- **Madurez:** media-alta.

---

## 3. Criterios de evaluación y ponderación

Los criterios derivan directamente de las **NFR del documento 01** y de las **restricciones R-01..R-07**. Se ponderan sobre 100 para reflejar la prioridad del proyecto.

| ID    | Criterio                                | Peso | Por qué pesa                                                                  |
| ----- | --------------------------------------- | ---- | ----------------------------------------------------------------------------- |
| C-1   | Flexibilidad de esquema (sin migraciones) | 20   | Es la fricción #1 reportada por el equipo de producto.                        |
| C-2   | Rendimiento en lectura agregada          | 15   | NFR-01 y dashboard operativo.                                                 |
| C-3   | Escalabilidad de escritura               | 12   | NFR-02 + pico de apertura de venta.                                           |
| C-4   | Consistencia transaccional sobre inventario | 12   | NFR-05 (no doble-venta).                                                  |
| C-5   | Curva de aprendizaje para equipo SQL     | 10   | R-05 (talento disponible).                                                    |
| C-6   | Costo total de propiedad predecible      | 8    | R-01 (presupuesto acotado).                                                   |
| C-7   | Ecosistema, comunidad y herramientas     | 8    | Capacidad de contratar / encontrar soporte.                                   |
| C-8   | Portabilidad / anti vendor-lock-in       | 5    | R-04.                                                                          |
| C-9   | Capacidad de querying (filtros, agregaciones) | 5    | Reportes operativos sin necesidad de capa externa.                       |
| C-10  | Realtime / eventos                       | 5    | Métricas en vivo del dashboard.                                               |

**Escala de score:** 1 (no cumple) — 3 (parcial) — 5 (cumple bien).

---

## 4. Tabla comparativa ponderada

| Criterio (peso) | **MongoDB** | **DynamoDB** | **Cassandra** | **Firestore** |
| --------------- | ----------- | ------------ | ------------- | ------------- |
| C-1 Flexibilidad (20)   | **5** | 4 | 4 | 4 |
| C-2 Lectura agregada (15)| **4** | 4 | 2 | 3 |
| C-3 Escritura escala (12) | 3 | **5** | **5** | 3 |
| C-4 Consistencia inventario (12) | **5** | **5** | 2 | 3 |
| C-5 Curva SQL → NoSQL (10) | **5** | 3 | 2 | 3 |
| C-6 Costo predecible (8)  | **4** | 3 | **4** | 3 |
| C-7 Ecosistema (8)        | **5** | 5 | 4 | 3 |
| C-8 Portabilidad (5)      | **5** | 1 | 4 | 2 |
| C-9 Querying (5)          | **5** | 3 | 1 | 3 |
| C-10 Realtime (5)         | 3 | 3 | 2 | **5** |

**Puntaje ponderado:**

| Tecnología      | Cálculo                                                                 | **Total** |
| --------------- | ----------------------------------------------------------------------- | --------- |
| **MongoDB**     | 5·20 + 4·15 + 3·12 + 5·12 + 5·10 + 4·8 + 5·8 + 5·5 + 5·5 + 3·5           | **390**   |
| DynamoDB        | 4·20 + 4·15 + 5·12 + 5·12 + 3·10 + 3·8 + 5·8 + 1·5 + 3·5 + 3·5           | **339**   |
| Cassandra       | 4·20 + 2·15 + 5·12 + 2·12 + 2·10 + 4·8 + 4·8 + 4·5 + 1·5 + 2·5           | **272**   |
| Firestore       | 4·20 + 3·15 + 3·12 + 3·12 + 3·10 + 3·8 + 3·8 + 2·5 + 3·5 + 5·5           | **299**   |

> **Resultado:** **MongoDB** obtiene el mayor puntaje ponderado, seguido por DynamoDB.

---

## 5. Decisión: **MongoDB**

### 5.1 Razones principales

1. **C-1 Flexibilidad (peso 20, score 5).** El esquema dinámico de MongoDB resuelve directamente el problema CB-6/CB-7/CB-8: una "configuración por tipo de evento" se modela simplemente como campos anidados del documento `evento`, sin migraciones.
2. **C-2 Lectura agregada (peso 15, score 4).** El Aggregation Framework + índices secundarios cubre el 90% de las necesidades de reporting sin ETL adicional.
3. **C-4 Consistencia transaccional (peso 12, score 5).** MongoDB 4.0+ soporta transacciones ACID multi-documento, suficientes para garantizar no doble-venta de tickets en nuestro modelo.
4. **C-5 Curva de aprendizaje (peso 10, score 5).** Documentos JSON son intuitivos para un equipo con background SQL; la migración mental es gradual.
5. **C-8 Portabilidad (peso 5, score 5).** MongoDB puede correr on-prem, en Atlas, en cualquier cloud — sin atadura a un vendor.
6. **C-9 Querying (peso 5, score 5).** Lenguaje de query rico, filtros por campos anidados, índices sobre subdocumentos.

### 5.2 Por qué **no** DynamoDB (segunda opción válida)

DynamoDB hubiera sido una alternativa defendible si:

- Eventix fuera **100% AWS-native** con presupuesto flexible (escala serverless real).
- El equipo adoptara **single-table design** desde el día uno.
- Los patrones de acceso fueran **estables y conocidos** de antemano.

Pero pierde en nuestro caso por:

- **C-8 Portabilidad (1 vs 5).** Lock-in total con AWS (R-04).
- **C-5 Curva (3 vs 5).** Single-table design exige pensar en clave primaria antes de tener datos.
- **C-6 Costo predecible (3 vs 4).** El modelo de RCU/WCU es opaco para un proyecto académico.
- **C-9 Querying (3 vs 5).** Patrones rígidos: cada nueva consulta puede requerir rediseño de índices.

### 5.3 Por qué **no** Cassandra ni Firestore

- **Cassandra** exige pensamiento de particionado desde el inicio y carece de agregaciones nativas — agrega una capa de Spark/Hadoop para reporting que excede el alcance.
- **Firestore** está más orientada a sincronización cliente (realtime, mobile) que a reporting y agregaciones; su modelo de query es más limitado.

---

## 6. Ventajas esperadas tras la migración

| Ventaja                                       | Problema que resuelve                    | Métrica objetivo                  |
| --------------------------------------------- | ---------------------------------------- | --------------------------------- |
| **Esquemas auto-descritos**                   | CB-6, CB-7, CB-8 (migraciones)            | TTM de nueva feature: 3–7 días → < 4 h |
| **Embed de sub-entidades** (tipos_ticket, promociones dentro de evento) | CB-1 (joins en dashboard)                 | Dashboard p95: 5 s → 1 s          |
| **Transacciones multi-documento (v4+)**        | Control de inventario no doble-venta     | 0 sobreventas en pruebas de carga |
| **Sharding automático** sobre `_id` o campo elegido | CB-2 (techo de escritura)             | Soportar 3.000 TPS sostenidos     |
| **Aggregations Framework**                     | Reporting sin mover datos a BI externo   | Reporte operativo < 2 s           |
| **Secondary indexes sobre subdocumentos**     | CB-4 (búsqueda con filtros)              | Búsqueda pública p95: 600 ms → 150 ms |
| **Modelo ejecutable on-prem** con MongoDB Community | R-01, R-04                            | Costo piloto ~0                   |

---

## 7. Relación directa: problema ↔ tecnología

| Problema diagnosticado (Doc 02)                | Capacidad de MongoDB que lo resuelve                                |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| CB-1 (joins en reportes)                       | Embed de tipos_ticket, métricas y promociones dentro de `eventos`   |
| CB-2 (techo de escritura en RDS)               | Sharding nativo + réplicas para lectura                              |
| CB-3 (QR bloqueante)                           | Embed del código QR + snapshot, lectura sin joins                    |
| CB-4 (búsqueda sin índices multicolumna)      | Índices secundarios compuestos sobre arrays y subdocumentos         |
| CB-5 (`meta_config JSONB` opaco)               | Documentos auto-descritos; `meta_config` deja de ser blob           |
| CB-6/7/8 (`ALTER TABLE` recurrentes)           | Esquema flexible: campos por tipo de evento sin migración           |
| CB-9 (réplicas infrautilizadas)                | Lectura desde secondary `preferred` en reporting reads               |
| CB-10 (sin cache)                              | Capacidad nativa: secondary reads + proyección limita carga         |

---

## 8. Riesgos de la elección y mitigaciones

| Riesgo                                       | Probabilidad | Impacto | Mitigación                                                              |
| -------------------------------------------- | ------------ | ------- | ----------------------------------------------------------------------- |
| Documentos sin esquema ⇒ datos basura        | Media        | Media   | Validación con **JSON Schema** en el API + `schema validation` server-side (3.6+). |
| Hot shard en `_id` automático                | Baja         | Alta    | Shard key por `evento_id` o `organizador_id` + monitoreo.               |
| Curva mental del equipo                      | Media        | Baja    | Talleres internos + glossary "SQL ↔ MongoDB".                          |
| Costo Atlas si crece                         | Baja         | Media   | Plan de salida: migrar a self-hosted si supera umbral.                  |
| Pérdida de JOINs cómodos                     | Media        | Media   | Embed selectivo + aggregations + vistas materializadas para reporting.  |

---

## 9. Cierre

La decisión se apoya en evidencia cuantitativa (puntaje ponderado) **y** cualitativa (encaje técnico con los problemas diagnosticados). MongoDB no es la única opción defendible — DynamoDB cumple en pesos distintos — pero es la **opción con mejor equilibrio entre flexibilidad, consistencia transaccional, portabilidad y costo predecible** para el contexto del proyecto.

La siguiente sección traduce esta decisión en un **modelo de datos concreto**: colecciones, esquema de documentos, estrategia embed/reference e índices.
