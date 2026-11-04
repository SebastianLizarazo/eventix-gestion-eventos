import { useState, type FormEvent } from "react";
import { useEventos } from "@/api/hooks";
import { formatearFecha } from "@/formato/es-co";

/**
 * Selector de evento: la pieza que eligen los reportes que son **de un
 * evento** (el dashboard live y la exportación de asistentes).
 *
 * Tres decisiones que conviene tener presentes:
 *
 * - **Escribir no dispara peticiones.** El texto se busca al pulsar
 *   «Buscar», igual que en el catálogo: si no, cada tecla sería una consulta.
 * - **El evento elegido sobrevive a la búsqueda.** Si se busca otra cosa y el
 *   evento elegido deja de estar entre los resultados, sigue en la lista como
 *   opción: el selector nunca se queda sin valor y el reporte que ya se está
 *   viendo no cambia de evento por debajo.
 * - **Es controlado.** El evento elegido es estado de quien lo usa (el
 *   tablero de reportes), y este componente solo avisa del cambio.
 */

/** Propiedades del selector de evento. */
export type SelectorEventoProps = {
  /** Identificador del evento elegido, o `null` si todavía no hay ninguno. */
  eventoId: string | null;
  /** Avisa del evento que el usuario eligió. */
  onChange: (eventoId: string) => void;
  /**
   * Nombre del evento ya elegido, para quien lo conoce de antemano.
   *
   * El selector guarda el evento elegido para que sobreviva a la búsqueda,
   * pero ese nombre solo aparece si el usuario lo eligió aquí. Cuando el
   * evento llega desde otro lado —una ruta con su identificador, por
   * ejemplo—, quien lo usa pasa su nombre y el desplegable lo muestra.
   */
  nombreElegido?: string | null;
};

/** Cuántos eventos se ofrecen: los resultados de la búsqueda. */
const RESULTADOS = 20;

/** Las clases del control de formulario: los dos campos se ven igual. */
const CONTROL =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none";

/** Selector de evento. */
export function SelectorEvento({ eventoId, onChange, nombreElegido }: SelectorEventoProps) {
  // Lo que el usuario está escribiendo, que todavía no se ha buscado.
  const [texto, setTexto] = useState("");
  // Lo que la API tiene que responder.
  const [busqueda, setBusqueda] = useState("");
  // El evento elegido, con su nombre: el nombre sobrevive a la búsqueda aunque
  // el evento ya no esté entre los resultados.
  const [elegido, setElegido] = useState<{ id: string; nombre: string } | null>(null);

  const eventos = useEventos({ q: busqueda || undefined, limit: RESULTADOS });
  const resultados = eventos.data?.items ?? [];

  /**
   * El evento que el desplegable conserva.
   *
   * Es el que el usuario eligió aquí, o el que llegó desde afuera con su
   * nombre (una ruta con su identificador, por ejemplo).
   */
  const conservado =
    elegido ?? (eventoId && nombreElegido ? { id: eventoId, nombre: nombreElegido } : null);

  /**
   * Las opciones del desplegable.
   *
   * Si el evento elegido no está entre los resultados, se conserva como
   * primera opción: el selector no puede quedarse sin valor.
   */
  const opciones = [
    ...(conservado && !resultados.some((evento) => evento._id === conservado.id)
      ? [{ id: conservado.id, texto: conservado.nombre }]
      : []),
    ...resultados.map((evento) => ({
      id: evento._id,
      texto: `${evento.nombre} — ${formatearFecha(evento.fecha_inicio)}`,
    })),
  ];

  /** Busca los eventos con el texto escrito. */
  function buscar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    setBusqueda(texto.trim());
  }

  /** Elige un evento y avisa del cambio. */
  function elegir(id: string) {
    const encontrado = resultados.find((evento) => evento._id === id);

    if (encontrado) {
      setElegido({ id, nombre: encontrado.nombre });
    }

    onChange(id);
  }

  return (
    <form onSubmit={buscar} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label
            htmlFor="selector-evento-busqueda"
            className="block text-sm font-medium text-slate-700"
          >
            Buscar evento
          </label>
          <input
            id="selector-evento-busqueda"
            type="search"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            className={CONTROL}
            placeholder="rock"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="selector-evento-lista"
            className="block text-sm font-medium text-slate-700"
          >
            Evento
          </label>
          <select
            id="selector-evento-lista"
            value={eventoId ?? ""}
            onChange={(evento) => elegir(evento.target.value)}
            className={CONTROL}
          >
            <option value="">Elige un evento</option>
            {opciones.map((opcion) => (
              <option key={opcion.id} value={opcion.id}>
                {opcion.texto}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Buscar
        </button>

        {elegido ? (
          <p className="text-sm text-slate-600">
            Evento elegido:{" "}
            <span className="font-medium text-slate-900">{elegido.nombre}</span>
          </p>
        ) : (
          <p className="text-sm text-slate-500">Todavía no se ha elegido ningún evento</p>
        )}
      </div>
    </form>
  );
}
