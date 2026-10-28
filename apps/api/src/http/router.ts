import { Router } from "express";
import { createHealthRouter } from "./health.js";
import type { DepsApp } from "../app.js";

/**
 * Router raíz de la API (todo cuelga de `/api`).
 *
 * Los recursos de colección se cuelgan aquí en T4.2 y T4.3; el healthcheck
 * cuelga desde el Hito 0 y su contrato no cambia.
 */
export function createRouter(deps: DepsApp): Router {
  const router = Router();

  router.use(createHealthRouter(deps));

  return router;
}
