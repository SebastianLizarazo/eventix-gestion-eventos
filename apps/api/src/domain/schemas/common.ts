import { ObjectId } from "mongodb";
import { z } from "zod";
import { parsearFechaIso } from "../fechas.js";
import { PATRON_OBJECT_ID } from "../ids.js";

/** Piezas compartidas por los esquemas de las seis colecciones. */

/**
 * Identificador del dominio: hexadecimal de 24 caracteres (forma de un ObjectId).
 *
 * Acepta también el `ObjectId` nativo de MongoDB y lo normaliza a hexadecimal:
 * es el punto único de conversión cuando la capa de persistencia lee un
 * documento real y la capa de dominio trabaja siempre con cadenas.
 */
export const objectIdSchema = z
  .union([
    z.string().regex(PATRON_OBJECT_ID, "Debe ser un identificador hexadecimal de 24 caracteres"),
    z.instanceof(ObjectId),
  ])
  .transform((valor) => (typeof valor === "string" ? valor.toLowerCase() : valor.toHexString()));

/**
 * Fecha ISO 8601 (o `Date` nativo) normalizada a `Date`.
 *
 * Las fechas sin zona se interpretan como UTC y las fechas de calendario
 * inexistentes ("2025-02-30") se rechazan en lugar de desplazarse solas.
 */
export const dateSchema = z.preprocess(
  (valor) => {
    if (valor instanceof Date) {
      return valor;
    }
    if (typeof valor !== "string") {
      return valor;
    }
    return parsearFechaIso(valor) ?? valor;
  },
  z.date({ invalid_type_error: "Debe ser una fecha ISO 8601 válida" }),
);

/** Slug de URL: minúsculas, dígitos y guiones (mismo patrón que el validator del servidor). */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, "Debe ser un slug en minúsculas con el patrón ^[a-z0-9-]+$");
