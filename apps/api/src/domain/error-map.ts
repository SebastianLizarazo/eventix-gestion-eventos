import { z } from "zod";

/**
 * Mapa de errores de Zod en español.
 *
 * Zod permite asociar un `errorMap` por parseo (`safeParse(data, { errorMap })`).
 * Ese mapa tiene prioridad sobre el global y se propaga a los esquemas
 * anidados, así que los mensajes por defecto quedan en español sin tocar el
 * estado global de la librería.
 *
 * Los mensajes custom que declara cada esquema (`z.string().min(1, "...")`)
 * siguen teniendo prioridad: Zod los aplica antes de consultar el mapa.
 */

const NOMBRES_TIPO: Record<string, string> = {
  string: "texto",
  number: "número",
  bigint: "número entero grande",
  boolean: "booleano",
  date: "fecha",
  array: "lista",
  object: "objeto",
  null: "nulo",
  undefined: "indefinido",
  nan: "número",
};

export const errorMapDominio: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined") {
        return { message: "El campo es obligatorio" };
      }
      return {
        message:
          `Se esperaba ${NOMBRES_TIPO[issue.expected] ?? issue.expected} ` +
          `y se recibió ${NOMBRES_TIPO[issue.received] ?? issue.received}`,
      };

    case z.ZodIssueCode.too_small:
      if (issue.type === "string") {
        return { message: `Debe tener al menos ${issue.minimum} caracteres` };
      }
      if (issue.type === "array") {
        return { message: `Debe tener al menos ${issue.minimum} elementos` };
      }
      if (issue.type === "date") {
        return { message: "La fecha es anterior a la mínima admitida" };
      }
      return { message: `Debe ser mayor o igual a ${issue.minimum}` };

    case z.ZodIssueCode.too_big:
      if (issue.type === "string") {
        return { message: `Debe tener como máximo ${issue.maximum} caracteres` };
      }
      if (issue.type === "array") {
        return { message: `Debe tener como máximo ${issue.maximum} elementos` };
      }
      if (issue.type === "date") {
        return { message: "La fecha es posterior a la máxima admitida" };
      }
      return { message: `Debe ser menor o igual a ${issue.maximum}` };

    case z.ZodIssueCode.invalid_enum_value:
      return {
        message: `Valor inválido: se esperaba ${issue.options
          .map((opcion) => `"${opcion}"`)
          .join(" | ")}`,
      };

    case z.ZodIssueCode.invalid_literal:
      return { message: `Valor inválido: se esperaba ${JSON.stringify(issue.expected)}` };

    case z.ZodIssueCode.invalid_date:
      return { message: "La fecha no es válida" };

    case z.ZodIssueCode.invalid_string:
      return { message: `Formato de texto inválido (${issue.validation})` };

    case z.ZodIssueCode.unrecognized_keys:
      return { message: `Claves no permitidas: ${issue.keys.join(", ")}` };

    case z.ZodIssueCode.invalid_union:
      return { message: "El valor no coincide con ningún formato admitido" };

    case z.ZodIssueCode.invalid_union_discriminator:
      return { message: "El discriminador de la unión no es válido" };

    case z.ZodIssueCode.not_multiple_of:
      return { message: `El valor debe ser múltiplo de ${issue.multipleOf}` };

    case z.ZodIssueCode.invalid_arguments:
    case z.ZodIssueCode.invalid_return_type:
      return { message: "Fallo interno de la validación" };

    case z.ZodIssueCode.invalid_intersection_types:
      return { message: "El valor no cumple ninguna de las reglas combinadas" };

    case z.ZodIssueCode.custom:
      return { message: ctx.defaultError || "Regla de negocio incumplida" };

    default:
      return { message: ctx.defaultError || "Valor inválido" };
  }
};
