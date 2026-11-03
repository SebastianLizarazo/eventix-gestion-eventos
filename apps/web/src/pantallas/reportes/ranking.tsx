import { useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { useRankingVendidos } from "@/api/hooks";
import type { EventoRanking } from "@/api/tipos";
import {
  formatearFecha,
  formatearMoneda,
  formatearNumero,
  formatearPorcentaje,
} from "@/formato/es-co";
import { DistintivoEstado } from "@/ui/distintivos";
import { AvisoError, Cargando, Tarjeta, Vacio } from "@/ui/piezas";

/**
 * Ranking de los eventos más vendidos.
 *
 * Tres decisiones que conviene tener presentes:
 *
 * - **El panel no recalcula el ranking.** Los eventos que entran, su orden y
 *   sus cifras son los que devuelve la API: la interfaz solo los pinta. Un
 *   borrador no vendió nada y uno cancelado no se va a vender, así que quien
 *   decide qué entra es el reporte, no la pantalla.
 * - **El límite es un número, no un texto.** En los filtros de catálogo
 *   escribir no dispara peticiones porque cada tecla sería una consulta; acá
 *   el valor sale de una lista cerrada, así que cambiarlo consulta de una.
 * - **Los números se formatean con el locale `es-CO`.** El decimal es la coma
 *   y los miles son puntos: escribir el formato a mano es la forma rápida de
 *   que un día la pantalla diga "26.67 %" al lado de "120.000".
 */

/** Los límites que ofrece el selector: todos dentro del rango que la API acepta. */
const LIMITES: readonly number[] = [5, 10, 20, 50];

/** El límite con el que arranca el ranking: el mismo por defecto de la API. */
const LIMITE_INICIAL = 10;

/** Las clases del control de formulario: el selector se ve como los demás. */
const CONTROL =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none";

/** Panel del ranking de los eventos más vendidos. */
export function PanelRanking() {
  const [limite, setLimite] = useState(LIMITE_INICIAL);

  const ranking = useRankingVendidos(limite);

  /**
   * Cambia el límite del ranking.
   *
   * Acá el valor es un número de una lista cerrada: no hay nada que escribir,
   * así que no hace falta un borrador como en los filtros de texto.
   */
  function cambiarLimite(evento: ChangeEvent<HTMLSelectElement>) {
    setLimite(Number(evento.target.value));
  }

  return (
    <Tarjeta
      titulo="Eventos más vendidos"
      descripcion="Los eventos con más tickets vendidos, con su ocupación y la de cada tipo de ticket."
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="ranking-limite" className="block text-sm font-medium text-slate-700">
            Límite
          </label>
          <select
            id="ranking-limite"
            value={limite}
            onChange={cambiarLimite}
            className={CONTROL}
          >
            {LIMITES.map((opcion) => (
              <option key={opcion} value={opcion}>
                {opcion}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-600">Cuántos eventos trae el ranking.</p>
        </div>

        {ranking.isPending ? (
          <Cargando />
        ) : ranking.isError ? (
          <AvisoError error={ranking.error} />
        ) : ranking.data.items.length === 0 ? (
          <Vacio texto="No hay eventos con ventas registradas" />
        ) : (
          <TablaRanking items={ranking.data.items} />
        )}
      </div>
    </Tarjeta>
  );
}

/**
 * La tabla del ranking.
 *
 * El orden es el que dio la API: la posición se muestra, pero no se vuelve a
 * calcular.
 */
function TablaRanking({ items }: { items: EventoRanking[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="py-2 pr-3">
              #
            </th>
            <th scope="col" className="py-2 pr-3">
              Evento
            </th>
            <th scope="col" className="py-2 pr-3">
              Comienza
            </th>
            <th scope="col" className="py-2 pr-3">
              Estado
            </th>
            <th scope="col" className="py-2 pr-3">
              Tickets vendidos
            </th>
            <th scope="col" className="py-2 pr-3">
              Ingresos
            </th>
            <th scope="col" className="py-2 pr-3">
              Ocupación
            </th>
            <th scope="col" className="py-2">
              Ocupación por tipo de ticket
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((evento, indice) => (
            <FilaRanking key={evento.evento_id} posicion={indice + 1} evento={evento} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * La fila de un evento del ranking.
 *
 * El nombre es el enlace a su ficha: el identificador del ranking es el del
 * evento, así que el enlace apunta a `/eventos/{evento_id}`.
 */
function FilaRanking({ posicion, evento }: { posicion: number; evento: EventoRanking }) {
  return (
    <tr className="align-top">
      <td className="py-3 pr-3 text-slate-500">{posicion}</td>

      <td className="py-3 pr-3 font-medium text-slate-900">
        <Link to={`/eventos/${evento.evento_id}`} className="hover:text-slate-700">
          {evento.nombre}
        </Link>
      </td>

      <td className="py-3 pr-3 text-slate-600">{formatearFecha(evento.fecha_inicio)}</td>

      <td className="py-3 pr-3">
        <DistintivoEstado estado={evento.estado} />
      </td>

      <td className="py-3 pr-3 text-slate-900">{formatearNumero(evento.tickets_vendidos_total)}</td>

      <td className="py-3 pr-3 text-slate-900">{formatearMoneda(evento.ingresos_cop)}</td>

      <td className="py-3 pr-3">
        <span className="block text-slate-900">
          {formatearNumero(evento.aforo_vendido)} / {formatearNumero(evento.aforo_total)}
        </span>
        <span className="block text-xs text-slate-600">
          {formatearPorcentaje(evento.ocupacion_pct)}
        </span>
      </td>

      <td className="py-3">
        {evento.tipos_ticket.length === 0 ? (
          <span className="text-slate-400">—</span>
        ) : (
          <ul className="space-y-1">
            {evento.tipos_ticket.map((tipo) => (
              <li key={tipo.tipo_ticket_id} className="flex flex-wrap items-baseline gap-2 text-xs">
                <span className="font-medium text-slate-700">{tipo.nombre}</span>
                <span className="text-slate-600">
                  {formatearNumero(tipo.aforo_vendido)} / {formatearNumero(tipo.aforo_total)}
                </span>
                <span className="text-slate-600">{formatearPorcentaje(tipo.ocupacion_pct)}</span>
              </li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}
