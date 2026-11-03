import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

/**
 * Identificador de la petición.
 *
 * El cliente puede mandar su propio `x-request-id` (para correlacionar con su
 * trazabilidad); si no lo manda, la API genera uno. El identificador viaja en
 * la respuesta, en el log de acceso y en el cuerpo de error: con eso, una
 * complaint del cliente se puede encontrar en el log sin ambigüedad.
 */

/** Caracteres admitidos en un `x-request-id` recebido del cliente. */
const PATRON_ID_SEGURO = /^[A-Za-z0-9_.:-]{1,200}$/;

/** Middleware que asigna el `request-id` a la petición y lo devuelve. */
export function requestId(): RequestHandler {
  return (req, res, next) => {
    const recibido = req.header("x-request-id");
    const id = recibido !== undefined && PATRON_ID_SEGURO.test(recibido) ? recibido : randomUUID();

    req.requestId = id;
    res.setHeader("x-request-id", id);

    next();
  };
}
