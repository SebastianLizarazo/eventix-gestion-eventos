import { z } from "zod";
import { slugify, normalizarCodigo } from "../normalization.js";
import { validar } from "../validar.js";
import { dateSchema, objectIdSchema, slugSchema } from "./common.js";

/**
 * Esquema de `eventos` (documento 04 §3.3), la colección central: embebe
 * tipos_ticket, promociones, configuración y métricas para que el dashboard
 * operativo se resuelva con una sola lectura.
 */

export const TIPO_EVENTO = ["corporativo", "masivo", "hibrido", "academico"] as const;
export const ESTADO_EVENTO = ["borrador", "publicado", "cancelado", "finalizado"] as const;
export const VISIBILIDAD_EVENTO = ["publico", "privado"] as const;
export const TIPO_PROMOCION = ["porcentaje", "2x1", "early_bird"] as const;
export const TIPO_PREGUNTA = ["escala", "abierta"] as const;

export const restriccionesSchema = z
  .object({
    edad_minima: z.number().int().nonnegative().optional(),
    max_por_compra: z.number().int().positive().optional(),
    venta_inicio: dateSchema.optional(),
    venta_fin: dateSchema.optional(),
  })
  .superRefine((restricciones, ctx) => {
    if (
      restricciones.venta_inicio &&
      restricciones.venta_fin &&
      restricciones.venta_fin <= restricciones.venta_inicio
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["venta_fin"],
        message: "venta_fin debe ser posterior a venta_inicio",
      });
    }
  });

export const tipoTicketSchema = z
  .object({
    _id: objectIdSchema,
    nombre: z.string().trim().min(1).max(120),
    precio_cop: z.number().int().nonnegative(),
    aforo_total: z.number().int().nonnegative(),
    aforo_vendido: z.number().int().nonnegative().default(0),
    restricciones: restriccionesSchema.default({}),
  })
  .superRefine((tipo, ctx) => {
    if (tipo.aforo_vendido > tipo.aforo_total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["aforo_vendido"],
        message: "aforo_vendido no puede superar aforo_total",
      });
    }
  });

export const promocionSchema = z
  .object({
    codigo: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/, "El código solo admite letras, dígitos, guiones y guiones bajos")
      .transform(normalizarCodigo),
    tipo: z.enum(TIPO_PROMOCION),
    valor: z.number().int().positive(),
    aplica_a_tipo_ticket_ids: z.array(objectIdSchema).default([]),
    vigencia_inicio: dateSchema,
    vigencia_fin: dateSchema,
    usos_maximos: z.number().int().nonnegative().optional(),
    usos_realizados: z.number().int().nonnegative().default(0),
    activo: z.boolean().default(false),
  })
  .superRefine((promocion, ctx) => {
    if (promocion.vigencia_fin <= promocion.vigencia_inicio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vigencia_fin"],
        message: "vigencia_fin debe ser posterior a vigencia_inicio",
      });
    }

    if (
      promocion.usos_maximos !== undefined &&
      promocion.usos_realizados > promocion.usos_maximos
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["usos_realizados"],
        message: "usos_realizados no puede superar usos_maximos",
      });
    }

    if (
      (promocion.tipo === "porcentaje" || promocion.tipo === "early_bird") &&
      promocion.valor > 100
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valor"],
        message: "El descuento porcentual no puede superar 100",
      });
    }

    if (promocion.tipo === "2x1" && promocion.valor < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valor"],
        message: "Una promoción 2x1 necesita un valor mínimo de 2",
      });
    }
  });

export const brandingSchema = z.object({
  color_primario: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color hexadecimal inválido"),
  color_secundario: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color hexadecimal inválido"),
  logo_url: z.string().url("URL de logo inválida"),
});

export const preguntaSchema = z
  .object({
    id: z.string().trim().min(1).max(32),
    tipo: z.enum(TIPO_PREGUNTA),
    texto: z.string().trim().min(1).max(300),
    rango: z.tuple([z.number().int(), z.number().int()]).optional(),
  })
  .superRefine((pregunta, ctx) => {
    if (pregunta.tipo === "escala" && !pregunta.rango) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rango"],
        message: "Una pregunta de escala necesita su rango de valores",
      });
    }

    if (pregunta.rango && pregunta.rango[0] >= pregunta.rango[1]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rango"],
        message: "El mínimo del rango debe ser menor que el máximo",
      });
    }
  });

export const encuestaSchema = z.object({
  habilitada: z.boolean().default(false),
  preguntas: z.array(preguntaSchema).max(20, "Máximo 20 preguntas").default([]),
});

