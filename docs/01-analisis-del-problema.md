# 01 — Análisis del problema

> **Ítem evaluado:** Análisis del problema (contexto, actores, necesidades, restricciones y objetivos).

---

## 1. Contexto organizacional

### 1.1 La empresa

**Eventix S.A.** es una empresa colombiana ficticia, fundada en 2016, dedicada a la **gestión integral de eventos**: planificación, venta de entradas, control de acceso, registro de asistentes y post-evento (encuestas y reportes). Opera predominantemente en Bogotá, Medellín y Cali, y desde 2023 incursiona en eventos híbridos (presencial + streaming).

| Atributo              | Valor (hipotético)                                                   |
| --------------------- | -------------------------------------------------------------------- |
| Antigüedad            | 8 años                                                               |
| Eventos gestionados (2023) | ~340 eventos/año                                                  |
| Asistentes registrados   | ~180.000 usuarios                                                  |
| Tickets emitidos (2023) | ~520.000                                                             |
| Headcount TI          | 12 personas (2 backend, 1 DBA, 1 DevOps, 1 datos, 1 frontend, 6 ops) |
| Stack actual          | PostgreSQL 14 + API Node.js (Express) monolítica + React en frontend  |

### 1.2 Situación actual

Eventix soporta su operación sobre una **base de datos relacional PostgreSQL 14** con un esquema normalizado en tercera forma normal (3FN). La plataforma expone una API REST en Node.js/Express que centraliza la lógica de negocio. El frontend es una SPA en React. Toda la infraestructura corre en una única región (AWS `us-east-1`) sobre un RDS db.m5.large con réplicas de lectura.

El modelo de negocio ha cambiado en los últimos dos años:

1. **Mayor diversidad de eventos.** Eventos corporativos con agendas multi-día, festivales con múltiples escenarios y eventos híbridos con sesiones simultáneas presencial + streaming.
2. **Datos cada vez más semi-estructurados.** Configuraciones dinámicas por tipo de evento (ej. "festival" tiene `escenarios[]`, mientras que "corporativo" tiene `tracks[]` y `speakers[]`).
3. **Picos de tráfico pronunciados.** Apertura de ventas de eventos masivos genera concurrencia de 5–10× la media.
4. **Demandas de reporting en tiempo casi-real.** El equipo de operaciones necesita dashboards con latencia < 5 s durante la venta.

---

## 2. Descripción del problema

### 2.1 Síntomas observados

| #   | Síntoma                                                                                     | Impacto medible (estimado)                                  |
| --- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| S1  | Cambios de esquema en producción requieren migraciones coordinadas y downtime parcial     | 4 migraciones/mes; ~45 min de deploy promedio              |
| S2  | Reportes de "vista 360° de evento" (con tickets, asistentes, promociones, métricas) caen   | 3–8 s en dashboard; picos de 18 s en apertura de ventas    |
| S3  | Inserciones masivas durante la apertura de venta saturan la conexión del primary           | 1.200 TPS sostenido; degradación a partir de 800 TPS       |
| S4  | Datos meta por evento (configuración de encuesta, layout, branding) se almacenan en JSON serializado en columna `TEXT` | Imposible indexar / consultar sin deserializar en la app    |
| S5  | Nuevos atributos obligan a `ALTER TABLE` recurrentes con locks                               | Bloqueos de 2–15 s en tablas grandes                      |

### 2.2 Problema central (formulación)

> **El modelo relacional actual, si bien cumple con integridad transaccional, no escala de forma flexible ante la creciente variabilidad de los datos de eventos, restringe la velocidad de evolución del producto y obliga a desnormalizar manualmente para resolver consultas operativas críticas.**

### 2.3 Causas raíz

1. **Acoplamiento fuerte entre todos los tipos de evento en una sola jerarquía de tablas** (`eventos + eventos_categorias + tipos_ticket + meta_eventos`), pensada para un único modelo de "evento" que ya no representa la realidad.
2. **Atributos dinámicos forzados a la capa de aplicación** vía columnas `JSON`/`TEXT` opacas para la base de datos.
3. **Consultas operativas requieren 5–7 JOINs** entre `eventos`, `tipos_ticket`, `tickets`, `asistentes`, `usuarios`, `promociones`, `transacciones`.
4. **Esquema rígido** que penaliza la experimentación de producto.

---

## 3. Usuarios y actores involucrados

### 3.1 Personas (actores del sistema)

| Actor                          | Rol                                                  | Necesidades clave                                                                 |
| ------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Ana — Organizadora**         | Crea y configura eventos en la plataforma            | Alta flexibilidad al definir campos por tipo de evento; previsualización inmediata |
| **Carlos — Asistente**         | Compra tickets y gestiona sus entradas               | Búsqueda rápida de eventos; compra en < 90 s; entrada digital con QR             |
| **Lina — Operadora de eventos**| Monitorea venta en vivo, valida acceso, imprime listas | Dashboards en tiempo real; exportación rápida de listas                          |
| **Mauro — Analista de datos**  | Genera reportes de asistencia, ventas, satisfacción | Reportes con joins complejos; consultas ad-hoc sin definir índice cada vez       |
| **Diego — Ingeniero backend**  | Mantiene y evoluciona la API                         | Esquemas que documenten su propia intención; migraciones reversibles sin downtime |
| **Patricia — CTO / Sponsor**   | Decide arquitectura y prioridades                    | Reducción de tiempo-a-mercado; SLA del 99.5% durante operaciones críticas        |

