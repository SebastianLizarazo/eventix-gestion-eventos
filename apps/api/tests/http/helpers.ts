import { MongoClient, type Db } from "mongodb";
import type { Express } from "express";
import type { Logger } from "pino";
import { config } from "../../src/config.js";
import { aplicarSetup } from "../../src/db/setup.js";
import { crearRepositorios } from "../../src/db/repos/index.js";
import { createApp } from "../../src/app.js";
import { logger as loggerPorDefecto } from "../../src/logger.js";

/**
 * Base de prueba propia para la capa HTTP: los tests de la API no tocan la
 * base de desarrollo (cada suite usa la suya, como en la capa de persistencia).
 */
export const DB_PRUEBA = `${config.MONGODB_DB}_http`;

export type ContextoPrueba = {
  app: Express;
  db: Db;
  cliente: MongoClient;
  /** Borra los documentos de las colecciones entre tests. */
  limpiar: () => Promise<void>;
  cerrar: () => Promise<void>;
};

export type OpcionesContexto = {
  /** Logger alternativo: los tests observan el log de acceso con uno falso. */
  logger?: Logger;
};

/**
 * Levanta la aplicación contra la base de prueba, con el esquema del servidor
 * aplicado (los validators del servidor también deben aceptar lo que la API
 * escribe: si no, el test falla por una razón real).
 */
export async function crearContextoPrueba(
  opciones: OpcionesContexto = {},
): Promise<ContextoPrueba> {
  const cliente = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });
  await cliente.connect();

  const db = cliente.db(DB_PRUEBA);
  await db.dropDatabase();
  await aplicarSetup(db);

  const repos = crearRepositorios(db);

  const app = createApp({
    checkMongo: async () => true,
    version: "0.1.0-test",
    startedAt: Date.now(),
    repos,
    logger: opciones.logger ?? loggerPorDefecto,
  });

  const limpiar = async (): Promise<void> => {
    await Promise.all(
      ["usuarios", "lugares", "eventos", "tickets", "transacciones", "auditoria_eventos"].map(
        (coleccion) => db.collection(coleccion).deleteMany({}),
      ),
    );
  };

  return {
    app,
    db,
    cliente,
    limpiar,
    cerrar: async () => {
      await db.dropDatabase();
      await cliente.close();
    },
  };
}