export const hibridoSchema = z.object({
  habilitado: z.boolean().default(false),
  url_streaming: z.string().url("URL de streaming inválida").optional(),
});

export const configuracionEventoSchema = z
  .object({
    plantilla_id: z.string().trim().min(1).max(64).optional(),
    branding: brandingSchema.optional(),
    encuesta_post_evento: encuestaSchema.optional(),
    hibrido: hibridoSchema.optional(),
  })
  .superRefine((configuracion, ctx) => {
    const hibrido = configuracion.hibrido;

    if (hibrido && hibrido.habilitado && !hibrido.url_streaming) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hibrido", "url_streaming"],
        message: "Un evento híbrido habilitado necesita su url_streaming",
      });
    }
  });

export const metricasEventoSchema = z.object({
  tickets_vendidos_total: z.number().int().nonnegative().default(0),
  ingresos_cop: z.number().int().nonnegative().default(0),
  ultima_actualizacion: dateSchema.optional(),
});

const eventoBaseSchema = z.object({
  slug: slugSchema.optional(),
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  tipo_evento: z.enum(TIPO_EVENTO),
  descripcion: z.string().trim().max(2000).optional(),
  fecha_inicio: dateSchema,
  fecha_fin: dateSchema,
  estado: z.enum(ESTADO_EVENTO).default("borrador"),
  visibilidad: z.enum(VISIBILIDAD_EVENTO).default("publico"),
  organizador_id: objectIdSchema,
  lugar_id: objectIdSchema,
  categorias: z.array(z.string().trim().min(1).max(60)).max(5, "Máximo 5 categorías").default([]),
  configuracion_evento: configuracionEventoSchema.default({}),
  tipos_ticket: z.array(tipoTicketSchema).max(10, "Máximo 10 tipos de ticket").default([]),
  promociones: z.array(promocionSchema).max(10, "Máximo 10 promociones embebidas").default([]),
  metricas_evento: metricasEventoSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20, "Máximo 20 tags").default([]),
});

type EventoBase = z.output<typeof eventoBaseSchema>;

/**
 * Reglas de negocio que el validator `$jsonSchema` del servidor no puede
 * expresar (o no debería expresar): coherencia de fechas, integridad de las
 * referencias embebidas y cardinalidad de promociones activas.
 */
function refinarEvento(evento: EventoBase, ctx: z.RefinementCtx): void {
  if (evento.fecha_fin <= evento.fecha_inicio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fecha_fin"],
      message: "fecha_fin debe ser posterior a fecha_inicio",
    });
  }

  const idsTipoTicket = new Set(evento.tipos_ticket.map((tipo) => tipo._id));

  evento.promociones.forEach((promocion, indice) => {
    promocion.aplica_a_tipo_ticket_ids.forEach((id, posicion) => {
      if (!idsTipoTicket.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["promociones", indice, "aplica_a_tipo_ticket_ids", posicion],
          message: `El tipo de ticket ${id} no pertenece a este evento`,
        });
      }
    });
  });

  const promocionesActivas = evento.promociones.filter((promocion) => promocion.activo).length;

  if (promocionesActivas > 5) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["promociones"],
      message: "Máximo 5 promociones activas por evento",
    });
  }
}

/** Datos que acepta la aplicación para dar de alta un evento. */
export const eventoInputSchema = eventoBaseSchema.superRefine(refinarEvento);

/** Documento persistido de `eventos`. */
export const eventoSchema = eventoBaseSchema
  .extend({
    _id: objectIdSchema.optional(),
    slug: slugSchema,
    creado_en: dateSchema,
    actualizado_en: dateSchema,
    _v: z.number().int().nonnegative().default(0),
  })
  .superRefine(refinarEvento);

export type Evento = z.output<typeof eventoSchema>;
export type EventoInput = z.input<typeof eventoInputSchema>;
export type TipoTicket = z.output<typeof tipoTicketSchema>;
export type Promocion = z.output<typeof promocionSchema>;

/** Prepara un evento para persistir: deriva el slug, las métricas y las marcas de tiempo. */
export function prepararEvento(input: unknown, ahora: Date = new Date()): Evento {
  const base = validar(eventoInputSchema, input, "evento");

  return validar(
    eventoSchema,
    {
      ...base,
      slug: base.slug ?? slugify(base.nombre),
      metricas_evento: base.metricas_evento ?? {
        tickets_vendidos_total: 0,
        ingresos_cop: 0,
        ultima_actualizacion: ahora,
      },
      creado_en: ahora,
      actualizado_en: ahora,
      _v: 0,
    },
    "evento",
  );
}
