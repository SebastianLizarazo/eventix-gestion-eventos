import type { Document } from "mongodb";
import { toObjectId } from "../domain/ids.js";
import type {
  Auditoria,
  Evento,
  Lugar,
  Ticket,
  Transaccion,
  Usuario,
} from "../domain/schemas/index.js";

/**
 * Mapper dominio ⟷ BSON: el borde donde el dominio (identificadores en
 * hexadecimal) se convierte al tipo real de la base de datos.
 *
 * El modelo persiste **las referencias entre documentos como `objectId`**
 * (documento 04 §3), así que el documento que entrega el dominio no se puede
 * escribir tal cual: hay que convertir cada identificador.
 *
 * La conversión es **explícita, campo por campo**, y nunca genérica: un
 * recorrido automático convertiría a `ObjectId` cualquier cadena de 24
 * hexadecimales — y un `codigo_qr` o un `documento_identidad` también pueden
 * serlo — y corrompería el documento.
 *
 * La conversión inversa (BSON ⟷ dominio) no vive aquí: la hace el propio
 * esquema del dominio al leer, porque `objectIdSchema` acepta el `ObjectId`
 * nativo y lo normaliza a hexadecimal. Así, leer valida además la forma.
 */

/** Documento del dominio con `_id` asignado: lo garantiza el repositorio. */
export type DocumentoConId<T> = T & { _id: string };

/**
 * Quita las claves cuyo valor es `undefined`.
 *
 * El dominio distingue "campo ausente" de "campo con valor": tras validar con
 * Zod, un campo opcional ausente queda en `undefined`. El driver serializa ese
 * `undefined` como `null`, y `null` **no** cumple el `bsonType` que declara el
 * validator del servidor (por ejemplo `descripcion: { bsonType: "string" }`):
 * el insert se rechazaría. Por eso el documento que sale del mapper no tiene
 * claves con valor `undefined`.
 */
/**
 * Dice si el valor es un objeto plano (un `document` de MongoDB), y no una
 * clase con comportamiento propio como `Date`, `ObjectId` o `Buffer`: esos
 * tipos deben sobrevivir intactos.
 */
function esObjetoPlano(valor: unknown): valor is Record<string, unknown> {
  if (typeof valor !== "object" || valor === null) {
    return false;
  }

  const prototipo = Object.getPrototypeOf(valor);

  return prototipo === Object.prototype || prototipo === null;
}

function sinIndefinidos(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(sinIndefinidos);
  }

  if (esObjetoPlano(valor)) {
    const entradas = Object.entries(valor).filter(([, interno]) => interno !== undefined);

    return Object.fromEntries(entradas.map(([clave, interno]) => [clave, sinIndefinidos(interno)]));
  }

  return valor;
}

/** Aplica el limpiado de `undefined` a un documento del dominio. */
function limpiar<T extends object>(documento: T): Document {
  return sinIndefinidos(documento) as Document;
}

/** `usuarios` no referencia otros documentos: solo su propio identificador. */
export function usuarioABson(usuario: DocumentoConId<Usuario>): Document {
  return limpiar({ ...usuario, _id: toObjectId(usuario._id) });
}

/** `lugares` no referencia otros documentos: solo su propio identificador. */
export function lugarABson(lugar: DocumentoConId<Lugar>): Document {
  return limpiar({ ...lugar, _id: toObjectId(lugar._id) });
}

/**
 * `eventos` referencia al organizador y al lugar, y embebe los identificadores
 * de sus tipos de ticket: tanto en `tipos_ticket._id` como en
 * `promociones[].aplica_a_tipo_ticket_ids`.
 */
export function eventoABson(evento: DocumentoConId<Evento>): Document {
  return limpiar({
    ...evento,
    _id: toObjectId(evento._id),
    organizador_id: toObjectId(evento.organizador_id),
    lugar_id: toObjectId(evento.lugar_id),
    tipos_ticket: evento.tipos_ticket.map((tipo) => ({
      ...tipo,
      _id: toObjectId(tipo._id),
    })),
    promociones: evento.promociones.map((promocion) => ({
      ...promocion,
      aplica_a_tipo_ticket_ids: promocion.aplica_a_tipo_ticket_ids.map((id) => toObjectId(id)),
    })),
  });
}

/**
 * `tickets` referencia el evento, el comprador y la transacción, y lleva el
 * *snapshot* del tipo de ticket y del asistente: los dos identificadores del
 * snapshot también son `objectId` en el documento persistido.
 */
export function ticketABson(ticket: DocumentoConId<Ticket>): Document {
  return limpiar({
    ...ticket,
    _id: toObjectId(ticket._id),
    evento_id: toObjectId(ticket.evento_id),
    comprado_por_usuario_id: toObjectId(ticket.comprado_por_usuario_id),
    snapshot_tipo_ticket: {
      ...ticket.snapshot_tipo_ticket,
      tipo_ticket_id: toObjectId(ticket.snapshot_tipo_ticket.tipo_ticket_id),
    },
    asistente_snapshot: {
      ...ticket.asistente_snapshot,
      usuario_id: toObjectId(ticket.asistente_snapshot.usuario_id),
    },
    transaccion_id: ticket.transaccion_id ? toObjectId(ticket.transaccion_id) : undefined,
  });
}

/** `transacciones` referencia al usuario y al ticket. */
export function transaccionABson(transaccion: DocumentoConId<Transaccion>): Document {
  return limpiar({
    ...transaccion,
    _id: toObjectId(transaccion._id),
    usuario_id: toObjectId(transaccion.usuario_id),
    ticket_id: toObjectId(transaccion.ticket_id),
  });
}

/**
 * `auditoria_eventos` referencia al actor y al sujeto. `metadata` es libre a
 * propósito (NFR-04) y **no** se convierte: su contenido es opaco para el
 * modelo y puede llevar cualquier valor.
 */
export function auditoriaABson(auditoria: DocumentoConId<Auditoria>): Document {
  return limpiar({
    ...auditoria,
    _id: toObjectId(auditoria._id),
    actor_id: toObjectId(auditoria.actor_id),
    sujeto_id: toObjectId(auditoria.sujeto_id),
  });
}
