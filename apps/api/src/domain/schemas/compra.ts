import { z } from "zod";
import { normalizarCodigo } from "../normalization.js";
import { objectIdSchema } from "./common.js";
import { METODO_PAGO } from "./transacciones.js";

/**
 * Datos que acepta el flujo de compra (spec S9).
 *
 * La compra es de **un ticket**: así lo modela el documento 04 §3.5, donde la
 * transacción apunta a su ticket (`ticket_id`) y el ticket a su transacción
 * (`transaccion_id`). El asistente es el usuario que asistirá (sus datos quedan
 * copiados en el snapshot del ticket) y puede ser distinto de quien paga.
 *
 * `referencia_pasarela` es la clave de idempotencia: el par
 * (`pasarela`, `referencia_pasarela`) identifica el cargo, y repetir la misma
 * compra con la misma referencia no vuelve a cobrar ni a ocupar cupo.
 */

export const entradaCompraSchema = z.object({
  /** Evento del que se compra el ticket. */
  evento_id: objectIdSchema,
  /** Tipo de ticket que se compra (embebido en el evento). */
  tipo_ticket_id: objectIdSchema,
  /** Usuario que paga. */
  usuario_id: objectIdSchema,
  /** Usuario que asiste: sus datos se copian al snapshot del ticket. */
  asistente_id: objectIdSchema,
  /** Método de pago con el que se paga. */
  metodo_pago: z.enum(METODO_PAGO),
  /** Pasarela de pago (el cargo vive en ella). */
  pasarela: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, "Nombre de pasarela inválido"),
  /** Referencia del cargo en la pasarela: la clave de idempotencia. */
  referencia_pasarela: z.string().trim().min(1).max(128),
  /** Código de la promoción a aplicar (opcional). */
  promocion_codigo: z.string().trim().min(1).max(64).transform(normalizarCodigo).optional(),
});

export type EntradaCompra = z.output<typeof entradaCompraSchema>;
