import { MongoClient, type Db } from "mongodb";
import type { Express } from "express";
import type { Logger } from "pino";
import { config } from "../../src/config.js";
import { aplicarSetup } from "../../src/db/setup.js";
import { crearRepositorios, type Repositorios } from "../../src/db/repos/index.js";
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
  /**
   * Base de datos propia del archivo de test.
   *
   * Cada archivo usa la suya porque Vitest corre los archivos en paralelo: si
   * dos comparten base, el `dropDatabase` de uno borra los datos del otro y las
   * pruebas se vuelven intermitentes.
   */
  nombreBase?: string;
  /**
   * Envoltura de los repositorios.
   *
   * Permite probar **carreras** de forma determinista: un doble que devuelve
   * una lectura vieja simula, sin Cronos, que otra escritura ocurrió entre la
   * lectura de la petición y su escritura.
   */
  envolverRepos?: (repos: Repositorios) => Repositorios;
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

  const db = cliente.db(opciones.nombreBase ?? DB_PRUEBA);
  await db.dropDatabase();
  await aplicarSetup(db);

  const reposBase = crearRepositorios(db);
  const repos = opciones.envolverRepos ? opciones.envolverRepos(reposBase) : reposBase;

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
