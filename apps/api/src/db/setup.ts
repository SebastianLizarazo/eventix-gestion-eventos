import type { Db } from "mongodb";
import { logger } from "../logger.js";
import { VALIDADORES } from "./validators.js";

/**
 * Provisioning idempotente del esquema en el servidor (spec S5).
 *
 * "Idempotente" significa que correrlo dos veces deja la base en el mismo
 * estado: las colecciones que no existen se crean con su validator y las que
 * ya existen se actualizan con `collMod`, sin recrearlas ni perder datos.
 */

export type ResultadoValidadores = {
  coleccionesCreadas: string[];
  coleccionesActualizadas: string[];
};

/**
 * Aplica el validator `$jsonSchema` de cada colección (documento 04 §7).
 *
 * Crea la colección cuando no existe y actualiza el validator cuando ya
 * existe; `validationLevel: "strict"` + `validationAction: "error"` hacen que
 * el servidor **rechace** el documento que viola el esquema.
 */
export async function aplicarValidadores(db: Db): Promise<ResultadoValidadores> {
  const existentes = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((coleccion) => coleccion.name),
  );

  const coleccionesCreadas: string[] = [];
  const coleccionesActualizadas: string[] = [];

  for (const [nombre, validator] of Object.entries(VALIDADORES)) {
    const opciones = {
      validator,
      validationLevel: "strict",
      validationAction: "error",
    } as const;

    if (existentes.has(nombre)) {
      await db.command({ collMod: nombre, ...opciones });
      coleccionesActualizadas.push(nombre);
    } else {
      await db.createCollection(nombre, opciones);
      coleccionesCreadas.push(nombre);
    }

    logger.debug({ coleccion: nombre }, "Validator aplicado");
  }

  return { coleccionesCreadas, coleccionesActualizadas };
}
