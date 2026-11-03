import { z } from "zod";
import { validar } from "../validar.js";
import { dateSchema, objectIdSchema } from "./common.js";

/** Esquema de `transacciones` (documento 04 §3.5): sin embebidos, escritura alta. */

export const ESTADO_TRANSACCION = [
  "pendiente",
  "aprobada",
  "rechazada",
  "anulada",
  "reembolsada",
] as const;

export const METODO_PAGO = [
  "tarjeta_credito",
  "tarjeta_debito",
  "efectivo",
  "transferencia",
] as const;

export const transaccionSchema = z.object({
  _id: objectIdSchema.optional(),
  usuario_id: objectIdSchema,
  ticket_id: objectIdSchema,
  monto_cop: z.number().int().nonnegative(),
  moneda: z
    .string()
    .trim()
    .length(3, "La moneda debe ser un código ISO 4217 de 3 letras")
    .default("COP"),
  metodo_pago: z.enum(METODO_PAGO),
  pasarela: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, "Nombre de pasarela inválido"),
  estado: z.enum(ESTADO_TRANSACCION).default("pendiente"),
  referencia_pasarela: z.string().trim().min(1).max(128),
  creada_en: dateSchema,
  confirmada_en: dateSchema.optional(),
});

export type Transaccion = z.output<typeof transaccionSchema>;

/**
 * Datos que acepta el cliente al crear una transacción.
 *
 * El servidor pone el identificador y las dos marcas de tiempo: la de creación
 * la pone la API y la de confirmación, el flujo de pago.
 */
export const transaccionInputSchema = transaccionSchema.omit({
  _id: true,
  creada_en: true,
  confirmada_en: true,
});

/** Prepara una transacción para persistir: le asigna la fecha de creación. */
export function prepararTransaccion(input: unknown, ahora: Date = new Date()): Transaccion {
  const base = validar(transaccionInputSchema, input, "transacción");

  return validar(transaccionSchema, { ...base, creada_en: ahora }, "transacción");
}
