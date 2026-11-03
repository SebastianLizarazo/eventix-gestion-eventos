import type { Collection, Document } from "mongodb";
import { toObjectId } from "../../domain/ids.js";
import { transaccionSchema, type Transaccion } from "../../domain/schemas/index.js";
import { transaccionABson } from "../mapeo.js";
import {
  crearRepositorio,
  type OpcionesListado,
  type Repositorio,
  type ResultadoPaginado,
} from "./base.js";

/**
 * Repositorio de `transacciones` (documento 04 §3.5).
 *
 * Cada consulta corresponde a un patrón de query del documento 04 §4.5 y
 * existe para que el índice que la sostiene se use de verdad: el filtro se
 * escribe con la forma exacta que el índice espera.
 */
export type RepositorioTransacciones = Repositorio<Transaccion> & {
  /** Transacciones de un usuario en una ventana (índice `transacciones_usuario_creada_en`). */
  porUsuarioYFecha(
    usuarioId: string,
    desde: Date,
    hasta: Date,
    opciones?: OpcionesListado,
  ): Promise<ResultadoPaginado<Transaccion>>;
  /** Transacciones de un estado en una ventana (índice `transacciones_estado_creada_en`). */
  porEstadoYFecha(
    estado: Transaccion["estado"],
    desde: Date,
    hasta: Date,
    opciones?: OpcionesListado,
  ): Promise<ResultadoPaginado<Transaccion>>;
  /**
   * Transacción viva de una referencia de pasarela (índice
   * `transacciones_pasarela_referencia_parcial`): la que representa un cargo
   * pendiente o cobrado. Un intento rechazado o anulado no se cobró y no
   * bloquea un reintento.
   */
  porReferencia(pasarela: string, referencia: string): Promise<Transaccion | null>;
  /** Transacciones confirmadas en una ventana (índice `transacciones_confirmada_en`). */
  porFechaConfirmacion(
    desde: Date,
    hasta: Date,
    opciones?: OpcionesListado,
  ): Promise<ResultadoPaginado<Transaccion>>;
};

/**
 * Crea el repositorio de `transacciones`.
 *
 * @param coleccion colección física `transacciones`.
 */
export function crearRepositorioTransacciones(
  coleccion: Collection<Document>,
): RepositorioTransacciones {
  const base = crearRepositorio<Transaccion>({
    coleccion,
    esquema: transaccionSchema,
    aBson: transaccionABson,
  });

  return {
    ...base,

    async porUsuarioYFecha(usuarioId, desde, hasta, opciones) {
      return base.listar(
        { usuario_id: toObjectId(usuarioId), creada_en: { $gte: desde, $lte: hasta } },
        opciones,
      );
    },

    async porEstadoYFecha(estado, desde, hasta, opciones) {
      return base.listar({ estado, creada_en: { $gte: desde, $lte: hasta } }, opciones);
    },

    async porReferencia(pasarela, referencia) {
      // El dominio recorta (`trim`) la pasarela y la referencia al escribir:
      // la búsqueda recorta igual para no fallar por espacios sobrantes.
      //
      // El filtro incluye **el mismo predicado que el índice parcial**
      // (`estado: { $in: ["pendiente", "aprobada"] }`) porque MongoDB solo usa
      // un índice parcial cuando la consulta **implica** su
      // `partialFilterExpression`: sin ese predicado la búsqueda caía en
      // COLLSCAN.
      //
      // La semántica es la del cargo: se devuelve la transacción **viva** de esa
      // referencia, la que representa un cargo pendiente o cobrado. Un intento
      // rechazado o anulado no se cobró, así que no bloquea un reintento con la
      // misma referencia (es lo que el propio índice parcial garantiza: solo
      // protege el cargo). Los intentos que no están vivos se consultan por
      // estado y fecha, con su propio índice.
      return base.obtenerUno({
        pasarela: pasarela.trim(),
        referencia_pasarela: referencia.trim(),
        estado: { $in: ["pendiente", "aprobada"] },
      });
    },

    async porFechaConfirmacion(desde, hasta, opciones) {
      // Solo las confirmadas: una transacción sin `confirmada_en` no entra.
      return base.listar({ confirmada_en: { $gte: desde, $lte: hasta } }, opciones);
    },
  };
}
