import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Logger } from "pino";
import type { MongoClient } from "mongodb";
import { createApp } from "../app.js";
import { config } from "../config.js";
import type { Repositorios } from "../db/repos/index.js";

/**
 * Servidor HTTP efímero para medir la API por dentro del proceso.
 *
 * Los tres scripts de los NFR (Hito 8) miden **por HTTP**: lo que espera el
 * operador es la respuesta completa, no el trabajo interno de MongoDB. Montar
 * la aplicación en un puerto efímero permite hacerlo sin depender de un
 * proceso externo ya arrancado y sin que dos mediciones se pisen el puerto.
 */

/** Servidor de medición, con su base HTTP y su cierre. */
export type ServidorDeMedicion = {
  /** Base HTTP de la API, con el prefijo `/api`. */
  base: string;
  /** Cierra el servidor esperando a que terminen las peticiones abiertas. */
  cerrar: () => Promise<void>;
};

/**
 * Logger mudo.
 *
 * Una medición golpea la API cientos de veces: el log de acceso ensuciaría la
 * salida del script y ralentizaría la propia medición.
 */
const LOGGER_MUDO = {
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger;

/** Levanta la API en un puerto efímero y devuelve su base HTTP. */
export async function arrancarServidorDeMedicion(
  repos: Repositorios,
  cliente: MongoClient,
): Promise<ServidorDeMedicion> {
  const app = createApp({
    checkMongo: async () => true,
    version: config.NODE_ENV,
    startedAt: Date.now(),
    repos,
    cliente,
    logger: LOGGER_MUDO,
  });

  const servidor = app.listen(0);
  const puerto = (servidor.address() as AddressInfo).port;

  return {
    base: `http://127.0.0.1:${puerto}/api`,
    cerrar: () => cerrar(servidor),
  };
}

/**
 * Cierra el servidor esperando a las peticiones abiertas.
 *
 * `closeIdleConnections()` suelta las conexiones keep-alive que dejó el
 * cliente de medición: sin eso, `close()` esperaría a que el socket expirara
 * solo y el script se quedaría colgado en el último paso.
 */
async function cerrar(servidor: Server): Promise<void> {
  await new Promise<void>((resolver) => {
    servidor.close(() => resolver());
    servidor.closeIdleConnections();
  });
}
