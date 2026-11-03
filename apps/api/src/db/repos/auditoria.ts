import type { Collection, Document } from "mongodb";
import { toObjectId } from "../../domain/ids.js";
import { auditoriaSchema, type Auditoria } from "../../domain/schemas/index.js";
import { auditoriaABson } from "../mapeo.js";
import {
  crearRepositorio,
  type OpcionesListado,
  type Repositorio,
  type ResultadoPaginado,
} from "./base.js";

/**
 * Repositorio de `auditoria_eventos` (documento 04 §3.6).
 *
 * La colección es *append-only*: aquí no hay escrituras más allá del CRUD
 * común del repositorio base, y las consultas son las tres del documento
 * 04 §4.6 (leer el rastro por actor, por sujeto y por fecha).
 */
export type RepositorioAuditoria = Repositorio<Auditoria> & {
  /** Registros de un actor en una ventana (índice `auditoria_actor_ocurrido_en`). */
  porActorYFecha(
    actorId: string,
    desde: Date,
    hasta: Date,
    opciones?: OpcionesListado,
  ): Promise<ResultadoPaginado<Auditoria>>;
  /** Registros de un sujeto por tipo (índice `auditoria_sujeto_tipo_sujeto_id`). */
  porSujeto(
    tipo: Auditoria["sujeto_tipo"],
    sujetoId: string,
    opciones?: OpcionesListado,
  ): Promise<ResultadoPaginado<Auditoria>>;
  /** Registros ocurridos en una ventana (índice `auditoria_ocurrido_en_ttl`). */
  porOcurridoEn(
    desde: Date,
    hasta: Date,
    opciones?: OpcionesListado,
  ): Promise<ResultadoPaginado<Auditoria>>;
};

/**
 * Crea el repositorio de `auditoria_eventos`.
 *
 * @param coleccion colección física `auditoria_eventos`.
 */
export function crearRepositorioAuditoria(coleccion: Collection<Document>): RepositorioAuditoria {
  const base = crearRepositorio<Auditoria>({
    coleccion,
    esquema: auditoriaSchema,
    aBson: auditoriaABson,
  });

  return {
    ...base,

    async porActorYFecha(actorId, desde, hasta, opciones) {
      return base.listar(
        { actor_id: toObjectId(actorId), ocurrido_en: { $gte: desde, $lte: hasta } },
        opciones,
      );
    },

    async porSujeto(tipo, sujetoId, opciones) {
      return base.listar({ sujeto_tipo: tipo, sujeto_id: toObjectId(sujetoId) }, opciones);
    },

    async porOcurridoEn(desde, hasta, opciones) {
      return base.listar({ ocurrido_en: { $gte: desde, $lte: hasta } }, opciones);
    },
  };
}
