import type { ErrorRequestHandler, RequestHandler } from "express";
import { ErrorHttp, traducirError } from "../errores.js";
import { logger } from "../../logger.js";

/**
 * Middleware de error **único**: cualquier fallo de cualquier manejador sale
 * con el mismo formato (`{ error: { codigo, mensaje, detalles?, request_id } }`).
 *
 * Los manejadores de los recursos lanzan errores (de dominio o de la propia
 * capa HTTP) y no traducen nada: la traducción vive en un solo sitio.
 */

/** Manejador de rutas desconocidas: 404 con el formato único. */
export const noEncontrado: RequestHandler = (req, _res, next) => {
  next(ErrorHttp.noEncontrado(`No existe el recurso ${req.method} ${req.path}`));
};

/** Middleware de error: traduce cualquier fallo al contrato de error. */
export const manejadorErrores: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);

    return;
  }

  const id = req.requestId ?? "desconocido";
  const { estado, cuerpo } = traducirError(error, id);

  if (estado >= 500) {
    logger.error({ err: error, request_id: id }, "Error interno no controlado");
  }

  res.status(estado).json(cuerpo);
};
