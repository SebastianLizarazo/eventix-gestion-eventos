import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useTickets } from "@/api/hooks";
import type { EstadoTicket, Ticket } from "@/api/tipos";
import { formatearFechaHora, formatearMoneda } from "@/formato/es-co";
import { ESTADOS_TICKET, ETIQUETA_ESTADO_TICKET } from "@/formato/vocabularios";
import { AvisoError, Campo, Cargando, Tarjeta } from "@/ui/piezas";
import { Paginacion, POR_PAGINA, Tabla, type ColumnaTabla } from "@/ui/tabla";
import { BOTON, BOTON_SECUNDARIO, CONTROL, filtrosDeQuery } from "./comun";

/**
 * Explorador de tickets: la tabla de solo lectura de `GET /api/tickets`.
 *
 * Cuatro decisiones que vienen del contrato y no de la pantalla:
 *
 * - **Los filtros son los del contrato y solo los del contrato.** El listado
 *   filtra por `estado`, `evento_id` y `usuario_id`, y nada más. **Ojo con
 *   `usuario_id`:** la API lo contrasta contra el **comprador** del ticket, no
 *   contra el asistente —el parámetro se llama como el del contrato, pero lo
 *   que acota es quién pagó—, y por eso el campo dice «Comprador».
 * - **«Todos» es la ausencia del parámetro.** La API lee `estado` como
 *   vocabulario cerrado y rechaza un valor vacío, así que un filtro sin valor
 *   no viaja nunca.
 * - **Escribir no consulta.** El formulario tiene un borrador y un filtro
 *   aplicado: los filtros viajan al pulsar «Filtrar», no al escribir.
 * - **La tabla muestra snapshots.** El tipo de ticket y el asistente son los
 *   que el ticket copió al emitirse, así que la pantalla no busca ni el evento
 *   ni el usuario para ponerles nombre.
 */

/** Los filtros de la colección de tickets: los del contrato. */
type FiltrosTicket = {
  estado: EstadoTicket | "";
  evento_id: string;
  usuario_id: string;
};

/** El estado inicial de los filtros: sin filtro, que es la ausencia. */
const FILTROS_INICIALES: FiltrosTicket = {
  estado: "",
  evento_id: "",
  usuario_id: "",
};

/**
 * Las columnas de la tabla de tickets.
 *
 * La promoción y los identificadores se muestran crudos: el código de la
 * promoción es el que el usuario puede escribir en la caja, y los
 * identificadores son los que la API entiende.
 */
const COLUMNAS: ColumnaTabla<Ticket>[] = [
  {
    titulo: "Código QR",
    render: (ticket) => (
      <span className="font-mono text-xs text-slate-600">{ticket.codigo_qr}</span>
    ),
  },
  { titulo: "Estado", render: (ticket) => ETIQUETA_ESTADO_TICKET[ticket.estado] },
  { titulo: "Tipo", render: (ticket) => ticket.snapshot_tipo_ticket.nombre },
  { titulo: "Asistente", render: (ticket) => ticket.asistente_snapshot.nombre },
  {
    titulo: "Precio pagado",
    render: (ticket) => formatearMoneda(ticket.precio_pagado_cop),
  },
  {
    titulo: "Promoción",
    render: (ticket) => ticket.promocion_aplicada_codigo ?? "—",
  },
  { titulo: "Emitido", render: (ticket) => formatearFechaHora(ticket.emitido_en) },
  {
    titulo: "Evento",
    render: (ticket) => (
      <span className="font-mono text-xs text-slate-600">{ticket.evento_id}</span>
    ),
  },
];

