import type { Document } from "mongodb";
import {
  CANAL_NOTIFICACION,
  ESTADO_EVENTO,
  ESTADO_TICKET,
  ESTADO_TRANSACCION,
  METODO_PAGO,
  ROL_ACTOR,
  RESULTADO_REVALIDACION,
  TIPO_EVENTO,
  TIPO_PREGUNTA,
  TIPO_PROMOCION,
  TIPO_SUJETO,
  TIPO_USUARIO,
  VISIBILIDAD_EVENTO,
} from "../domain/schemas/index.js";

/**
 * Validadores `$jsonSchema` del servidor (documento 04 §7).
 *
 * Reglas de construcción (fijadas contra MongoDB 7.x real, ver el `## Log` del
 * roadmap):
 *
 * 1. **Todo campo numérico usa `bsonType: "number"`.** El driver de Node
 *    escribe los enteros de JavaScript como `int` (int32) y solo los mayores a
 *    2^31-1 como `double`: el ejemplo del documento 04 §7 (`long` para
 *    `precio_cop`) rechazaría el documento que la propia aplicación escribe.
 * 2. **`required` es el conjunto de campos que el esquema del dominio exige
 *    sin valor por defecto.** Así todo documento que el dominio produce es
 *    aceptado por el servidor: la dirección "dominio acepta ⟹ servidor acepta"
 *    se sostiene por construcción, y ninguna regla del servidor es más
 *    estricta que el dominio.
 * 3. **No se usa `additionalProperties: false`.** La flexibilidad de esquema es
 *    deliberada (NFR-04) y el documento 04 §7 tampoco lo fija.
 * 4. **Los catálogos se importan del dominio**, no se redeclaran: una sola
 *    fuente de verdad para los valores permitidos.
 * 5. Las referencias entre documentos son `objectId`: en BSON una referencia
 *    *es* un `ObjectId` (el mapper dominio ⟷ BSON de la capa de persistencia
 *    es quien convierte).
 */

const VALIDADOR_USUARIOS: Document = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "email",
      "nombre",
      "documento_identidad",
      "email_normalizado",
      "creado_en",
      "actualizado_en",
    ],
    properties: {
      email: { bsonType: "string", minLength: 1 },
      nombre: { bsonType: "string", minLength: 1, maxLength: 200 },
      telefono: { bsonType: "string", minLength: 5, maxLength: 32 },
      documento_identidad: { bsonType: "string", minLength: 3, maxLength: 32 },
      email_normalizado: { bsonType: "string", minLength: 1 },
      tipo_usuario: {
        bsonType: "array",
        minItems: 1,
        items: { enum: [...TIPO_USUARIO] },
      },
      fecha_nacimiento: { bsonType: "date" },
      preferencias: {
        bsonType: "object",
        properties: {
          newsletter: { bsonType: "bool" },
          idioma: { bsonType: "string", minLength: 2, maxLength: 10 },
          canal_notif: { bsonType: "array", items: { enum: [...CANAL_NOTIFICACION] } },
        },
      },
      estadisticas: {
        bsonType: "object",
        properties: {
          eventos_asistidos: { bsonType: "number", minimum: 0 },
          tickets_comprados: { bsonType: "number", minimum: 0 },
          ltv_cop: { bsonType: "number", minimum: 0 },
        },
      },
      creado_en: { bsonType: "date" },
      actualizado_en: { bsonType: "date" },
      _v: { bsonType: "number", minimum: 0 },
    },
  },
};

const VALIDADOR_LUGARES: Document = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "nombre",
      "direccion",
      "ciudad",
      "pais",
      "capacidad_total",
      "geometria",
      "creado_en",
    ],
    properties: {
      nombre: { bsonType: "string", minLength: 1, maxLength: 200 },
      direccion: { bsonType: "string", minLength: 1, maxLength: 300 },
      ciudad: { bsonType: "string", minLength: 1, maxLength: 120 },
      pais: { bsonType: "string", minLength: 2, maxLength: 2, pattern: "^[A-Z]{2}$" },
      capacidad_total: { bsonType: "number", minimum: 0 },
      geometria: {
        bsonType: "object",
        required: ["type", "coordinates"],
        properties: {
          type: { enum: ["Point"] },
          coordinates: {
            bsonType: "array",
            minItems: 2,
            maxItems: 2,
            items: [
              { bsonType: "number", minimum: -180, maximum: 180 },
              { bsonType: "number", minimum: -90, maximum: 90 },
            ],
          },
        },
      },
      salas: {
        bsonType: "array",
        maxItems: 10,
        items: {
          bsonType: "object",
          required: ["nombre", "capacidad"],
          properties: {
            nombre: { bsonType: "string", minLength: 1, maxLength: 120 },
            capacidad: { bsonType: "number", minimum: 0 },
            piso: { bsonType: "number", minimum: 0 },
            tipo: { bsonType: "string", minLength: 1, maxLength: 40 },
          },
        },
      },
      activo: { bsonType: "bool" },
      creado_en: { bsonType: "date" },
    },
  },
};

