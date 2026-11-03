import { Router } from "express";
import type { Repositorios } from "../../db/repos/index.js";
import { crearServicioReporting } from "../../services/reporting.js";
import { ESTADO_TICKET } from "../../domain/schemas/index.js";
import { ErrorHttp } from "../errores.js";
import { leerEnum, leerFecha, leerId, leerPaginacionDe, pagina } from "./comun.js";

/**
 * Router del reporting operativo (`/api/reportes`).
 *
 * Las consultas viven en un namespace propio y no cuelgan de los recursos
 * CRUD: el dashboard, el cierre contable, el ranking y la exportación de
 * asistentes son **vistas** del modelo, no documentos que se puedan listar,
 * crear o editar. Dejarlos aparte también deja claro qué es dato y qué es
 * lectura derivada.
 */

/** Cuántos eventos trae el ranking por defecto. */
const LIMITE_RANKING_POR_DEFECTO = 10;

/** Cuántos eventos puede pedir el ranking como máximo. */
const LIMITE_RANKING_MAXIMO = 100;

/**
 * Lee el límite del ranking.
 *
 * Es un entero positivo acotado: un ranking sin tope devuelve el catálogo
 * entero, que no es un ranking, y un límite sin cota deja que una sola
 * petición pida diez mil eventos.
 */
function leerLimiteRanking(valor: unknown): number {
  if (valor === undefined) {
    return LIMITE_RANKING_POR_DEFECTO;
  }

  if (typeof valor !== "string" || !/^\d+$/.test(valor)) {
    throw ErrorHttp.peticionInvalida("El parámetro 'limite' debe ser un número entero");
  }

  const limite = Number(valor);

  if (limite < 1 || limite > LIMITE_RANKING_MAXIMO) {
    throw ErrorHttp.peticionInvalida(
      `El parámetro 'limite' debe estar entre 1 y ${LIMITE_RANKING_MAXIMO}`,
    );
  }

  return limite;
}

/** Crea el router de reporting. */
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

  router.get("/mas-vendidos", async (req, res) => {
    const limite = leerLimiteRanking(req.query.limite);
    const ranking = await reporting.rankingDeVendidos(limite);

    res.status(200).json(ranking);
  });

  router.get("/asistentes/:eventoId", async (req, res) => {
    const resultado = await reporting.asistentesDeEvento(
      leerId(req.params.eventoId, "eventoId"),
      leerPaginacionDe(req),
      leerEnum(req.query.estado, "estado", ESTADO_TICKET),
    );

    if (!resultado) {
      throw ErrorHttp.noEncontrado("No existe el evento");
    }

    res.status(200).json(pagina(resultado));
  });

  return router;
}
