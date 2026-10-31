# Proyecto Final — Analítica de Datos

## Título general
**Diseño y despliegue de una solución de base de datos moderna para resolver un problema real de gestión de datos**

## Tema asignado
**Comparativa técnica: del modelo relacional a NoSQL (caso real simulado)**

---

## Caso de estudio

**Eventix S.A.** — empresa colombiana ficticia de gestión de eventos presenciales e híbridos (corporativos, académicos y masivos), fundada en 2016. Opera actualmente sobre una base de datos relacional (PostgreSQL) y enfrenta limitaciones de flexibilidad y rendimiento ante el crecimiento de su catálogo de eventos, la diversidad de asistentes y la demanda de reporting en tiempo casi-real.

---

## Estructura de la entrega

| #   | Documento                                                                     | Ítem del avance                                  | Estado                    |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------- |
| 01  | [Análisis del problema](./01-analisis-del-problema.md)                        | Análisis del problema                            | Completo                  |
| 02  | [Diagnóstico del enfoque tradicional](./02-diagnostico-enfoque-tradicional.md) | Diagnóstico del enfoque tradicional              | Completo                  |
| 03  | [Justificación tecnológica](./03-justificacion-tecnologica.md)                | Justificación tecnológica                        | Completo                  |
| 04  | [Modelado de datos](./04-modelado-de-datos.md)                                | Modelado de datos                                | Completo                  |
| 05  | [Implementación (prototipo funcional sobre MongoDB 7.x)](./05-implementacion.md) | Implementación                                   | Completo                  |

---

## Resumen ejecutivo de la propuesta

| Aspecto                | Decisión                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Tecnología elegida** | **MongoDB 7.x** (documental)                                                                                   |
| **Modelo anterior**    | PostgreSQL 14 (relacional, normalizado en 3FN)                                                                 |
| **Estrategia de modelado** | Híbrida: **embed** para datos de cardinalidad baja y consultados junto al padre; **reference** para relaciones many-to-many o crecientes |
| **Casos de uso núcleo** | Catálogo de eventos, venta de tickets, registro de asistentes, asignación de promociones, reporting operativo |
| **Acceso (item 5)**    | API REST (Express 5 + MongoDB 7.x), con contrato OpenAPI 3.1 y arranque en contenedores          |

> **Nota metodológica:** Este proyecto es un caso **simulado**, no se ejecuta contra datos reales. Los volúmenes, métricas y nombres son realistas pero hipotéticos, y se declaran explícitamente en el documento 01.
