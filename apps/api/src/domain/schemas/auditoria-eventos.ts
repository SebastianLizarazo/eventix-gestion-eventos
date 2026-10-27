import { z } from "zod";
import { dateSchema, objectIdSchema } from "./common.js";

/**
 * Esquema de `auditoria_eventos` (documento 04 §3.6): append-only, separada
 * del tráfico transaccional. `metadata` es libre a propósito: es la parte
 * flexible del modelo (NFR-04) y no debe bloquearse con un catálogo cerrado.
 */

export const ROL_ACTOR = ["asistente", "organizador", "sistema"] as const;
export const TIPO_SUJETO = [
  "ticket",
  "evento",
  "transaccion",
  "usuario",
  "lugar",
  "promocion",
] as const;

export const auditoriaSchema = z.object({
  _id: objectIdSchema.optional(),
  actor_id: objectIdSchema,
  actor_rol: z.enum(ROL_ACTOR),
  accion: z
    .string()
    .trim()
    .min(3)
    .max(128)
    .regex(/^[a-z0-9_.]+$/, "La acción debe ir en minúsculas y con notación de dominio"),
  sujeto_tipo: z.enum(TIPO_SUJETO),
  sujeto_id: objectIdSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
  ocurrido_en: dateSchema,
});

export type Auditoria = z.output<typeof auditoriaSchema>;
