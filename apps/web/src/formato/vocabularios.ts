import type {
  EstadoContable,
  EstadoEvento,
  EstadoTicket,
  MetodoPago,
  TipoEvento,
  TipoPromocion,
  VisibilidadEvento,
} from "@/api/tipos";

/**
 * Vocabularios del dominio, en español.
 *
 * La API guarda estos valores en su propia forma (`publicado`, `publico`,
 * `hibrido`): son palabras de máquina, y la interfaz las muestra en el idioma
 * en que se lee (spec S7).
 *
 * **Esto no es una lista de campos por tipo de evento.** Son los vocabularios
 * cerrados que el contrato define —los estados, la visibilidad, los tipos de
 * evento y los tipos de promoción—, y cada uno tiene su traducción. Los
 * campos propios de cada tipo de evento (el bloque `academico`, el `hibrido`…)
 * no están aquí: la ficha los muestra sin conocerlos (spec S10).
 */

/** Etiqueta en español de cada estado del evento. */
export const ETIQUETA_ESTADO: Record<EstadoEvento, string> = {
  borrador: "Borrador",
  publicado: "Publicado",
  cancelado: "Cancelado",
  finalizado: "Finalizado",
};

/**
 * Los estados del evento, en el orden en que se ofrecen.
 *
 * El **valor** de cada estado es el que la API entiende; su etiqueta en
 * español está arriba. La lista vive aquí para que los selectores de la
 * interfaz ofrezcan siempre los mismos valores, en el mismo orden.
 */
export const ESTADOS_EVENTO: readonly EstadoEvento[] = [
  "borrador",
  "publicado",
  "cancelado",
  "finalizado",
];

/** Etiqueta en español de cada visibilidad del evento. */
export const ETIQUETA_VISIBILIDAD: Record<VisibilidadEvento, string> = {
  publico: "Público",
  privado: "Privado",
};

/** Las visibilidades del evento, en el orden en que se ofrecen. */
export const VISIBILIDADES_EVENTO: readonly VisibilidadEvento[] = ["publico", "privado"];

/** Etiqueta en español de cada tipo de evento. */
export const ETIQUETA_TIPO_EVENTO: Record<TipoEvento, string> = {
  corporativo: "Corporativo",
  masivo: "Masivo",
  hibrido: "Híbrido",
  academico: "Académico",
};

/** Los tipos de evento del contrato, en el orden en que se ofrecen. */
export const TIPOS_EVENTO: readonly TipoEvento[] = [
  "corporativo",
  "masivo",
  "hibrido",
  "academico",
];

/** Etiqueta en español de cada tipo de promoción. */
export const ETIQUETA_TIPO_PROMOCION: Record<TipoPromocion, string> = {
  porcentaje: "Porcentaje",
  "2x1": "2x1",
  early_bird: "Early bird",
};

/**
 * Etiqueta en español de cada estado del ticket.
 *
 * El ticket tiene su propio vocabulario, distinto del estado del evento: un
 * evento puede estar publicado y sus tickets estar emitidos, usados o
 * anulados.
 */
export const ETIQUETA_ESTADO_TICKET: Record<EstadoTicket, string> = {
  emitido: "Emitido",
  usado: "Usado",
  anulado: "Anulado",
};

/**
 * Etiqueta en español de cada estado contable de una transacción.
 *
 * El estado contable es otro vocabulario, distinto del del evento y del del
 * ticket: es el que el cierre contable agrupa.
 */
export const ETIQUETA_ESTADO_CONTABLE: Record<EstadoContable, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  anulada: "Anulada",
  reembolsada: "Reembolsada",
};

/**
 * Etiqueta en español de cada método de pago.
 *
 * Es el vocabulario que la compra escribe: la API lo acepta como conjunto
 * cerrado y no lo cambia.
 */
export const ETIQUETA_METODO_PAGO: Record<MetodoPago, string> = {
  tarjeta_credito: "Tarjeta de crédito",
  tarjeta_debito: "Tarjeta de débito",
  efectivo: "Efectivo",
  transferencia: "Transferencia",
};
