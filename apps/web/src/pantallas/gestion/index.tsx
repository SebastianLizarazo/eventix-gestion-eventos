import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useBorrarEvento, useEventos, useLugares } from "@/api/hooks";
import type { Evento } from "@/api/tipos";
import { formatearFecha, formatearNumero } from "@/formato/es-co";
import { ETIQUETA_TIPO_EVENTO } from "@/formato/vocabularios";
import { DistintivoEstado, DistintivoVisibilidad } from "@/ui/distintivos";
import {
  FILTROS_INICIALES,
  FiltrosEventos,
  filtrosDeQuery,
  type FiltrosEvento,
} from "@/ui/filtros-eventos";
import { AvisoError, Cargando, Tarjeta, Vacio } from "@/ui/piezas";

/**
 * Gestión de eventos: la tabla con la que se operan los eventos.
 *
 * Es la pantalla **operativa**, distinta del catálogo: el catálogo es el
 * lugar donde el profesor recorre los eventos publicados y esta es el lugar
 * donde se escriben. Por eso la tabla muestra los estados que el catálogo no
 * muestra (borradores, cancelados, finalizados), la versión del documento y
 * las acciones de edición y baja.
 *
 * Los filtros son los mismos del catálogo, porque son los del contrato: lo
 * que cambia es que aquí no se abre en «publicado», sino en todos.
 */

/** Eventos por página: el tamaño con el que la tabla se pagina. */
const POR_PAGINA = 25;

/** Pantalla de gestión de eventos. */
export function GestionEventos() {
  // Los filtros aplicados: la API tiene que responder a esto.
  const [aplicados, setAplicados] = useState<FiltrosEvento>(FILTROS_INICIALES);
  // Cuántos eventos se saltan: la página actual es `skip / POR_PAGINA + 1`.
  const [skip, setSkip] = useState(0);
  // El evento que el usuario está a punto de borrar.
  const [porBorrar, setPorBorrar] = useState<Evento | null>(null);

  const filtros = useMemo(() => filtrosDeQuery(aplicados), [aplicados]);

  const eventos = useEventos({ ...filtros, skip, limit: POR_PAGINA });
  const lugares = useLugares();
  const borrar = useBorrarEvento();

  const total = eventos.data?.total ?? null;
  const pagina = Math.floor(skip / POR_PAGINA) + 1;
  const totalPaginas = total === null ? null : Math.ceil(total / POR_PAGINA);
  const haySiguiente =
    total === null ? (eventos.data?.items.length ?? 0) >= POR_PAGINA : skip + POR_PAGINA < total;

  /** Nombre de cada lugar, para ponerlo en la fila de su evento. */
  const nombresLugar = useMemo(
    () => new Map((lugares.data?.items ?? []).map((lugar) => [lugar._id, lugar.nombre])),
    [lugares.data],
  );

  /** Aplica los filtros y vuelve a la primera página. */
  function aplicar(filtrosNuevos: FiltrosEvento): void {
    setAplicados(filtrosNuevos);
    setSkip(0);
  }

  /** Ejecuta el borrado del evento que el usuario confirmó. */
  function confirmarBorrado(): void {
    if (porBorrar === null) {
      return;
    }

    const id = porBorrar._id;

    setPorBorrar(null);
    borrar.mutate(id);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">Gestión de eventos</h1>
          <p className="text-sm text-slate-600">
            Todos los eventos, con su estado y su versión. Desde aquí se dan de alta, se editan y se
            dan de baja.
          </p>
        </div>

        <Link
          to="/gestion/eventos/nuevo"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
        >
          Nuevo evento
        </Link>
      </header>

      <FiltrosEventos onAplicar={aplicar} />

      <Tarjeta titulo="Eventos" descripcion="Los eventos que cumplen los filtros aplicados.">
        {eventos.isPending ? (
          <Cargando />
        ) : eventos.isError ? (
          <AvisoError error={eventos.error} />
        ) : eventos.data.items.length === 0 ? (
          <Vacio texto="No hay eventos que cumplan los filtros" />
        ) : (
          <TablaEventos
            eventos={eventos.data.items}
            nombresLugar={nombresLugar}
            porBorrar={porBorrar}
            onPedirBorrado={setPorBorrar}
            onCancelarBorrado={() => setPorBorrar(null)}
            onConfirmarBorrado={confirmarBorrado}
          />
        )}

        {borrar.error !== null ? <AvisoError error={borrar.error} /> : null}

        <nav
          aria-label="Paginación de la gestión"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"
        >
          <p className="text-sm text-slate-600">
            {`Página ${pagina} de ${totalPaginas === null ? "—" : totalPaginas}`}
          </p>
          <p className="text-sm text-slate-600">{`${formatearNumero(total)} eventos`}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSkip(Math.max(0, skip - POR_PAGINA))}
              disabled={skip === 0}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setSkip(skip + POR_PAGINA)}
              disabled={!haySiguiente}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </nav>
      </Tarjeta>
    </div>
  );
}

/** Propiedades de la tabla de eventos. */
type TablaEventosProps = {
  eventos: Evento[];
  nombresLugar: Map<string, string>;
  porBorrar: Evento | null;
  onPedirBorrado: (evento: Evento) => void;
  onCancelarBorrado: () => void;
  onConfirmarBorrado: () => void;
};

/** La tabla con los eventos y lo que se puede hacer con cada uno. */
function TablaEventos({
  eventos,
  nombresLugar,
  porBorrar,
  onPedirBorrado,
  onCancelarBorrado,
  onConfirmarBorrado,
}: TablaEventosProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="py-2 pr-4 font-medium">
              Evento
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Tipo
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Estado
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Comienza
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Lugar
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Versión
            </th>
            <th scope="col" className="py-2 font-medium">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {eventos.map((evento) => (
            <tr key={evento._id}>
              <th scope="row" className="py-3 pr-4 font-medium text-slate-900">
                <Link to={`/eventos/${evento._id}`} className="hover:text-slate-700">
                  {evento.nombre}
                </Link>
                <span className="mt-1 flex items-center gap-1">
                  <DistintivoVisibilidad visibilidad={evento.visibilidad} />
                </span>
              </th>
              <td className="py-3 pr-4 text-slate-600">
                {ETIQUETA_TIPO_EVENTO[evento.tipo_evento]}
              </td>
              <td className="py-3 pr-4">
                <DistintivoEstado estado={evento.estado} />
              </td>
              <td className="py-3 pr-4 text-slate-600">{formatearFecha(evento.fecha_inicio)}</td>
              <td className="py-3 pr-4 text-slate-600">
                {nombresLugar.get(evento.lugar_id) ?? evento.lugar_id}
              </td>
              <td className="py-3 pr-4 text-slate-600">{formatearNumero(evento._v)}</td>
              <td className="py-3">
                {porBorrar?._id === evento._id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-600">¿Eliminar el evento?</span>
                    <button
                      type="button"
                      onClick={onConfirmarBorrado}
                      className="rounded-md bg-red-700 px-2 py-1 text-xs font-semibold text-white hover:bg-red-600"
                    >
                      Sí, eliminar
                    </button>
                    <button
                      type="button"
                      onClick={onCancelarBorrado}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={`/gestion/eventos/${evento._id}`}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Editar
                    </Link>
                    <button
                      type="button"
                      onClick={() => onPedirBorrado(evento)}
                      className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