### 3.2 Sistemas externos relevantes

- **Pasarela de pagos** (Wompi / Mercado Pago — mock en este proyecto).
- **Proveedor de email transaccional** (SendGrid — mock).
- **Generador de QR** (servicio interno).
- **Streaming** (HLS provider — mock para eventos híbridos).

---

## 4. Necesidades

### 4.1 Funcionales (del negocio)

- **NF-01.** Crear / editar / eliminar eventos con configuración flexible por tipo (corporativo, masivo, híbrido).
- **NF-02.** Definir múltiples tipos de ticket por evento con precios, aforos y restricciones.
- **NF-03.** Registrar asistentes y emitir tickets con códigos QR únicos.
- **NF-04.** Aplicar promociones (porcentaje, 2×1, early-bird) a tipos de ticket específicos o a eventos.
- **NF-05.** Consultar el estado de un evento (asistentes vendidos, ingresos, ocupación por tipo de ticket) en tiempo casi-real.
- **NF-06.** Generar reportes comparativos (evento vs evento, periodo vs periodo).
- **NF-07.** Soporte para campos personalizados por evento sin despliegue de migración.

### 4.2 No funcionales (técnicas y operativas)

- **NFR-01. Rendimiento.** Latencia p95 < 200 ms en consultas CRUD simples; < 2 s en reportes agregados.
- **NFR-02. Escalabilidad.** Soportar picos de 5× el tráfico medio sin degradación mayor al 20%.
- **NFR-03. Disponibilidad.** SLA objetivo 99.5% mensual durante operaciones de venta.
- **NFR-04. Flexibilidad de esquema.** Adición de campos por tipo de evento **sin migración** y **sin downtime**.
- **NFR-05. Consistencia.** El inventario de tickets debe ser **fuertemente consistente** (no se puede vender el mismo asiento dos veces).
- **NFR-06. Auditabilidad.** Mantener trazabilidad de cambios críticos (creación de evento, emisión de ticket, movimiento de dinero).
- **NFR-07. Observabilidad.** Métricas y logs centralizados; tracing distribuido.

---

## 5. Restricciones

| ID    | Restricción                                                               | Tipo                  |
| ----- | ------------------------------------------------------------------------- | --------------------- |
| R-01  | **Presupuesto de proyecto acotado:** se asume uso de tiers gratuitos o de bajo costo para el prototipo (MongoDB Atlas free tier, instancia local). | Económica             |
| R-02  | **Tiempo del proyecto:** avance por hitos semanales; el prototipo debe entregarse en plazo académico. | Temporal              |
| R-03  | **Datos personales:** cumplimiento de Ley 1581/2012 (Habeas Data, Colombia) y principios GDPR (mínimo necesario, finalidad declarada). | Regulatoria           |
| R-04  | **Portabilidad:** la decisión tecnológica no debe atar al proveedor (vendor lock-in) más allá de lo razonable. | Estratégica           |
| R-05  | **Talento disponible:** el equipo tiene experiencia en SQL; baja exposición previa a NoSQL. | Capacidades           |
| R-06  | **Stack actual:** coexistencia con la base PostgreSQL existente durante una eventual fase de migración gradual. | Técnica               |
| R-07  | **Datos sintéticos:** al ser un caso simulado, no se pueden usar datos reales de personas. | Ética/legal           |

---

## 6. Objetivos iniciales del proyecto

### 6.1 Objetivo general

> Diseñar y documentar el proceso de análisis, decisión y rediseño de la capa de persistencia de Eventix S.A., migrando del modelo relacional (PostgreSQL) a un modelo documental (NoSQL), con el fin de mejorar la flexibilidad de esquema y el rendimiento de las consultas operativas.

### 6.2 Objetivos específicos (SMART)

| ID    | Objetivo                                                                                                                              | Métrica de éxito                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| OE-1  | Diagnosticar la arquitectura relacional actual e identificar sus cuellos de botella.                                                  | Documento de diagnóstico firmado en semana 2.                    |
| OE-2  | Comparar al menos tres alternativas NoSQL (MongoDB, DynamoDB, Cassandra/Firestore) y elegir la más adecuada.                          | Tabla comparativa con puntaje ponderado y justificación final.   |
| OE-3  | Diseñar un modelo de datos NoSQL con estrategia embed/reference justificada.                                                          | Diagrama + colección de esquemas JSON + justificación por entidad.|
| OE-4  | Implementar un prototipo funcional con CRUD sobre la base documental.                                                                | Endpoints REST operativos + scripts de seed + suite de pruebas.   |
| OE-5  | Validar que el nuevo modelo cumple NFR-01, NFR-04 y NFR-05 frente al caso de uso de apertura de venta.                                | p95 < 200 ms, schema flexible, sin doble-venta en pruebas de carga.|

---

## 7. Alcance y no-objetivos

### 7.1 Dentro del alcance

- Análisis y rediseño del modelo de datos (este entregable).
- Comparativa tecnológica documentada.
- Prototipo con operaciones CRUD y al menos tres consultas de reporting.
- Datos sintéticos generados para el prototipo.

### 7.2 Fuera del alcance (explícito)

- Migración en caliente de datos productivos reales.
- Integración con pasarelas reales de pago.
- App móvil nativa.
- Refactor de la UI del producto.
- Despliegue productivo multi-región.
- Implementación de analytics avanzado (OLAP, data warehouse).
