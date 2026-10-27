import type { output, ZodTypeAny } from "zod";
import { errorMapDominio } from "./error-map.js";
import { ErrorValidacion } from "./errors.js";

/**
 * Valida datos contra un esquema de Zod y traduce el fallo a un error tipado
 * con detalle **por campo**, que es lo que consume el middleware de errores.
 */
export function validar<S extends ZodTypeAny>(
  esquema: S,
  datos: unknown,
  contexto?: string,
): output<S> {
  const resultado = esquema.safeParse(datos, { errorMap: errorMapDominio });

  if (resultado.success) {
    return resultado.data;
  }

  const campos = resultado.error.issues.map((issue) => ({
    campo: issue.path.length > 0 ? issue.path.join(".") : "(raíz)",
    mensaje: issue.message,
    codigo: issue.code,
  }));

  throw new ErrorValidacion(
    campos,
    contexto ? `Validación fallida en ${contexto}` : "Validación falló",
  );
}