/** Explorador de tickets: la tabla de solo lectura de la colección. */
export function ExploradorTickets() {
  // Lo que el usuario está escribiendo, que todavía no se ha aplicado.
  const [borrador, setBorrador] = useState<FiltrosTicket>(FILTROS_INICIALES);
  // Lo que la API tiene que responder.
  const [aplicados, setAplicados] = useState<FiltrosTicket>(FILTROS_INICIALES);
  // La página a la vista, contada desde cero.
  const [pagina, setPagina] = useState(0);

  const filtros = useMemo(() => filtrosDeQuery(aplicados), [aplicados]);

  const tickets = useTickets({
    ...filtros,
    skip: pagina * POR_PAGINA,
    limit: POR_PAGINA,
  });

  const filas = tickets.data?.items ?? [];
  const total = tickets.data?.total ?? null;
  // Sin total no se sabe cuántas páginas hay: la paginación llega hasta que la
  // página viene incompleta, que es la única señal que hay.
  const paginas = total === null ? null : Math.max(1, Math.ceil(total / POR_PAGINA));

  /** Cambia el estado del borrador: todavía no consulta nada. */
  function cambiarEstado(evento: ChangeEvent<HTMLSelectElement>): void {
    setBorrador((actual) => ({ ...actual, estado: estadoDe(evento.target.value) }));
  }

  /** Cambia el evento del borrador: todavía no consulta nada. */
  function cambiarEvento(evento: ChangeEvent<HTMLInputElement>): void {
    setBorrador((actual) => ({ ...actual, evento_id: evento.target.value }));
  }

  /** Cambia el usuario del borrador: todavía no consulta nada. */
  function cambiarUsuario(evento: ChangeEvent<HTMLInputElement>): void {
    setBorrador((actual) => ({ ...actual, usuario_id: evento.target.value }));
  }

  /** Aplica el borrador y vuelve a la primera página. */
  function aplicar(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();

    setAplicados({ ...borrador });
    setPagina(0);
  }

  /** Vuelve al estado inicial: sin filtros y en la primera página. */
  function limpiar(): void {
    setBorrador({ ...FILTROS_INICIALES });
    setAplicados({ ...FILTROS_INICIALES });
    setPagina(0);
  }

  return (
    <div className="space-y-6">
      <Tarjeta
        titulo="Filtros"
        descripcion="Los filtros son los del contrato: el listado solo admite estado, evento y comprador."
      >
        <form onSubmit={aplicar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo id="tickets-estado" etiqueta="Estado">
              <select
                id="tickets-estado"
                value={borrador.estado}
                onChange={cambiarEstado}
                className={CONTROL}
              >
                <option value="">Todos</option>
                {ESTADOS_TICKET.map((estado) => (
                  <option key={estado} value={estado}>
                    {ETIQUETA_ESTADO_TICKET[estado]}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo id="tickets-evento" etiqueta="Evento">
              <input
                id="tickets-evento"
                type="text"
                value={borrador.evento_id}
                onChange={cambiarEvento}
                className={CONTROL}
                placeholder="65a0000000000000000000a1"
              />
            </Campo>

            <Campo id="tickets-usuario" etiqueta="Comprador">
              <input
                id="tickets-usuario"
                type="text"
                value={borrador.usuario_id}
                onChange={cambiarUsuario}
                className={CONTROL}
                placeholder="65a0000000000000000000b1"
              />
            </Campo>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className={BOTON}>
              Filtrar
            </button>
            <button type="button" onClick={limpiar} className={BOTON_SECUNDARIO}>
              Limpiar
            </button>
          </div>
        </form>
      </Tarjeta>

      {tickets.isPending ? (
        <Tarjeta titulo="Tickets">
          <Cargando />
        </Tarjeta>
      ) : tickets.isError ? (
        <Tarjeta titulo="Tickets">
          <AvisoError error={tickets.error} />
        </Tarjeta>
      ) : (
        <>
          <Tabla
            titulo="Tickets"
            descripcion="Los tickets que cumplen los filtros aplicados."
            columnas={COLUMNAS}
            filas={filas}
            clave={(ticket) => ticket._id}
            vacio="No hay tickets que cumplan los filtros"
          />

          <Paginacion
            etiqueta="tickets"
            pagina={pagina}
            paginas={paginas}
            total={total}
            filas={filas.length}
            onCambio={setPagina}
          />
        </>
      )}
    </div>
  );
}

/**
 * Convierte el valor del desplegable en un estado de ticket del contrato.
 *
 * Solo los tres estados del vocabulario son válidos: cualquier otra cosa es
 * «Todos», que es la ausencia del filtro.
 */
function estadoDe(valor: string): EstadoTicket | "" {
  return ESTADOS_TICKET.find((estado) => estado === valor) ?? "";
}
