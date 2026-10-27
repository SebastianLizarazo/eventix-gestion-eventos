import { z } from "zod";
import { PATRON_OBJECT_ID } from "../ids.js";

/** Piezas compartidas por los esquemas de las seis colecciones. */

/** Identificador del dominio: hexadecimal de 24 caracteres (forma de un ObjectId). */
export const objectIdSchema = z
  .string()
  .regex(PATRON_OBJECT_ID, "Debe ser un identificador hexadecimal de 24 caracteres");

/** Fecha ISO 8601 (o Date nativo) normalizada a `Date`. */
const PATRON_ISO = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

export const dateSchema = z.preprocess(
  (valor) => {
    if (valor instanceof Date) {
      return valor;
    }
    if (typeof valor !== "string") {
      return valor;
    }
    const texto = valor.trim();
    if (!PATRON_ISO.test(texto)) {
      return valor;
    }
    const fecha = new Date(texto);
    return Number.isNaN(fecha.getTime()) ? valor : fecha;
  },
  z.date({ invalid_type_error: "Debe ser una fecha ISO 8601 válida" }),
);

/** Slug de URL: minúsculas, dígitos y guiones (mismo patrón que el validator del servidor). */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, "Debe ser un slug en minúsculas con el patrón ^[a-z0-9-]+$");