const VALIDADOR_EVENTOS: Document = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "nombre",
      "slug",
      "tipo_evento",
      "fecha_inicio",
      "fecha_fin",
      "organizador_id",
      "lugar_id",
      "creado_en",
      "actualizado_en",
    ],
    properties: {
      nombre: { bsonType: "string", minLength: 1, maxLength: 200 },
      slug: { bsonType: "string", minLength: 1, pattern: "^[a-z0-9-]+$" },
      descripcion: { bsonType: "string", maxLength: 2000 },
      tipo_evento: { enum: [...TIPO_EVENTO] },
      estado: { enum: [...ESTADO_EVENTO] },
      visibilidad: { enum: [...VISIBILIDAD_EVENTO] },
      fecha_inicio: { bsonType: "date" },
      fecha_fin: { bsonType: "date" },
      organizador_id: { bsonType: "objectId" },
      lugar_id: { bsonType: "objectId" },
      categorias: {
        bsonType: "array",
        maxItems: 5,
        items: { bsonType: "string", minLength: 1, maxLength: 60 },
      },
      tags: {
        bsonType: "array",
        maxItems: 20,
        items: { bsonType: "string", minLength: 1, maxLength: 40 },
      },
      tipos_ticket: {
        bsonType: "array",
        // El documento 04 §7 muestra `maxItems: 20` en su ejemplo, pero las
        // reglas de modelado §1.2 y §3.3 fijan 10: manda la regla de modelado
        // (y el dominio valida con el mismo tope).
        maxItems: 10,
        items: {
          bsonType: "object",
          required: ["_id", "nombre", "precio_cop", "aforo_total"],
          properties: {
            _id: { bsonType: "objectId" },
            nombre: { bsonType: "string", minLength: 1, maxLength: 120 },
            precio_cop: { bsonType: "number", minimum: 0 },
            aforo_total: { bsonType: "number", minimum: 0 },
            aforo_vendido: { bsonType: "number", minimum: 0 },
            restricciones: {
              bsonType: "object",
              properties: {
                edad_minima: { bsonType: "number", minimum: 0 },
                max_por_compra: { bsonType: "number", minimum: 1 },
                venta_inicio: { bsonType: "date" },
                venta_fin: { bsonType: "date" },
              },
            },
          },
        },
      },
      promociones: {
        bsonType: "array",
        maxItems: 10,
        items: {
          bsonType: "object",
          required: ["codigo", "tipo", "valor", "vigencia_inicio", "vigencia_fin"],
          properties: {
            codigo: {
              bsonType: "string",
              minLength: 1,
              maxLength: 64,
              pattern: "^[A-Z0-9_-]+$",
            },
            tipo: { enum: [...TIPO_PROMOCION] },
            valor: { bsonType: "number", minimum: 1 },
            aplica_a_tipo_ticket_ids: { bsonType: "array", items: { bsonType: "objectId" } },
            vigencia_inicio: { bsonType: "date" },
            vigencia_fin: { bsonType: "date" },
            usos_maximos: { bsonType: "number", minimum: 0 },
            usos_realizados: { bsonType: "number", minimum: 0 },
            activo: { bsonType: "bool" },
          },
        },
      },
      configuracion_evento: {
        bsonType: "object",
        properties: {
          plantilla_id: { bsonType: "string", minLength: 1, maxLength: 64 },
          branding: {
            bsonType: "object",
            required: ["color_primario", "color_secundario", "logo_url"],
            properties: {
              color_primario: { bsonType: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
              color_secundario: { bsonType: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
              logo_url: { bsonType: "string" },
            },
          },
          encuesta_post_evento: {
            bsonType: "object",
            properties: {
              habilitada: { bsonType: "bool" },
              preguntas: {
                bsonType: "array",
                maxItems: 20,
                items: {
                  bsonType: "object",
                  required: ["id", "tipo", "texto"],
                  properties: {
                    id: { bsonType: "string", minLength: 1, maxLength: 32 },
                    tipo: { enum: [...TIPO_PREGUNTA] },
                    texto: { bsonType: "string", minLength: 1, maxLength: 300 },
                    rango: {
                      bsonType: "array",
                      minItems: 2,
                      maxItems: 2,
                      items: { bsonType: "number" },
                    },
                  },
                },
              },
            },
          },
          hibrido: {
            bsonType: "object",
            properties: {
              habilitado: { bsonType: "bool" },
              url_streaming: { bsonType: "string" },
            },
          },
        },
      },
      metricas_evento: {
        bsonType: "object",
        properties: {
          tickets_vendidos_total: { bsonType: "number", minimum: 0 },
          ingresos_cop: { bsonType: "number", minimum: 0 },
          ultima_actualizacion: { bsonType: "date" },
        },
      },
      creado_en: { bsonType: "date" },
      actualizado_en: { bsonType: "date" },
      _v: { bsonType: "number", minimum: 0 },
    },
  },
};

