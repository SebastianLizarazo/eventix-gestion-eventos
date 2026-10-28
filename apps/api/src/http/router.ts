import { Router } from "express";
import { createHealthRouter } from "./health.js";
import { crearRouterEventos } from "./recursos/eventos.js";
import type { DepsApp } from "../app.js";

/**
 * Router raíz de la API (todo cuelga de `/api`).
 *
 * Los recursos de colección se cuelgan aquí; el healthcheck cuelga desde el
 * Hito 0 y su contrato no cambia.
 */
export function createRouter(deps: DepsApp): Router {
  const router = Router();

  router.use(createHealthRouter(deps));
  router.use("/eventos", crearRouterEventos(deps.repos.eventos));

  return router;
}
