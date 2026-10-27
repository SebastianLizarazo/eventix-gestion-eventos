import { z } from "zod";
import { normalizeEmail } from "../normalization.js";
import { validar } from "../validar.js";
import { dateSchema, objectIdSchema } from "./common.js";

/** Esquema de `usuarios` (documento 04 §3.1). */

export const TIPO_USUARIO = ["asistente", "organizador"] as const;
export const CANAL_NOTIFICACION = ["email", "sms", "push"] as const;

export const tipoUsuarioSchema = z.enum(TIPO_USUARIO);
export const canalNotificacionSchema = z.enum(CANAL_NOTIFICACION);

export const preferenciasSchema = z.object({
  newsletter: z.boolean().default(false),
  idioma: z.string().trim().min(2).max(10).default("es-CO"),
  canal_notif: z.array(canalNotificacionSchema).default([]),
});

export const estadisticasSchema = z.object({
  eventos_asistidos: z.number().int().nonnegative().default(0),
  tickets_comprados: z.number().int().nonnegative().default(0),
  ltv_cop: z.number().nonnegative().default(0),
});

/** Datos que acepta la aplicación para dar de alta un usuario. */
export const usuarioInputSchema = z.object({
  email: z.string().trim().email("Debe ser un correo electrónico válido"),
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  telefono: z
    .string()
    .trim()
    .min(5)
    .max(32)
    .regex(/\d/, "El teléfono debe incluir al menos un dígito")
    .optional(),
  documento_identidad: z.string().trim().min(3).max(32),
  tipo_usuario: z
    .array(tipoUsuarioSchema)
    .min(1, "El usuario debe tener al menos un tipo")
    .default(["asistente"]),
  fecha_nacimiento: dateSchema.optional(),
  preferencias: preferenciasSchema.default({
    newsletter: false,
    idioma: "es-CO",
    canal_notif: [],
  }),
  estadisticas: estadisticasSchema.default({
    eventos_asistidos: 0,
    tickets_comprados: 0,
    ltv_cop: 0,
  }),
});

const usuarioDocumentoBase = usuarioInputSchema.extend({
  _id: objectIdSchema.optional(),
  email_normalizado: z.string().min(1),
  creado_en: dateSchema,
  actualizado_en: dateSchema,
  _v: z.number().int().nonnegative().default(0),
});

/**
 * Documento persistido de `usuarios`.
 *
 * `email_normalizado` es derivado, nunca libre: se valida que coincida con la
 * normalización del correo (documento 04 §3.1), que es lo que sostiene el
 * índice unique.
 */
export const usuarioSchema = usuarioDocumentoBase.superRefine((usuario, ctx) => {
  const esperado = normalizeEmail(usuario.email);

  if (usuario.email_normalizado !== esperado) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["email_normalizado"],
      message: `Debe ser el correo normalizado (${esperado})`,
    });
  }
});

export type Usuario = z.output<typeof usuarioSchema>;
export type UsuarioInput = z.input<typeof usuarioInputSchema>;

/** Prepara un usuario para persistir: deriva el correo normalizado y las marcas de tiempo. */
export function prepararUsuario(input: unknown, ahora: Date = new Date()): Usuario {
  const base = validar(usuarioInputSchema, input, "usuario");

  return validar(
    usuarioSchema,
    {
      ...base,
      email_normalizado: normalizeEmail(base.email),
      creado_en: ahora,
      actualizado_en: ahora,
      _v: 0,
    },
    "usuario",
  );
}
