import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useLugares, type FiltrosLista } from "@/api/hooks";
import {
  ESTADOS_EVENTO,
  ETIQUETA_ESTADO,
  ETIQUETA_TIPO_EVENTO,
  TIPOS_EVENTO,
} from "@/formato/vocabularios";
import { Tarjeta } from "@/ui/piezas";

/**
 * Los filtros de los eventos: los parámetros que la query de `GET /api/eventos`
 * acepta.
 *
 * Viven en un solo lugar porque **el catálogo y la gestión los necesitan
 * iguales**: son los mismos filtros del mismo contrato, y lo que cambia entre
 * una pantalla y otra es el estado por defecto (el catálogo abre en
 * «publicado» y la gestión en todos), no los filtros.
 */

/** Los filtros de los eventos. */
export type FiltrosEvento = {
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
 * Todos empiezan vacíos, que en el contrato significa «sin filtro». El
 * catálogo los cambia por su cuenta (abre en «publicado»), y por eso el
 * estado por defecto se puede pasar como parámetro.
 */
export const FILTROS_INICIALES: FiltrosEvento = {
  tipo_evento: "",
  estado: "",
  categoria: "",
  lugar_id: "",
  desde: "",
  q: "",
};

/** Propiedades del bloque de filtros. */
export type FiltrosEventosProps = {
  /** Qué filtros se aplican al pulsar «Filtrar». */
  onAplicar: (filtros: FiltrosEvento) => void;
  /** El estado por defecto: lo que se ve antes de filtrar. */
  iniciales?: Partial<FiltrosEvento>;
  /** La 설명 de la tarjeta de filtros. */
  descripcion?: string;
};

/**
 * Los filtros de los eventos.
 *
 * Dos decisiones que vienen del contrato y no de la pantalla:
 *
 * - **Escribir no consulta.** Los filtros se aplican al pulsar «Filtrar»:
 *   si no, cada tecla sería una petición.
 * - **Los filtros vacíos no viajan.** La API lee `estado` y `tipo_evento` como
 *   vocabularios cerrados (`leerEnum`): mandarlos vacíos sería pedirle un
 *   parámetro inválido. «Todos» es la ausencia del filtro.
 */
export function FiltrosEventos({ onAplicar, iniciales, descripcion }: FiltrosEventosProps) {
  // Lo que el usuario está escribiendo, que todavía no se ha aplicado.
  const [borrador, setBorrador] = useState<FiltrosEvento>({
    ...FILTROS_INICIALES,
    ...iniciales,
  });
  const lugares = useLugares();

  /** Cambia un campo del borrador: todavía no consulta nada. */
  function cambiar(campo: keyof FiltrosEvento) {
    return (evento: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setBorrador((actual) => ({ ...actual, [campo]: evento.target.value }));
    };
  }

  /** Aplica los filtros del borrador. */
  function aplicar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    onAplicar({ ...borrador });
  }

  /** Vuelve al estado por defecto y lo aplica. */
  function limpiar() {
    const porDefecto = { ...FILTROS_INICIALES, ...iniciales };

    setBorrador(porDefecto);
    onAplicar(porDefecto);
  }

  return (
    <Tarjeta
      titulo="Filtros"
      descripcion={
        descripcion ?? "Los filtros se aplican al pulsar «Filtrar». Sin filtro, se ven todos."
      }
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
              {TIPOS_EVENTO.map((tipo) => (
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
              {ESTADOS_EVENTO.map((estado) => (
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
 * Los filtros aplicados, como parámetros de la query.
 *
 * Los campos vacíos **no viajan**: la API lee `tipo_evento` y `estado` como
 * vocabularios cerrados y un parámetro vacío sería una petición inválida.
 */
export function filtrosDeQuery(filtros: FiltrosEvento): FiltrosLista {
  const query: FiltrosLista = {};
  const campos: (keyof FiltrosEvento)[] = [
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

/** Las clases del control de formulario: los seis campos se ven igual. */
const CONTROL =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none";
