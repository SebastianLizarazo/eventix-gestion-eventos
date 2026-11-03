import { LIMITE_MAXIMO, LIMITE_POR_DEFECTO } from "../db/repos/base.js";
import { ErrorHttp } from "./errores.js";

/**
 * Paginación de la API: los mismos parámetros (`skip` y `limit`) y los mismos
 * límites que aplica el repositorio, para que la página que ve el cliente sea
 * la que calculó la base.
 */

/** Página pedida por el cliente. */
export type Paginacion = {
  skip: number;
  limit: number;
};

/**
 * Lee `skip` y `limit` de la query.
 *
 * Un parámetro mal formado es un error de la petición (400), no un valor
 * silenciosamente ajustado: el cliente tiene que saber que lo que pidió no es
 * lo que recibió.
 */
export function leerPaginacion(query: Record<string, unknown>): Paginacion {
  const skip = leerEntero(query.skip, "skip");
  const limit = leerEntero(query.limit, "limit");

  if (skip === undefined && limit === undefined) {
    return { skip: 0, limit: LIMITE_POR_DEFECTO };
  }

  const resultado: Paginacion = {
    skip: skip ?? 0,
    limit: limit ?? LIMITE_POR_DEFECTO,
  };

  if (resultado.skip < 0) {
    throw ErrorHttp.peticionInvalida("El parámetro 'skip' no puede ser negativo");
  }

  if (resultado.limit < 1 || resultado.limit > LIMITE_MAXIMO) {
    throw ErrorHttp.peticionInvalida(`El parámetro 'limit' debe estar entre 1 y ${LIMITE_MAXIMO}`);
  }

  return resultado;
}

/** Lee un entero de la query: ausente, o un entero sin decimales. */
function leerEntero(valor: unknown, nombre: string): number | undefined {
  if (valor === undefined) {
    return undefined;
  }

  if (typeof valor !== "string" || !/^\d+$/.test(valor)) {
    throw ErrorHttp.peticionInvalida(`El parámetro '${nombre}' debe ser un número entero`);
  }

  return Number(valor);
}
