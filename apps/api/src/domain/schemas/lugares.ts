import { z } from "zod";
import { dateSchema, objectIdSchema } from "./common.js";

/** Esquema de `lugares` (documento 04 §3.2). */

/** Geometría GeoJSON. Las coordenadas van en orden [longitud, latitud]. */
export const geometriaSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([
    z.number().min(-180, "Longitud fuera de rango").max(180, "Longitud fuera de rango"),
    z.number().min(-90, "Latitud fuera de rango").max(90, "Latitud fuera de rango"),
  ]),
});

export const salaSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  capacidad: z.number().int().nonnegative(),
  piso: z.number().int().nonnegative().optional(),
  tipo: z.string().trim().min(1).max(40).optional(),
});

export const lugarInputSchema = z.object({
  nombre: z.string().trim().min(1).max(200),
  direccion: z.string().trim().min(1).max(300),
  ciudad: z.string().trim().min(1).max(120),
  pais: z
    .string()
    .trim()
    .length(2, "El país debe ser un código ISO 3166-1 alfa-2")
    .regex(/^[A-Za-z]{2}$/, "El país debe ser un código ISO 3166-1 alfa-2")
    .transform((valor) => valor.toUpperCase()),
  capacidad_total: z.number().int().nonnegative(),
  geometria: geometriaSchema,
  salas: z.array(salaSchema).max(10, "Máximo 10 salas embebidas por lugar").default([]),
  activo: z.boolean().default(true),
});

export const lugarSchema = lugarInputSchema.extend({
  _id: objectIdSchema.optional(),
  creado_en: dateSchema,
});

export type Lugar = z.output<typeof lugarSchema>;
export type LugarInput = z.input<typeof lugarInputSchema>;
