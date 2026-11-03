import type { Collection, Document } from "mongodb";
import { normalizarCodigo } from "../../domain/normalization.js";
import { toObjectId } from "../../domain/ids.js";
import { ticketSchema, type Ticket } from "../../domain/schemas/index.js";
import { ticketABson } from "../mapeo.js";
import {
  crearRepositorio,
  type OpcionesListado,
  type Repositorio,
  type ResultadoPaginado,
} from "./base.js";

/**
 * Repositorio de `tickets` (documento 04 §3.4).
 *
 * Cada consulta corresponde a un patrón de query del documento 04 §4.4 y
 * existe para que el índice que la sostiene se use de verdad: el filtro se
 * escribe con la forma exacta que el índice espera.
 */
export type RepositorioTickets = Repositorio<Ticket> & {
  /** Busca por código QR (índice `tickets_codigo_qr_unique`). */
  porCodigoQr(codigo: string): Promise<Ticket | null>;
  /** Tickets de un evento en un estado (índice `tickets_evento_id_estado`). */
  porEventoYEstado(
    eventoId: string,
    estado: Ticket["estado"],
    opciones?: OpcionesListado,
  ): Promise<ResultadoPaginado<Ticket>>;
  /** Tickets de un usuario, del más reciente al más antiguo (índice `tickets_comprado_por_usuario_emitido_en`). */
  misTickets(usuarioId: string, opciones?: OpcionesListado): Promise<ResultadoPaginado<Ticket>>;
  /** Tickets comprado con una transacción (índice `tickets_transaccion_id`). */
  porTransaccion(
    transaccionId: string,
    opciones?: OpcionesListado,
  ): Promise<ResultadoPaginado<Ticket>>;
  /** Tickets validados en una ventana temporal (índice `tickets_estado_validado_en_parcial`). */
  validadosEnVentana(
    desde: Date,
    hasta: Date,
    opciones?: OpcionesListado,
  ): Promise<ResultadoPaginado<Ticket>>;
};

/**
 * Crea el repositorio de `tickets`.
 *
 * @param coleccion colección física `tickets`.
 */
export function crearRepositorioTickets(coleccion: Collection<Document>): RepositorioTickets {
  const base = crearRepositorio<Ticket>({
    coleccion,
    esquema: ticketSchema,
    aBson: ticketABson,
  });

  return {
    ...base,

    async porCodigoQr(codigo) {
      // El dominio persiste el código QR en MAYÚSCULAS (`ticketSchema` lo
      // transforma con la misma regla), así que el parámetro se normaliza
      // igual: si no, la búsqueda no encontraría el documento.
      return base.obtenerUno({ codigo_qr: normalizarCodigo(codigo) });
    },

    async porEventoYEstado(eventoId, estado, opciones) {
      return base.listar({ evento_id: toObjectId(eventoId), estado }, opciones);
    },

    async misTickets(usuarioId, opciones) {
      // El orden es parte de la consulta ("mis tickets", del más reciente al
      // más antiguo) y coincide con la segunda clave del índice: no lo deja
      // cambiar quien llama, solo la paginación.
      return base.listar(
        { comprado_por_usuario_id: toObjectId(usuarioId) },
        { ...opciones, orden: { emitido_en: -1 } },
      );
    },

    async porTransaccion(transaccionId, opciones) {
      return base.listar({ transaccion_id: toObjectId(transaccionId) }, opciones);
    },

    async validadosEnVentana(desde, hasta, opciones) {
      // El `$type: "date"` NO cambia el resultado (el dominio solo admite
      // `validado_en` como fecha o `null`, y un `null` ya queda fuera del
      // rango), pero sí es lo que hace que el índice parcial
      // `tickets_estado_validado_en_parcial` sea elegible: su filtro parcial
      // es `{ validado_en: { $type: "date" } }` y MongoDB solo usa un índice
      // parcial cuando la consulta **implica** ese filtro. Un rango
      // `$gte`/`$lte` contra una fecha no lo implica (en BSON una cadena
      // ordena después de una fecha), así que sin este predicado la consulta
      // cae en COLLSCAN.
      return base.listar(
        {
          estado: "usado",
          validado_en: { $gte: desde, $lte: hasta, $type: "date" },
        },
        opciones,
      );
    },
  };
}
