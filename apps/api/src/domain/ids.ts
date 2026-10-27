import { ObjectId } from "mongodb";
import { ErrorIdInvalido } from "./errors.js";

/**
 * Mapeo de identificadores entre el dominio (cadena hexadecimal) y MongoDB
 * (ObjectId). El dominio nunca conoce el tipo de BSON: la conversión ocurre
 * aquí, en el borde hacia la persistencia.
 */

/** 24 caracteres hexadecimales, la forma canónica de un ObjectId. */
export const PATRON_OBJECT_ID = /^[0-9a-f]{24}$/i;

/** Indica si el valor es un ObjectId válido. */
export function esObjectIdValido(valor: unknown): valor is string {
  return typeof valor === "string" && PATRON_OBJECT_ID.test(valor);
}

/** Convierte un identificador del dominio en un ObjectId de MongoDB. */
export function toObjectId(id: string): ObjectId {
  if (!esObjectIdValido(id)) {
    throw new ErrorIdInvalido(String(id), "ObjectId");
  }
  return new ObjectId(id.toLowerCase());
}

/** Convierte un ObjectId de MongoDB en el identificador del dominio. */
export function fromObjectId(id: ObjectId): string {
  return id.toHexString();
}

/** Convierte una lista de identificadores del dominio en ObjectId. */
export function toObjectIds(ids: readonly string[]): ObjectId[] {
  return ids.map((id) => toObjectId(id));
}

/** Convierte un identificador opcional, preservando `undefined` como ausencia. */
export function optionalToObjectId(id: string | null | undefined): ObjectId | undefined {
  if (id === null || id === undefined) {
    return undefined;
  }
  return toObjectId(id);
}
