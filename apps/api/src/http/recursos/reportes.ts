import { Router } from "express";
import type { Repositorios } from "../../db/repos/index.js";
import { crearServicioReporting } from "../../services/reporting.js";
import { ErrorHttp } from "../errores.js";
import { leerFecha, leerId } from "./comun.js";

/**
 * Router del reporting operativo (`/api/reportes`).
 *
 * Las consultas viven en un namespace propio y no cuelgan de los recursos
 * CRUD: el dashboard, el cierre contable, el ranking y la exportación de
 * asistentes son **vistas** del modelo, no documentos que se puedan listar,
 * crear o editar. Dejarlos aparte también deja claro qué es dato y qué es
 * lectura derivada.
 */
export function crearRouterReportes(repos: Repositorios): Router {
  const router = Router();
  const reporting = crearServicioReporting(repos);

  router.get("/eventos/:id/dashboard", async (req, res) => {
    const dashboard = await reporting.dashboardDeEvento(leerId(req.params.id));

    if (!dashboard) {
      throw ErrorHttp.noEncontrado("No existe el evento");
    }

    res.status(200).json(dashboard);
  });

  router.get("/cierre-contable", async (req, res) => {
    const desde = leerFecha(req.query.desde, "desde");
    const hasta = leerFecha(req.query.hasta, "hasta");

    if (desde && hasta && hasta < desde) {
      throw ErrorHttp.peticionInvalida("El parámetro 'hasta' no puede ser anterior a 'desde'");
    }

    const cierre = await reporting.cierreContable({ desde, hasta });

    res.status(200).json(cierre);
  });

  return router;
}
