import { z } from "zod";
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
    .transform((valor) => valor.toUpperCase()),
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
