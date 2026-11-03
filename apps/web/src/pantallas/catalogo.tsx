import { useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useEventos, useLugares, type FiltrosLista } from "@/api/hooks";
import type { EstadoEvento, Evento, TipoEvento } from "@/api/tipos";
import { formatearFecha, formatearNumero } from "@/formato/es-co";
import { ETIQUETA_ESTADO, ETIQUETA_TIPO_EVENTO } from "@/formato/vocabularios";
import { DistintivoEstado, DistintivoVisibilidad } from "@/ui/distintivos";
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

/** Los tipos de evento del contrato, en el orden en que se ofrecen. */
const TIPOS: readonly TipoEvento[] = ["corporativo", "masivo", "hibrido", "academico"];

/** Los estados del contrato, en el orden en que se ofrecen. */
const ESTADOS: readonly EstadoEvento[] = ["borrador", "publicado", "cancelado", "finalizado"];

/** Las clases del control de formulario: los seis campos se ven igual. */
const CONTROL =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none";

/** Los filtros del catálogo: los parámetros de la query de `GET /api/eventos`. */
type Filtros = {
  tipo_evento: string;
  estado: string;
  categoria: string;
  lugar_id: string;
  desde: string;
  q: string;
};

/**
 * El estado por defecto de los filtros.
 *
 * El estado por defecto es `publicado`: son los eventos que la API todavía no
 * da por terminados, los que se pueden recorrer con datos vivos. Los demás
 * filtros empiezan vacíos, que en el contrato significa «sin filtro».
 */
const FILTROS_INICIALES: Filtros = {
  tipo_evento: "",
  estado: "publicado",
  categoria: "",
  lugar_id: "",
  desde: "",
  q: "",
};

/** Pantalla del catálogo: filtros, cuadrícula de eventos y paginación. */
export function Catalogo() {
  // Lo que el usuario está escribiendo, que todavía no se ha aplicado.
  const [borrador, setBorrador] = useState<Filtros>(FILTROS_INICIALES);
  // Lo que la API tiene que responder.
  const [aplicados, setAplicados] = useState<Filtros>(FILTROS_INICIALES);
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

  /** Cambia un campo del borrador: todavía no consulta nada. */
  function cambiar(campo: keyof Filtros) {
    return (evento: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setBorrador((actual) => ({ ...actual, [campo]: evento.target.value }));
    };
  }

  /** Aplica los filtros del borrador y vuelve a la primera página. */
  function aplicar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    setAplicados({ ...borrador });
    setSkip(0);
  }

  /** Borra los filtros y vuelve al estado por defecto y a la primera página. */
  function limpiar() {
    setBorrador({ ...FILTROS_INICIALES });
    setAplicados({ ...FILTROS_INICIALES });
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

      <Tarjeta
        titulo="Filtros"
        descripcion="Los filtros se aplican al pulsar «Filtrar». Por defecto se ven los eventos publicados."
      >
        <form onSubmit={aplicar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo id="filtro-tipo-evento" etiqueta="Tipo de evento">
              <select
                id="filtro-tipo-evento"
                value={borrador.tipo_evento}
                onChange={cambiar("tipo_evento")}
                className={CONTROL}
              >
                <option value="">Todos</option>
                {TIPOS.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {ETIQUETA_TIPO_EVENTO[tipo]}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo id="filtro-estado" etiqueta="Estado">
              <select
                id="filtro-estado"
                value={borrador.estado}
                onChange={cambiar("estado")}
                className={CONTROL}
              >
                <option value="">Todos</option>
                {ESTADOS.map((estado) => (
                  <option key={estado} value={estado}>
                    {ETIQUETA_ESTADO[estado]}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo id="filtro-categoria" etiqueta="Categoría">
              <input
                id="filtro-categoria"
                type="text"
                value={borrador.categoria}
                onChange={cambiar("categoria")}
                className={CONTROL}
                placeholder="conciertos"
              />
            </Campo>

            <Campo id="filtro-lugar" etiqueta="Lugar">
              <select
                id="filtro-lugar"
                value={borrador.lugar_id}
                onChange={cambiar("lugar_id")}
                className={CONTROL}
              >
                <option value="">Todos</option>
                {(lugares.data?.items ?? []).map((lugar) => (
                  <option key={lugar._id} value={lugar._id}>
                    {lugar.nombre} — {lugar.direccion}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo id="filtro-desde" etiqueta="Desde">
              <input
                id="filtro-desde"
                type="date"
                value={borrador.desde}
                onChange={cambiar("desde")}
                className={CONTROL}
              />
            </Campo>

            <Campo id="filtro-q" etiqueta="Búsqueda">
              <input
                id="filtro-q"
                type="search"
                value={borrador.q}
                onChange={cambiar("q")}
                className={CONTROL}
                placeholder="rock"
              />
            </Campo>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Filtrar
            </button>
            <button
              type="button"
              onClick={limpiar}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Limpiar
            </button>
          </div>
        </form>
      </Tarjeta>

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

/** Una etiqueta y su control: el patrón de todos los campos del formulario. */
function Campo({ id, etiqueta, children }: { id: string; etiqueta: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {etiqueta}
      </label>
      {children}
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

/**
 * Los filtros aplicados, como parámetros de la query.
 *
 * Los campos vacíos **no viajan**: la API lee `tipo_evento` y `estado` como
 * vocabularios cerrados y un parámetro vacío sería una petición inválida.
 */
function filtrosDeQuery(filtros: Filtros): FiltrosLista {
  const query: FiltrosLista = {};
  const campos: (keyof Filtros)[] = [
    "tipo_evento",
    "estado",
    "categoria",
    "lugar_id",
    "desde",
    "q",
  ];

  for (const campo of campos) {
    const valor = filtros[campo];

    if (valor !== "") {
      query[campo] = valor;
    }
  }

  return query;
}
