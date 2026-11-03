import type { EstadoEvento, TipoEvento, TipoPromocion, VisibilidadEvento } from "@/api/tipos";

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

/** Etiqueta en español de cada visibilidad del evento. */
export const ETIQUETA_VISIBILIDAD: Record<VisibilidadEvento, string> = {
  publico: "Público",
  privado: "Privado",
};

/** Etiqueta en español de cada tipo de evento. */
export const ETIQUETA_TIPO_EVENTO: Record<TipoEvento, string> = {
  corporativo: "Corporativo",
  masivo: "Masivo",
  hibrido: "Híbrido",
  academico: "Académico",
};

/** Etiqueta en español de cada tipo de promoción. */
export const ETIQUETA_TIPO_PROMOCION: Record<TipoPromocion, string> = {
  porcentaje: "Porcentaje",
  "2x1": "2x1",
  early_bird: "Early bird",
};
