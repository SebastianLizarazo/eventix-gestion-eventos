import { z } from "zod";
import { ESTADO_EVENTO } from "./eventos.js";

/**
 * Esquemas del reporting (documento 01 §7.1).
 *
 * No son documentos: son **vistas**. El dashboard y el cierre contable no se
 * guardan en ninguna colección, se derivan de las que ya existen, así que sus
 * formas viven aquí para que el contrato OpenAPI se genere de la misma fuente
 * que el resto (y para que la forma de lo que devuelve la agregación no pueda
 * derivar sin que nadie lo note).
 */

/** Ocupación de un tipo de ticket: lo vendido sobre lo que había. */
export const ocupacionTipoTicketSchema = z.object({
  tipo_ticket_id: z.string(),
  nombre: z.string(),
  precio_cop: z.number().int().nonnegative(),
  aforo_total: z.number().int().nonnegative(),
  aforo_vendido: z.number().int().nonnegative(),
  ocupacion_pct: z.number().nonnegative(),
});

/**
 * Dashboard live de un evento.
 *
 * Se resuelve con **una sola lectura** sobre `eventos`: el evento embeba sus
 * tipos de ticket y sus métricas (documento 04 §3.3), así que el dashboard no
 * necesita un JOIN ni una segunda colección (CB-1).
 */
export const dashboardEventoSchema = z.object({
  evento_id: z.string(),
  nombre: z.string(),
  slug: z.string(),
  estado: z.enum(ESTADO_EVENTO),
  fecha_inicio: z.date(),
  fecha_fin: z.date(),
  metricas: z.object({
    tickets_vendidos_total: z.number().int().nonnegative(),
    ingresos_cop: z.number().int().nonnegative(),
    ultima_actualizacion: z.date().nullable(),
  }),
  tipos_ticket: z.array(ocupacionTipoTicketSchema),
  aforo_total: z.number().int().nonnegative(),
  aforo_vendido: z.number().int().nonnegative(),
  ocupacion_pct: z.number().nonnegative(),
});

/** Cantidad y monto de un estado de transacción en un día. */
export const resumenEstadoSchema = z.object({
  cantidad: z.number().int().nonnegative(),
  monto_cop: z.number().int().nonnegative(),
});

/**
 * Totales de un estado de transacción.
 *
 * El esquema es **cerrado**: los cinco estados siempre están, aunque valgan
 * cero. Un cierre contable que a veces trae un estado y a veces no obliga al
 * cliente a preguntar si falta el estado o si de verdad no hubo ninguno.
 */
export const estadosContablesSchema = z.object({
  pendiente: resumenEstadoSchema,
  aprobada: resumenEstadoSchema,
  rechazada: resumenEstadoSchema,
  anulada: resumenEstadoSchema,
  reembolsada: resumenEstadoSchema,
});

/** Un día del cierre contable. */
export const diaContableSchema = z.object({
  /** Día en UTC, con formato `YYYY-MM-DD`. */
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  por_estado: estadosContablesSchema,
  /**
   * Neto del día: lo aprobado menos lo reembolsado.
   *
   * Puede ser negativo: un día con más devoluciones que cobros cierra en
   * rojo, y esconderlo en un campo sin signo mentiría.
   */
  neto_cop: z.number().int(),
});

/**
 * Cierre contable diario.
 *
 * El cierre es **global**: `transacciones` no guarda el evento (el vínculo vive
 * en `ticket_id`), así que un desglose por evento exigiría unir cada
 * transacción con su ticket.
 */
export const cierreContableSchema = z.object({
  /** Límite inferior pedido (inclusive), o `null` si no se filtró. */
  desde: z.string().nullable(),
  /** Límite superior pedido (inclusive), o `null` si no se filtró. */
  hasta: z.string().nullable(),
  dias: z.array(diaContableSchema),
  /** Transacciones que todavía no tienen fecha de confirmación. */
  pendientes_sin_confirmar: resumenEstadoSchema,
  totales: z.object({
    cantidad: z.number().int().nonnegative(),
    monto_cop: z.number().int().nonnegative(),
    neto_cop: z.number().int(),
  }),
});

export type OcupacionTipoTicket = z.output<typeof ocupacionTipoTicketSchema>;
export type DashboardEvento = z.output<typeof dashboardEventoSchema>;
export type ResumenEstado = z.output<typeof resumenEstadoSchema>;
export type DiaContable = z.output<typeof diaContableSchema>;
export type CierreContable = z.output<typeof cierreContableSchema>;
export type EstadoContable = keyof z.output<typeof estadosContablesSchema>;
