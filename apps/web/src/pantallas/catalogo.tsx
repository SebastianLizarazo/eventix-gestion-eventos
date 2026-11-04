import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useEventos, useLugares } from "@/api/hooks";
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
import { AvisoError, Cargando, Dato, Tarjeta, Vacio } from "@/ui/piezas";

/**
 * Catálogo de eventos: la pantalla donde el profesor recorre el conjunto de
 * eventos y encuentra el que le interesa.
 *
 * Tres decisiones que conviene tener presentes:
 *
 * - **El borrador y los filtros aplicados son estados distintos.** Escribir en
 *   un campo no dispara peticiones: los filtros se aplican al pulsar
 *   «Filtrar». Si no, cada tecla sería una consulta a la API.
 * - **Los filtros vacíos no viajan.** La API lee `estado` y `tipo_evento` como
 *   vocabularios cerrados (`leerEnum`): mandarlos vacíos sería pedirle un
 *   parámetro inválido y la pantalla se llenaría de errores. «Todos» es
 *   ausencia de filtro, no un valor.
 * - **La paginación no borra los filtros.** Cambiar de página es otra lectura
 *   de la misma consulta, no una consulta nueva.
 */

/** Eventos por página: el tamaño con el que la cuadrícula se pagina. */
const POR_PAGINA = 12;

/**
 * El estado por defecto de los filtros del catálogo.
 *
 * Es `publicado`: son los eventos que la API todavía no da por terminados,
 * los que se pueden recorrer con datos vivos. Los demás filtros empiezan
 * vacíos, que en el contrato significa «sin filtro».
 */
const FILTROS_PUBLICOS: FiltrosEvento = { ...FILTROS_INICIALES, estado: "publicado" };

/** Pantalla del catálogo: filtros, cuadrícula de eventos y paginación. */
export function Catalogo() {
  // Lo que la API tiene que responder: los filtros que se aplicaron.
  const [aplicados, setAplicados] = useState<FiltrosEvento>(FILTROS_PUBLICOS);
  // Cuántos eventos se saltan: la página actual es `skip / POR_PAGINA + 1`.
  const [skip, setSkip] = useState(0);

  const filtros = useMemo(() => filtrosDeQuery(aplicados), [aplicados]);

  const eventos = useEventos({ ...filtros, skip, limit: POR_PAGINA });
  const lugares = useLugares();

  const total = eventos.data?.total ?? null;
  const pagina = Math.floor(skip / POR_PAGINA) + 1;
  const totalPaginas = total === null ? null : Math.ceil(total / POR_PAGINA);

  /**
   * Si hay página siguiente.
   *
   * Con el total conocido la respuesta es exacta. Cuando la API no sabe
   * cuántas filas hay (`total` en `null`), se responde por la página que llegó:
   * si vino llena, puede haber otra; si vino a medias, no la hay.
   */
  const haySiguiente =
    total === null ? (eventos.data?.items.length ?? 0) >= POR_PAGINA : skip + POR_PAGINA < total;

  /** Nombre de cada lugar, para ponerlo en la tarjeta de su evento. */
  const nombresLugar = useMemo(
    () => new Map((lugares.data?.items ?? []).map((lugar) => [lugar._id, lugar.nombre])),
    [lugares.data],
  );

  /** Aplica los filtros y vuelve a la primera página. */
  function aplicar(filtros: FiltrosEvento) {
    setAplicados(filtros);
    setSkip(0);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Catálogo de eventos</h1>
        <p className="mt-1 text-sm text-slate-600">
          Los eventos de Eventix, con los filtros del catálogo y su paginación.
        </p>
      </header>

      <FiltrosEventos
        onAplicar={aplicar}
        iniciales={{ estado: "publicado" }}
        descripcion="Los filtros se aplican al pulsar «Filtrar». Por defecto se ven los eventos publicados."
      />

      <Tarjeta titulo="Eventos" descripcion="Los eventos que cumplen los filtros aplicados.">
        {eventos.isPending ? (
          <Cargando />
        ) : eventos.isError ? (
          <AvisoError error={eventos.error} />
        ) : eventos.data.items.length === 0 ? (
          <Vacio texto="No hay eventos que cumplan los filtros" />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {eventos.data.items.map((evento) => (
              <li key={evento._id}>
                <TarjetaEvento evento={evento} nombreLugar={nombresLugar.get(evento.lugar_id)} />
              </li>
            ))}
          </ul>
        )}

        <nav
          aria-label="Paginación del catálogo"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"
        >
          <p className="text-sm text-slate-600">
            Página {pagina} de {totalPaginas === null ? "—" : totalPaginas}
          </p>
          <p className="text-sm text-slate-600">{formatearNumero(total)} eventos</p>
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

/**
 * La tarjeta de un evento.
 *
 * El nombre es el enlace a su ficha. La pieza `Tarjeta` solo admite texto en
 * el título, así que la tarjeta del evento se arma aquí con las mismas clases
 * visuales que las piezas compartidas.
 */
function TarjetaEvento({ evento, nombreLugar }: { evento: Evento; nombreLugar?: string }) {
  const metricas = evento.metricas_evento;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
          {ETIQUETA_TIPO_EVENTO[evento.tipo_evento]}
        </span>
        <DistintivoEstado estado={evento.estado} />
        <DistintivoVisibilidad visibilidad={evento.visibilidad} />
      </div>

      <h2 className="mt-3 text-lg font-semibold text-slate-900">
        <Link to={`/eventos/${evento._id}`} className="hover:text-slate-700">
          {evento.nombre}
        </Link>
      </h2>

      <dl className="mt-3 divide-y divide-slate-100">
        <Dato etiqueta="Comienza" valor={formatearFecha(evento.fecha_inicio)} />
        <Dato etiqueta="Lugar" valor={nombreLugar ?? evento.lugar_id} />
        <Dato etiqueta="Categorías" valor={<Categorias categorias={evento.categorias} />} />
        {metricas ? (
          <Dato
            etiqueta="Tickets vendidos"
            valor={formatearNumero(metricas.tickets_vendidos_total)}
          />
        ) : null}
      </dl>
    </article>
  );
}

/** Las categorías del evento, como distintivos. */
function Categorias({ categorias }: { categorias: string[] }) {
  if (categorias.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <span className="flex flex-wrap justify-end gap-1">
      {categorias.map((categoria) => (
        <span
          key={categoria}
          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
        >
          {categoria}
        </span>
      ))}
    </span>
  );
}
