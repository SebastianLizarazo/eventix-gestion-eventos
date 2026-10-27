import { z } from "zod";
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
    .regex(/^[A-Za-z0-9_-]+$/, "Nombre de pasarela inválido"),
  estado: z.enum(ESTADO_TRANSACCION).default("pendiente"),
  referencia_pasarela: z.string().trim().min(1).max(128),
  creada_en: dateSchema,
  confirmada_en: dateSchema.optional(),
});

export type Transaccion = z.output<typeof transaccionSchema>;
