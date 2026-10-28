import { Router, type Request } from "express";
import type { Document, Filter } from "mongodb";
import { toObjectId } from "../../domain/ids.js";
import {
  ROL_ACTOR,
  TIPO_SUJETO,
  auditoriaSchema,
  prepararAuditoria,
} from "../../domain/schemas/index.js";
import type { Repositorios } from "../../db/repos/index.js";
import { crearRouterCrud } from "./crud.js";
import { leerEnum, leerFecha, leerId } from "./comun.js";

/**
 * Recurso de `auditoria_eventos` (documento 04 §3.6).
 *
 * El rastro es **append-only**: se lee y se añade, pero no se modifica ni se
 * borra. Un `PATCH` o un `DELETE` sobre un registro responden 405.
 */
export function crearRouterAuditoria(repos: Repositorios): Router {
  const router = Router();

  router.use(
    crearRouterCrud({
      repositorio: repos.auditoria,
      esquema: auditoriaSchema,
      preparar: prepararAuditoria,
      camposEditables: [],
      nombre: "registro de auditoría",
      ruta: "/api/auditoria",
      soloLectura: true,
      filtro: filtroDeAuditoria,
      orden: { ocurrido_en: -1 },
    }),
  );

  return router;
}

/** Filtro de la lista de auditoría. */
function filtroDeAuditoria(req: Request): Filter<Document> {
  const query = req.query as unknown as Record<string, unknown>;
  const filtro: Filter<Document> = {};

  if (query.actor_id !== undefined) {
    filtro.actor_id = toObjectId(leerId(query.actor_id, "actor_id"));
  }

  const rol = leerEnum(query.actor_rol, "actor_rol", ROL_ACTOR);

  if (rol) {
    filtro.actor_rol = rol;
  }

  const tipo = leerEnum(query.sujeto_tipo, "sujeto_tipo", TIPO_SUJETO);

  if (tipo) {
    filtro.sujeto_tipo = tipo;
  }

  if (query.sujeto_id !== undefined) {
    filtro.sujeto_id = toObjectId(leerId(query.sujeto_id, "sujeto_id"));
  }

  const desde = leerFecha(query.desde, "desde");
  const hasta = leerFecha(query.hasta, "hasta");

  if (desde !== undefined || hasta !== undefined) {
    filtro.ocurrido_en = {
      ...(desde !== undefined ? { $gte: desde } : {}),
      ...(hasta !== undefined ? { $lte: hasta } : {}),
    };
  }

  return filtro;
}
