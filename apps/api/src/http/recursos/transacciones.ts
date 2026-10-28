import { Router, type Request } from "express";
import type { Document, Filter } from "mongodb";
import { toObjectId } from "../../domain/ids.js";
import {
  ESTADO_TRANSACCION,
  prepararTransaccion,
  transaccionSchema,
} from "../../domain/schemas/index.js";
import type { Repositorios } from "../../db/repos/index.js";
import { crearRouterCrud } from "./crud.js";
import { leerEnum, leerFecha, leerId } from "./comun.js";

/**
 * Recurso de `transacciones` (documento 04 §3.5).
 *
 * La fecha de creación la pone la API y la de confirmación la pone el flujo de
 * pago: el cliente no decide cuándo ocurrió cada cosa.
 */
export function crearRouterTransacciones(repos: Repositorios): Router {
  const router = Router();

  router.use(
    crearRouterCrud({
      repositorio: repos.transacciones,
      esquema: transaccionSchema,
      preparar: prepararTransaccion,
      camposEditables: [
        "usuario_id",
        "ticket_id",
        "monto_cop",
        "moneda",
        "metodo_pago",
        "pasarela",
        "estado",
        "referencia_pasarela",
        "confirmada_en",
      ],
      camposConId: ["usuario_id", "ticket_id"],
      nombre: "transacción",
      ruta: "/api/transacciones",
      filtro: filtroDeTransacciones,
      orden: { creada_en: -1 },
    }),
  );

  return router;
}

/** Filtro de la lista de transacciones. */
function filtroDeTransacciones(req: Request): Filter<Document> {
  const query = req.query as unknown as Record<string, unknown>;
  const filtro: Filter<Document> = {};

  if (query.usuario_id !== undefined) {
    filtro.usuario_id = toObjectId(leerId(query.usuario_id, "usuario_id"));
  }

  const estado = leerEnum(query.estado, "estado", ESTADO_TRANSACCION);

  if (estado) {
    filtro.estado = estado;
  }

  const desde = leerFecha(query.desde, "desde");
  const hasta = leerFecha(query.hasta, "hasta");

  if (desde !== undefined || hasta !== undefined) {
    filtro.creada_en = {
      ...(desde !== undefined ? { $gte: desde } : {}),
      ...(hasta !== undefined ? { $lte: hasta } : {}),
    };
  }

  return filtro;
}
