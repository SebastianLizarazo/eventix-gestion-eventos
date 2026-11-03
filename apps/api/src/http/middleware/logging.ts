import type { RequestHandler } from "express";
import type { Logger } from "pino";

/**
 * Log de acceso: una línea por petición, con lo justo para diagnosticar
 * (método, ruta, estado, duración y `request-id`).
 *
 * El cuerpo de la petición **no** se registra: puede contener datos personales.
 */
export function logAcceso(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const inicio = process.hrtime.bigint();

    res.on("finish", () => {
      const duracionMs = Number(process.hrtime.bigint() - inicio) / 1_000_000;

      const datos = {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        duration_ms: Math.round(duracionMs * 1000) / 1000,
        request_id: req.requestId,
      };

      if (res.statusCode >= 500) {
        logger.error(datos, "Error interno");
      } else if (res.statusCode >= 400) {
        logger.warn(datos, "Petición rechazada");
      } else {
        logger.info(datos, "Petición atendida");
      }
    });

    next();
  };
}
