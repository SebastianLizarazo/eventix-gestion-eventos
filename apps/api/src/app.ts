import express, { type Express } from "express";
import type { Logger } from "pino";
import { createRouter } from "./http/router.js";
import { requestId } from "./http/middleware/request-id.js";
import { logAcceso } from "./http/middleware/logging.js";
import { manejadorErrores, noEncontrado } from "./http/middleware/errores.js";
import type { Repositorios } from "./db/repos/index.js";
import "./http/contexto.js";

/** Todo lo que la aplicación necesita del exterior. */
export type DepsApp = {
  /** Comprueba si MongoDB responde (healthcheck). */
  checkMongo: () => Promise<boolean>;
  /** Versión de la API (healthcheck). */
  version: string;
  /** Momento de arranque de la API, en milisegundos (healthcheck). */
  startedAt: number;
  /** Repositorios de las seis colecciones. */
  repos: Repositorios;
  /** Logger estructurado. */
  logger: Logger;
};

/**
 * Compone la aplicación HTTP.
 *
 * El orden de los middlewares es parte del contrato:
 * 1. `request-id`: toda petición entra con identificador.
 * 2. log de acceso: mide lo que tardó la petición completa.
 * 3. cuerpo JSON: si el cuerpo no se puede leer, el error sale con el formato
 *    único (400) sin llegar a las rutas.
 * 4. rutas bajo `/api`.
 * 5. `noEncontrado`: ruta desconocida → 404 con el formato único.
 * 6. `manejadorErrores`: último, porque necesita los cuatro argumentos de
 *    Express para ser reconocido como manejador de errores.
 */
export function createApp(deps: DepsApp): Express {
  const app = express();

  app.disable("x-powered-by");

  app.use(requestId());
  app.use(logAcceso(deps.logger));
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", createRouter(deps));
  app.use(noEncontrado);
  app.use(manejadorErrores);

  return app;
}
