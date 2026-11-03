import { Router, type Request } from "express";
import type { Document, Filter } from "mongodb";
import { toObjectId } from "../../domain/ids.js";
import { ESTADO_TICKET, prepararTicket, ticketSchema } from "../../domain/schemas/index.js";
import type { Repositorios } from "../../db/repos/index.js";
import { ErrorHttp } from "../errores.js";
import { crearRouterCrud } from "./crud.js";
import { leerEnum, leerId } from "./comun.js";

/**
 * Recurso de `tickets` (documento 04 §3.4).
 *
 * Los identificadores del ticket (evento, comprador y transacción) y los de
 * sus instantáneas (tipo de ticket y asistente) son referencias: se guardan
 * como `objectId` en el documento, y la conversión es explícita, campo por
 * campo.
 */

/** Campos editables del ticket que guardan una referencia a otro documento. */
const CAMPOS_CON_ID = ["evento_id", "comprado_por_usuario_id", "transaccion_id"] as const;

export function crearRouterTickets(repos: Repositorios): Router {
  const router = Router();

  router.get("/codigo/:codigo", async (req, res) => {
    const codigo = String(req.params.codigo);
    const ticket = await repos.tickets.porCodigoQr(codigo);

    if (!ticket) {
      throw ErrorHttp.noEncontrado("No existe el ticket con ese código");
    }

    res.status(200).json(ticket);
  });

  router.use(
    crearRouterCrud({
      repositorio: repos.tickets,
      esquema: ticketSchema,
      preparar: prepararTicket,
      camposEditables: [
        "codigo_qr",
        "estado",
        "evento_id",
        "comprado_por_usuario_id",
        "snapshot_tipo_ticket",
        "asistente_snapshot",
        "precio_pagado_cop",
        "promocion_aplicada_codigo",
        "transaccion_id",
        "validado_en",
        "validado_por_puerta",
      ],
      nombre: "ticket",
      ruta: "/api/tickets",
      conVersion: true,
      convertir: convertirTicket,
      filtro: filtroDeTickets,
      orden: { emitido_en: -1 },
    }),
  );

  return router;
}

/**
 * Convierte a BSON el valor editado de un ticket.
 *
 * Las referencias van dentro de instantáneas (`snapshot_tipo_ticket` y
 * `asistente_snapshot`), así que la conversión no puede ser una regla única
 * para todos los campos: cada campo conoce su forma.
 */
function convertirTicket(campo: string, valor: unknown): unknown {
  if (campo === "snapshot_tipo_ticket") {
    const snapshot = valor as { tipo_ticket_id: string };

    return { ...snapshot, tipo_ticket_id: toObjectId(snapshot.tipo_ticket_id) };
  }

  if (campo === "asistente_snapshot") {
    const snapshot = valor as { usuario_id: string };

    return { ...snapshot, usuario_id: toObjectId(snapshot.usuario_id) };
  }

  if ((CAMPOS_CON_ID as readonly string[]).includes(campo)) {
    return toObjectId(String(valor));
  }

  return valor;
}

/** Filtro de la lista de tickets. */
function filtroDeTickets(req: Request): Filter<Document> {
  const query = req.query as unknown as Record<string, unknown>;
  const filtro: Filter<Document> = {};

  if (query.evento_id !== undefined) {
    filtro.evento_id = toObjectId(leerId(query.evento_id, "evento_id"));
  }

  const estado = leerEnum(query.estado, "estado", ESTADO_TICKET);

  if (estado) {
    filtro.estado = estado;
  }

  if (query.usuario_id !== undefined) {
    filtro.comprado_por_usuario_id = toObjectId(leerId(query.usuario_id, "usuario_id"));
  }

  return filtro;
}
