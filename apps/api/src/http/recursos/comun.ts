import type { Request } from "express";
import { esObjectIdValido } from "../../domain/ids.js";
import { parsearFechaIso } from "../../domain/fechas.js";
import type { ResultadoPaginado } from "../../db/repos/base.js";
import { ErrorHttp } from "../errores.js";
import { leerPaginacion, type Paginacion } from "../paginacion.js";

/**
 * Piezas compartidas por los recursos de la API.
 *
 * Los manejadores son cortos porque estas funciones se llevan lo repetido:
 * leer y validar un identificador, leer y validar un parámetro de la query,
 * quedarse solo con los campos que el recurso deja editar.
 */

/** Lee el identificador de un parámetro de ruta y lo valida como ObjectId. */
export function leerId(valor: unknown, nombre = "id"): string {
  if (typeof valor !== "string" || !esObjectIdValido(valor)) {
    throw ErrorHttp.peticionInvalida(`El parámetro '${nombre}' no es un identificador válido`);
  }

  return valor.toLowerCase();
}

/** Lee un parámetro de la query y lo contrasta con los valores permitidos. */
export function leerEnum<T extends string>(
  valor: unknown,
  nombre: string,
  permitidos: readonly T[],
): T | undefined {
  if (valor === undefined) {
    return undefined;
  }

  if (typeof valor !== "string" || !permitidos.includes(valor as T)) {
    throw ErrorHttp.peticionInvalida(`El parámetro '${nombre}' no es válido`);
  }

  return valor as T;
}

/** Lee una fecha ISO de la query. */
export function leerFecha(valor: unknown, nombre: string): Date | undefined {
  if (valor === undefined) {
    return undefined;
  }

  if (typeof valor !== "string") {
    throw ErrorHttp.peticionInvalida(`El parámetro '${nombre}' no es una fecha válida`);
  }

  const fecha = parsearFechaIso(valor);

  if (fecha === null) {
    throw ErrorHttp.peticionInvalida(`El parámetro '${nombre}' no es una fecha válida`);
  }

  return fecha;
}

/** Lee un número de la query (coordenadas, distancias). */
export function leerNumero(valor: unknown, nombre: string): number {
  if (typeof valor !== "string" || !/^-?\d+(\.\d+)?$/.test(valor)) {
    throw ErrorHttp.peticionInvalida(`El parámetro '${nombre}' debe ser un número`);
  }

  return Number(valor);
}

/** Lee el cuerpo de la petición como objeto plano. */
export function leerObjeto(cuerpo: unknown): Record<string, unknown> {
  if (cuerpo === undefined || cuerpo === null) {
    return {};
  }

  if (typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
    throw ErrorHttp.peticionInvalida("El cuerpo de la petición debe ser un objeto JSON");
  }

  return cuerpo as Record<string, unknown>;
}

/**
 * Se queda solo con los campos que el recurso deja editar.
 *
 * El recurso decide qué campos son suyos; el cliente no puede escribir los
 * que lleva el sistema (métricas, contadores, marcas de tiempo).
 */
export function camposPermitidos(
  cuerpo: Record<string, unknown>,
  campos: readonly string[],
): Record<string, unknown> {
  const elegidos: Record<string, unknown> = {};

  for (const campo of campos) {
    if (campo in cuerpo) {
      elegidos[campo] = cuerpo[campo];
    }
  }

  return elegidos;
}

/** Separa los campos que el cliente quiere dejar sin valor (`null`). */
export function camposAnulados(
  cuerpo: Record<string, unknown>,
  campos: readonly string[],
): string[] {
  return campos.filter((campo) => campo in cuerpo && cuerpo[campo] === null);
}

/** Lee la paginación de la query. */
export function leerPaginacionDe(req: Request): Paginacion {
  return leerPaginacion(req.query as unknown as Record<string, unknown>);
}

/** Cuerpo de una página de resultados. */
export function pagina<T>(resultado: ResultadoPaginado<T>): {
  items: T[];
  total: number | null;
  skip: number;
  limit: number;
} {
  return {
    items: resultado.items,
    total: resultado.total,
    skip: resultado.skip,
    limit: resultado.limit,
  };
}
