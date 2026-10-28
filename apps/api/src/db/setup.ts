import type { Db, Document, IndexDescription } from "mongodb";
import { logger } from "../logger.js";
import { INDICES, type DefinicionIndice } from "./indexes.js";
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

export type ResultadoIndices = {
  creados: string[];
  conservados: string[];
  recreados: string[];
};

export type ResultadoSetup = {
  validadores: ResultadoValidadores;
  indices: ResultadoIndices;
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

/**
 * Aplica los índices del documento 04 §4.
 *
 * Un índice que ya existe con la misma definición se conserva; uno que existe
 * con otra definición se recrea (y se avisa), porque el modelo declarado es la
 * fuente de verdad del provisioning.
 */
export async function aplicarIndices(db: Db): Promise<ResultadoIndices> {
  const creados: string[] = [];
  const conservados: string[] = [];
  const recreados: string[] = [];

  for (const [coleccion, definiciones] of Object.entries(INDICES)) {
    const coleccionMongo = db.collection(coleccion);
    const existentes = new Map<string, IndexDescription>();

    for (const indice of await coleccionMongo.listIndexes().toArray()) {
      existentes.set(indice.name, indice);
    }

    for (const definicion of definiciones) {
      const etiqueta = `${coleccion}.${definicion.nombre}`;
      const actual = existentes.get(definicion.nombre);

      if (!actual) {
        await crearIndice(coleccionMongo, definicion);
        creados.push(etiqueta);
        continue;
      }

      if (coincide(actual, definicion)) {
        conservados.push(etiqueta);
        continue;
      }

      logger.warn({ indice: etiqueta }, "El índice existe con otra definición: se recrea");
      await coleccionMongo.dropIndex(definicion.nombre);
      await crearIndice(coleccionMongo, definicion);
      recreados.push(etiqueta);
    }
  }

  return { creados, conservados, recreados };
}

/** Aplica el esquema completo: validadores (doc 04 §7) e índices (doc 04 §4). */
export async function aplicarSetup(db: Db): Promise<ResultadoSetup> {
  const validadores = await aplicarValidadores(db);
  const indices = await aplicarIndices(db);

  return { validadores, indices };
}

async function crearIndice(
  coleccion: ReturnType<Db["collection"]>,
  definicion: DefinicionIndice,
): Promise<void> {
  await coleccion.createIndex(definicion.clave as Document, {
    name: definicion.nombre,
    ...definicion.opciones,
  });
}

/** Compara el índice real con la definición declarada. */
function coincide(actual: IndexDescription, definicion: DefinicionIndice): boolean {
  const esTexto = Object.values(definicion.clave).some((valor) => valor === "text");
  const claveReal = actual.key as unknown as Record<string, unknown>;
  const clavesOk = esTexto
    ? claveReal._fts === "text" || claveReal._ftsx === 1
    : esIgual(claveReal, definicion.clave);

  if (!clavesOk) {
    return false;
  }

  if (Boolean(actual.unique) !== Boolean(definicion.opciones?.unique)) {
    return false;
  }

  const ttlReal = actual.expireAfterSeconds ?? null;
  const ttlDeclarado = definicion.opciones?.expireAfterSeconds ?? null;
  if (ttlReal !== ttlDeclarado) {
    return false;
  }

  return esIgual(
    actual.partialFilterExpression ?? null,
    definicion.opciones?.partialFilterExpression ?? null,
  );
}

/** Igualdad profunda de valores BSON simples, insensible al orden de claves. */
function esIgual(actual: unknown, esperado: unknown): boolean {
  if (actual === esperado) {
    return true;
  }

  if (
    actual === null ||
    esperado === null ||
    typeof actual !== "object" ||
    typeof esperado !== "object"
  ) {
    return false;
  }

  if (Array.isArray(actual) || Array.isArray(esperado)) {
    if (!Array.isArray(actual) || !Array.isArray(esperado) || actual.length !== esperado.length) {
      return false;
    }
    return actual.every((valor, indice) => esIgual(valor, esperado[indice]));
  }

  const clavesActual = Object.keys(actual as object).sort();
  const clavesEsperadas = Object.keys(esperado as object).sort();

  if (
    clavesActual.length !== clavesEsperadas.length ||
    clavesActual.some((clave, indice) => clave !== clavesEsperadas[indice])
  ) {
    return false;
  }

  return clavesActual.every((clave) =>
    esIgual(
      (actual as Record<string, unknown>)[clave],
      (esperado as Record<string, unknown>)[clave],
    ),
  );
}
