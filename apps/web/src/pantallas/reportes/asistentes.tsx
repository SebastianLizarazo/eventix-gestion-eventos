import { useState, type ChangeEvent, type FormEvent } from "react";
import { useAsistentes } from "@/api/hooks";
import type { Asistente, EstadoTicket } from "@/api/tipos";
import { formatearFechaHora, formatearMoneda, formatearNumero } from "@/formato/es-co";
import { ETIQUETA_ESTADO_TICKET } from "@/formato/vocabularios";
import { DistintivoEstadoTicket } from "@/ui/distintivos";
import { AvisoError, Cargando, Tarjeta, Vacio } from "@/ui/piezas";

/**
 * Panel de asistentes de un evento: la exportación de las entradas vendidas.
 *
 * Tres decisiones que conviene tener presentes:
 *
 * - **El borrador y el filtro aplicado son estados distintos.** Escribir en el
 *   desplegable no dispara peticiones: el filtro se aplica al pulsar
 *   «Filtrar». Si no, cada cambio sería una consulta a la API.
 * - **«Todos» es la ausencia del parámetro.** La API lee `estado` como
 *   vocabulario cerrado y responde 400 a un valor que no exista, así que un
 *   `estado` vacío no viaja nunca.
 * - **La tabla muestra snapshots, no datos unidos.** El asistente y el tipo
 *   de ticket son los que el ticket guardó cuando se emitió: la exportación
 *   no lee `usuarios` ni `eventos`, así que la interfaz no busca ni el evento
 *   ni el usuario.
 */

/** Asistentes por página: el tamaño con el que la tabla se pagina. */
const POR_PAGINA = 25;

/** Los estados del ticket del contrato, en el orden en que se ofrecen. */
const ESTADOS: readonly EstadoTicket[] = ["emitido", "usado", "anulado"];

/**
 * El filtro por estado.
 *
 * `""` es «Todos»: la **ausencia** del parámetro, no un valor vacío —la API
 * leería un estado vacío y lo rechazaría.
 */
type FiltroEstado = EstadoTicket | "";

/** Las clases del control de filtro y del botón: los mismos del catálogo. */
const CONTROL =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none";

const BOTON = "rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700";

/**
 * El panel de asistentes de un evento.
 *
 * Sin evento no hay nada que exportar: la consulta queda apagada y se pide
 * elegir uno.
 */
export function PanelAsistentes({ eventoId }: { eventoId: string | null }) {
  // Lo que el usuario está escribiendo, que todavía no se ha aplicado.
  const [borrador, setBorrador] = useState<FiltroEstado>("");
  // Lo que la API tiene que responder.
  const [aplicados, setAplicados] = useState<FiltroEstado>("");
  // Cuántos asistentes se saltan: la página actual es `skip / POR_PAGINA + 1`.
  const [skip, setSkip] = useState(0);

  const estado = aplicados === "" ? undefined : aplicados;

  const asistentes = useAsistentes(eventoId, { estado, skip, limit: POR_PAGINA });

  const total = asistentes.data?.total ?? null;
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
    total === null ? (asistentes.data?.items.length ?? 0) >= POR_PAGINA : skip + POR_PAGINA < total;

  /** Cambia el filtro del borrador: todavía no consulta nada. */
  function cambiar(evento: ChangeEvent<HTMLSelectElement>) {
    setBorrador(estadoDe(evento.target.value));
  }

  /** Aplica el filtro del borrador y vuelve a la primera página. */
  function aplicar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    setAplicados(borrador);
    setSkip(0);
  }

  // El hook ya está apagado sin evento (`habilitada: eventoId !== null`), así
  // que aquí solo se decide qué se muestra.
  if (eventoId === null) {
    return (
      <Tarjeta titulo="Asistentes">
        <Vacio texto="Elige un evento para ver sus asistentes." />
      </Tarjeta>
    );
  }

  return (
    <div className="space-y-6">
      <Tarjeta titulo="Filtros" descripcion="El filtro se aplica al pulsar «Filtrar».">
        <form onSubmit={aplicar} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="asistentes-estado" className="block text-sm font-medium text-slate-700">
              Estado
            </label>
            <select id="asistentes-estado" value={borrador} onChange={cambiar} className={CONTROL}>
              <option value="">Todos</option>
              {ESTADOS.map((valor) => (
                <option key={valor} value={valor}>
                  {ETIQUETA_ESTADO_TICKET[valor]}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className={BOTON}>
            Filtrar
          </button>
        </form>
      </Tarjeta>

      <Tarjeta
        titulo="Asistentes"
        descripcion="Los asistentes del evento, con el snapshot que guardó cada ticket."
      >
        {asistentes.isPending ? (
          <Cargando />
        ) : asistentes.isError ? (
          <AvisoError error={asistentes.error} />
        ) : asistentes.data.items.length === 0 ? (
          <Vacio texto="No hay asistentes que cumplan los filtros" />
        ) : (
          <TablaAsistentes items={asistentes.data.items} />
        )}

        <nav
          aria-label="Paginación de asistentes"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"
        >
          <p className="text-sm text-slate-600">
            Página {pagina} de {totalPaginas === null ? "—" : totalPaginas}
          </p>
          <p className="text-sm text-slate-600">{formatearNumero(total)} asistentes</p>
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
 * La tabla de asistentes.
 *
 * Cada celda sale del snapshot del ticket: lo que la API calcula (el precio
 * pagado, la promoción) ya viene resuelto, así que la interfaz no lo
 * recalcula.
 */
function TablaAsistentes({ items }: { items: Asistente[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="py-2 pr-3">
              Código QR
            </th>
            <th scope="col" className="py-2 pr-3">
              Asistente
            </th>
            <th scope="col" className="py-2 pr-3">
              Tipo de ticket
            </th>
            <th scope="col" className="py-2 pr-3">
              Precio pagado
            </th>
            <th scope="col" className="py-2 pr-3">
              Promoción
            </th>
            <th scope="col" className="py-2 pr-3">
              Estado
            </th>
            <th scope="col" className="py-2 pr-3">
              Emitido
            </th>
            <th scope="col" className="py-2 pr-3">
              Validado
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((asistente) => (
            <tr key={asistente.ticket_id}>
              <td className="py-2 pr-3 font-mono text-xs text-slate-700">{asistente.codigo_qr}</td>
              <td className="py-2 pr-3">
                <p className="font-medium text-slate-900">{asistente.asistente.nombre}</p>
                <p className="text-xs text-slate-500">{asistente.asistente.documento_identidad}</p>
              </td>
              <td className="py-2 pr-3 text-slate-700">{asistente.tipo_ticket.nombre}</td>
              <td className="py-2 pr-3 text-slate-700">
                {formatearMoneda(asistente.precio_pagado_cop)}
              </td>
              <td className="py-2 pr-3 text-slate-700">
                {asistente.promocion_aplicada_codigo ?? "—"}
              </td>
              <td className="py-2 pr-3">
                <DistintivoEstadoTicket estado={asistente.estado} />
              </td>
              <td className="py-2 pr-3 text-slate-700">
                {formatearFechaHora(asistente.emitido_en)}
              </td>
              <td className="py-2 pr-3 text-slate-700">
                {formatearFechaHora(asistente.validado_en)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Convierte el valor del desplegable en un estado del contrato.
 *
 * Solo los tres estados del vocabulario son válidos: cualquier otra cosa es
 * «Todos», que es la ausencia del filtro.
 */
function estadoDe(valor: string): FiltroEstado {
  return ESTADOS.find((estado) => estado === valor) ?? "";
}