const VALIDADOR_TICKETS: Document = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "codigo_qr",
      "evento_id",
      "comprado_por_usuario_id",
      "snapshot_tipo_ticket",
      "asistente_snapshot",
      "precio_pagado_cop",
      "emitido_en",
    ],
    properties: {
      codigo_qr: { bsonType: "string", minLength: 4, maxLength: 64, pattern: "^[A-Z0-9-]+$" },
      estado: { enum: [...ESTADO_TICKET] },
      evento_id: { bsonType: "objectId" },
      comprado_por_usuario_id: { bsonType: "objectId" },
      snapshot_tipo_ticket: {
        bsonType: "object",
        required: ["tipo_ticket_id", "nombre", "precio_cop"],
        properties: {
          tipo_ticket_id: { bsonType: "objectId" },
          nombre: { bsonType: "string", minLength: 1, maxLength: 120 },
          precio_cop: { bsonType: "number", minimum: 0 },
        },
      },
      asistente_snapshot: {
        bsonType: "object",
        required: ["usuario_id", "nombre", "documento_identidad", "email"],
        properties: {
          usuario_id: { bsonType: "objectId" },
          nombre: { bsonType: "string", minLength: 1, maxLength: 200 },
          documento_identidad: { bsonType: "string", minLength: 3, maxLength: 32 },
          email: { bsonType: "string", minLength: 1 },
        },
      },
      precio_pagado_cop: { bsonType: "number", minimum: 0 },
      promocion_aplicada_codigo: { bsonType: "string", minLength: 1, maxLength: 64 },
      transaccion_id: { bsonType: "objectId" },
      emitido_en: { bsonType: "date" },
      validado_en: { bsonType: ["date", "null"] },
      validado_por_puerta: { bsonType: ["string", "null"], minLength: 1, maxLength: 64 },
      revalidaciones: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["fecha", "resultado"],
          properties: {
            fecha: { bsonType: "date" },
            puerta: { bsonType: "string", minLength: 1, maxLength: 64 },
            resultado: { enum: [...RESULTADO_REVALIDACION] },
          },
        },
      },
      _v: { bsonType: "number", minimum: 0 },
    },
  },
};

const VALIDADOR_TRANSACCIONES: Document = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "usuario_id",
      "ticket_id",
      "monto_cop",
      "metodo_pago",
      "pasarela",
      "referencia_pasarela",
      "creada_en",
    ],
    properties: {
      usuario_id: { bsonType: "objectId" },
      ticket_id: { bsonType: "objectId" },
      monto_cop: { bsonType: "number", minimum: 0 },
      moneda: { bsonType: "string", minLength: 3, maxLength: 3 },
      metodo_pago: { enum: [...METODO_PAGO] },
      pasarela: { bsonType: "string", minLength: 1, maxLength: 64 },
      estado: { enum: [...ESTADO_TRANSACCION] },
      referencia_pasarela: { bsonType: "string", minLength: 1, maxLength: 128 },
      creada_en: { bsonType: "date" },
      confirmada_en: { bsonType: "date" },
    },
  },
};

const VALIDADOR_AUDITORIA: Document = {
  $jsonSchema: {
    bsonType: "object",
    required: ["actor_id", "actor_rol", "accion", "sujeto_tipo", "sujeto_id", "ocurrido_en"],
    properties: {
      actor_id: { bsonType: "objectId" },
      actor_rol: { enum: [...ROL_ACTOR] },
      accion: {
        bsonType: "string",
        minLength: 3,
        maxLength: 128,
        pattern: "^[a-z0-9_.-]+$",
      },
      sujeto_tipo: { enum: [...TIPO_SUJETO] },
      sujeto_id: { bsonType: "objectId" },
      // `metadata` es libre a propósito: es la parte flexible del modelo
      // (NFR-04) y el dominio tampoco le impone un catálogo cerrado.
      metadata: { bsonType: "object" },
      ocurrido_en: { bsonType: "date" },
    },
  },
};

/** Validador de cada colección, indexado por nombre de colección. */
export const VALIDADORES: Record<string, Document> = {
  usuarios: VALIDADOR_USUARIOS,
  lugares: VALIDADOR_LUGARES,
  eventos: VALIDADOR_EVENTOS,
  tickets: VALIDADOR_TICKETS,
  transacciones: VALIDADOR_TRANSACCIONES,
  auditoria_eventos: VALIDADOR_AUDITORIA,
};

/** Nombres de las colecciones con esquema validado, en orden de documento. */
export const COLECCIONES = Object.keys(VALIDADORES);
