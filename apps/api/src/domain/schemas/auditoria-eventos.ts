import { z } from "zod";
import { validar } from "../validar.js";
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
    .regex(/^[a-z0-9_.-]+$/, "La acción debe ir en minúsculas y con notación de dominio"),
  sujeto_tipo: z.enum(TIPO_SUJETO),
  sujeto_id: objectIdSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
  ocurrido_en: dateSchema,
});

export type Auditoria = z.output<typeof auditoriaSchema>;

/**
 * Datos que acepta el cliente al registrar una auditoría.
 *
 * El servidor pone el identificador y la fecha de ocurrencia: el rastro se
 * escribe con la hora del servidor, no con la del cliente.
 */
export const auditoriaInputSchema = auditoriaSchema.omit({
  _id: true,
  ocurrido_en: true,
});

/** Prepara un registro de auditoría para persistir: le asigna la fecha de ocurrencia. */
export function prepararAuditoria(input: unknown, ahora: Date = new Date()): Auditoria {
  const base = validar(auditoriaInputSchema, input, "auditoría");

  return validar(auditoriaSchema, { ...base, ocurrido_en: ahora }, "auditoría");
}
