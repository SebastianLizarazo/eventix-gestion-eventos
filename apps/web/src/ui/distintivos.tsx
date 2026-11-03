import type { EstadoEvento, EstadoTicket, VisibilidadEvento } from "@/api/tipos";
import { ETIQUETA_ESTADO, ETIQUETA_ESTADO_TICKET, ETIQUETA_VISIBILIDAD } from "@/formato/vocabularios";

/**
 * Distintivos del vocabulario del dominio.
 *
 * El color y el texto van juntos porque son la misma decisión: el estado
 * "publicado" se ve en verde y se lee "Publicado" en cualquier pantalla que lo
 * muestre. Duplicar el mapa en cada pantalla es la forma rápida de que un día
 * uno diga "publicado" y el otro "Publicado".
 */

const COLOR_ESTADO: Record<EstadoEvento, string> = {
  borrador: "bg-amber-100 text-amber-800",
  publicado: "bg-emerald-100 text-emerald-800",
  cancelado: "bg-rose-100 text-rose-800",
  finalizado: "bg-slate-100 text-slate-700",
};

const COLOR_VISIBILIDAD: Record<VisibilidadEvento, string> = {
  publico: "bg-sky-100 text-sky-800",
  privado: "bg-indigo-100 text-indigo-800",
};

const COLOR_ESTADO_TICKET: Record<EstadoTicket, string> = {
  emitido: "bg-sky-100 text-sky-800",
  usado: "bg-emerald-100 text-emerald-800",
  anulado: "bg-rose-100 text-rose-800",
};

/** El distintivo del estado de un evento. */
export function DistintivoEstado({ estado }: { estado: EstadoEvento }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR_ESTADO[estado]}`}
    >
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

/** El distintivo de la visibilidad de un evento. */
export function DistintivoVisibilidad({ visibilidad }: { visibilidad: VisibilidadEvento }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR_VISIBILIDAD[visibilidad]}`}
    >
      {ETIQUETA_VISIBILIDAD[visibilidad]}
    </span>
  );
}

/**
 * El distintivo del estado de un ticket.
 *
 * Es el que dice si el asistente todavía no usó su entrada, si la usó o si la
 * entrada quedó anulada.
 */
export function DistintivoEstadoTicket({ estado }: { estado: EstadoTicket }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR_ESTADO_TICKET[estado]}`}
    >
      {ETIQUETA_ESTADO_TICKET[estado]}
    </span>
  );
}
