import { z } from "zod";
import { normalizarCodigo } from "../normalization.js";
import { validar } from "../validar.js";
import { dateSchema, objectIdSchema } from "./common.js";

/**
 * Esquema de `tickets` (documento 04 §3.4): colección de cardinalidad alta con
 * *snapshot* del tipo de ticket y del asistente (inmutabilidad histórica).
 */

export const ESTADO_TICKET = ["emitido", "usado", "anulado"] as const;
export const RESULTADO_REVALIDACION = ["aceptado", "rechazado"] as const;

export const snapshotTipoTicketSchema = z.object({
  tipo_ticket_id: objectIdSchema,
  nombre: z.string().trim().min(1).max(120),
  precio_cop: z.number().int().nonnegative(),
});

export const asistenteSnapshotSchema = z.object({
  usuario_id: objectIdSchema,
  nombre: z.string().trim().min(1).max(200),
  documento_identidad: z.string().trim().min(3).max(32),
  email: z.string().trim().email("Debe ser un correo electrónico válido"),
});

export const revalidacionSchema = z.object({
  fecha: dateSchema,
  puerta: z.string().trim().min(1).max(64).optional(),
  resultado: z.enum(RESULTADO_REVALIDACION),
});

export const ticketSchema = z.object({
  _id: objectIdSchema.optional(),
  codigo_qr: z
    .string()
    .trim()
    .min(4)
    .max(64)
    .regex(/^[A-Za-z0-9-]+$/, "El código QR solo admite letras, dígitos y guiones")
    .transform(normalizarCodigo),
  estado: z.enum(ESTADO_TICKET).default("emitido"),
  evento_id: objectIdSchema,
  comprado_por_usuario_id: objectIdSchema,
  snapshot_tipo_ticket: snapshotTipoTicketSchema,
  asistente_snapshot: asistenteSnapshotSchema,
  precio_pagado_cop: z.number().int().nonnegative(),
  promocion_aplicada_codigo: z.string().trim().min(1).max(64).optional(),
  transaccion_id: objectIdSchema.optional(),
  emitido_en: dateSchema,
  validado_en: dateSchema.nullable().optional(),
  validado_por_puerta: z.string().trim().min(1).max(64).nullable().optional(),
  revalidaciones: z.array(revalidacionSchema).default([]),
  _v: z.number().int().nonnegative().default(0),
});

export type Ticket = z.output<typeof ticketSchema>;

/**
 * Datos que acepta el cliente al crear un ticket.
 *
 * El servidor pone el identificador, la fecha de emisión, el historial de
 * revalidaciones y la versión: son datos del sistema, no del cliente.
 */
export const ticketInputSchema = ticketSchema.omit({
  _id: true,
  emitido_en: true,
  validado_en: true,
  validado_por_puerta: true,
  revalidaciones: true,
  _v: true,
});

/** Prepara un ticket para persistir: le asigna la fecha de emisión y la versión. */
export function prepararTicket(input: unknown, ahora: Date = new Date()): Ticket {
  const base = validar(ticketInputSchema, input, "ticket");

  return validar(ticketSchema, { ...base, emitido_en: ahora, revalidaciones: [], _v: 0 }, "ticket");
}
