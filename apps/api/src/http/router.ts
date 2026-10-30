import { Router } from "express";
import { createHealthRouter } from "./health.js";
import { openapi } from "./openapi.js";
import { crearRouterAuditoria } from "./recursos/auditoria.js";
import { crearRouterCompras } from "./recursos/compras.js";
import { crearRouterEventos } from "./recursos/eventos.js";
import { crearRouterLugares } from "./recursos/lugares.js";
import { crearRouterTickets } from "./recursos/tickets.js";
import { crearRouterTransacciones } from "./recursos/transacciones.js";
import { crearRouterUsuarios } from "./recursos/usuarios.js";
import type { DepsApp } from "../app.js";

/**
 * Router raíz de la API (todo cuelga de `/api`).
 *
 * Los recursos de colección se cuelgan aquí; el healthcheck cuelga desde el
 * Hito 0 y su contrato no cambia.
 */
export function createRouter(deps: DepsApp): Router {
  const router = Router();
  const repos = deps.repos;

  router.use(createHealthRouter(deps));
  router.get("/openapi.json", (_req, res) => {
    res.status(200).json(openapi);
  });
  router.use("/usuarios", crearRouterUsuarios(repos));
  router.use("/lugares", crearRouterLugares(repos));
  router.use("/eventos", crearRouterEventos(repos));
  router.use("/tickets", crearRouterTickets(repos));
  router.use("/transacciones", crearRouterTransacciones(repos));
  router.use("/auditoria", crearRouterAuditoria(repos));
  // La compra necesita el cliente: su transacción se abre sobre una sesión.
  router.use("/compras", crearRouterCompras(repos, deps.cliente));

  return router;
}
