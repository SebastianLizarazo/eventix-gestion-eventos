import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useCompra, useEvento } from "@/api/hooks";
import { diagnosticoDeCompra } from "@/api/motivos-compra";
import type { Compra as ResultadoCompra, CompraEntrada, MetodoPago, TipoTicket } from "@/api/tipos";
import {
  formatearFecha,
  formatearFechaHora,
  formatearMoneda,
  formatearNumero,
} from "@/formato/es-co";
import { ETIQUETA_ESTADO_CONTABLE, ETIQUETA_METODO_PAGO } from "@/formato/vocabularios";
import { DistintivoEstado, DistintivoEstadoTicket } from "@/ui/distintivos";
import { AvisoError, Cargando, Dato, Tarjeta, Vacio } from "@/ui/piezas";
import { SelectorEvento } from "@/ui/selector-evento";
import { SelectorUsuario } from "@/ui/selector-usuario";

/**
 * Pantalla de compra: el flujo crítico del sistema, de punta a punta.
 *
 * La compra es la **transacción multi-documento** del proyecto (NFR-05): emite
 * el ticket, cobra el cargo y reserva el cupo del tipo de ticket, o no hace
 * ninguna de las tres cosas. Esta pantalla es la que lo muestra, y muestra
 * también cómo falla: cada motivo de rechazo tiene su propio código, y la
 * interfaz decide por código (spec S6), nunca leyendo el mensaje.
 *
 * Tres decisiones que conviene tener presentes:
 *
 * - **El comprador y el asistente son dos personas.** Quien paga puede
 *   comprarle la entrada a otra persona, y los datos del asistente se copian
 *   al snapshot del ticket. Por defecto asiste quien paga, y la casilla abre
 *   la posibilidad de que sean dos.
 * - **La referencia la genera la interfaz y se puede repetir.** Es la clave de
 *   idempotencia: mandarla otra vez devuelve el mismo ticket sin cobrar dos
 *   veces, y ese reintento es la demostración del requisito.
 * - **El evento viaja en la ruta.** La pantalla se puede abrir con el evento
 *   ya elegido (`/compra?evento=…`), que es lo que hace el botón "Comprar"
 *   de la ficha.
 */

/** Los métodos de pago que la API acepta: el vocabulario es cerrado. */
const METODOS_PAGO: MetodoPago[] = [
  "tarjeta_credito",
  "tarjeta_debito",
  "efectivo",
  "transferencia",
];

/** La pasarela de la demo: no hay pasarela de pago real. */
const PASARELA_DEMO = "demo";

/** Pantalla de compra. */
export function Compra() {
  const [parametros, setParametros] = useSearchParams();
  // El evento puede venir en la ruta: el botón "Comprar" de la ficha lo manda.
  const eventoId = parametros.get("evento");

  const evento = useEvento(eventoId);
  const comprar = useCompra();

  const [tipoTicketId, setTipoTicketId] = useState<string | null>(null);
  const [compradorId, setCompradorId] = useState<string | null>(null);
  const [asistenteId, setAsistenteId] = useState<string | null>(null);
  const [asistenteEsComprador, setAsistenteEsComprador] = useState(true);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("tarjeta_credito");
  const [pasarela, setPasarela] = useState(PASARELA_DEMO);
  const [referencia, setReferencia] = useState<string>(generarReferencia);
  const [promocionCodigo, setPromocionCodigo] = useState("");

  /** El cuerpo de la última compra mandada: es el que el reintento repite. */
  const [cuerpo, setCuerpo] = useState<CompraEntrada | null>(null);
  /** La última compra aceptada: se queda en pantalla aunque se reintente. */
  const [resultado, setResultado] = useState<ResultadoCompra | null>(null);

  const tipos = evento.data?.tipos_ticket ?? [];
  // El tipo elegido tiene que ser **de este evento**: si el evento cambia, el
  // tipo anterior deja de estar en la lista y el que se muestra es ninguno.
  const tipoElegido = tipos.find((tipo) => tipo._id === tipoTicketId) ?? null;
  const asistenteEfectivo = asistenteEsComprador ? compradorId : asistenteId;

  const compra = cuerpoDe();
  const listo = compra !== null;
  const ventana = ventanaDeVenta(tipoElegido);

  /** El cuerpo de la compra, o `null` si todavía falta algo. */
  function cuerpoDe(): CompraEntrada | null {
    if (
      eventoId === null ||
      tipoElegido === null ||
      compradorId === null ||
      asistenteEfectivo === null
    ) {
      return null;
    }

    if (pasarela.trim() === "" || referencia.trim() === "") {
      return null;
    }

    return {
      evento_id: eventoId,
      tipo_ticket_id: tipoElegido._id,
      usuario_id: compradorId,
      asistente_id: asistenteEfectivo,
      metodo_pago: metodoPago,
      pasarela: pasarela.trim(),
      referencia_pasarela: referencia.trim(),
      ...(promocionCodigo.trim() === "" ? {} : { promocion_codigo: promocionCodigo.trim() }),
    };
  }

  /** Elige el evento y lo deja en la ruta. */
  function elegirEvento(id: string) {
    setParametros((anterior) => {
      const nuevos = new URLSearchParams(anterior);

      nuevos.set("evento", id);

      return nuevos;
    });
  }

  /** Manda la compra. */
  function enviar(formulario: FormEvent<HTMLFormElement>) {
    formulario.preventDefault();

    if (compra === null) {
      return;
    }

    setCuerpo(compra);
    comprar.mutate(compra, { onSuccess: (aceptada) => setResultado(aceptada) });
  }

  /**
   * Reintenta la compra con **la misma referencia**.
   *
   * Es la demostración de la idempotencia: el mismo cuerpo, la misma
   * referencia y la misma respuesta —el mismo ticket—, sin cobrar dos veces.
   */
  function reintentar() {
    if (cuerpo === null) {
      return;
    }

    comprar.mutate(cuerpo, { onSuccess: (aceptada) => setResultado(aceptada) });
  }

  const diagnostico = diagnosticoDeCompra(comprar.error);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">Comprar un ticket</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          La compra es el flujo crítico del sistema: una transacción que emite el ticket, cobra el
          cargo y reserva el cupo del tipo de ticket, o no hace ninguna de las tres cosas.
        </p>
      </header>

      <Tarjeta titulo="El evento" descripcion="El evento del que se compra el ticket.">
        <SelectorEvento
          eventoId={eventoId}
          nombreElegido={evento.data?.nombre ?? null}
          onChange={elegirEvento}
        />

        {evento.isPending ? <Cargando texto="Cargando el evento…" /> : null}

        {evento.isError ? <AvisoError error={evento.error} /> : null}

        {evento.data ? (
          <div className="mt-4 space-y-2">
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              Evento: <span className="font-medium text-slate-900">{evento.data.nombre}</span>
              <span>·</span>
              <span>{formatearFechaHora(evento.data.fecha_inicio)}</span>
              <DistintivoEstado estado={evento.data.estado} />
            </p>

            {evento.data.estado !== "publicado" ? (
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                Este evento no está publicado: la API rechazará la compra con el motivo
                <span className="font-mono"> evento_no_vendible</span>.
              </p>
            ) : null}
          </div>
        ) : null}
      </Tarjeta>

      <Tarjeta
        titulo="El tipo de ticket"
        descripcion="Las formas de entrada del evento y lo que queda de cada una."
      >
        {tipos.length === 0 ? (
          <Vacio texto="Elige un evento con tipos de ticket" />
        ) : (
          <div className="space-y-1">
            <label htmlFor="tipo-ticket" className="block text-sm font-medium text-slate-700">
              Tipo de ticket
            </label>
            <select
              id="tipo-ticket"
              value={tipoElegido?._id ?? ""}
              onChange={(eventoFormulario) => setTipoTicketId(eventoFormulario.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
            >
              <option value="">Elige un tipo de ticket</option>
              {tipos.map((tipo) => (
                <option key={tipo._id} value={tipo._id}>
                  {`${tipo.nombre} — ${formatearMoneda(tipo.precio_cop)} — quedan ${formatearNumero(
                    tipo.aforo_total - tipo.aforo_vendido,
                  )}`}
                </option>
              ))}
            </select>

            {ventana ? (
              <p
                className={`mt-2 text-sm ${ventana.cerrada ? "text-amber-800" : "text-slate-600"}`}
              >
                {ventana.texto}
              </p>
            ) : null}
          </div>
        )}
      </Tarjeta>

      <Tarjeta
        titulo="Quién paga y quién asiste"
        descripcion="El comprador y el asistente son dos usuarios: se puede comprarle la entrada a otra persona."
      >
        <SelectorUsuario
          id="comprador"
          etiqueta="Comprador"
          usuarioId={compradorId}
          onChange={setCompradorId}
        />

        <div className="mt-4">
          <label
            htmlFor="asistente-es-comprador"
            className="flex items-center gap-2 text-sm font-medium text-slate-700"
          >
            <input
              id="asistente-es-comprador"
              type="checkbox"
              checked={asistenteEsComprador}
              onChange={(eventoFormulario) =>
                setAsistenteEsComprador(eventoFormulario.target.checked)
              }
            />
            El asistente es el comprador
          </label>
        </div>

        {!asistenteEsComprador ? (
          <div className="mt-4">
            <SelectorUsuario
              id="asistente"
              etiqueta="Asistente"
              usuarioId={asistenteId}
              onChange={setAsistenteId}
            />
          </div>
        ) : null}
      </Tarjeta>

      <form onSubmit={enviar} className="space-y-6">
        <Tarjeta
          titulo="El pago"
          descripcion="La referencia es la clave de idempotencia: repetirla devuelve el mismo ticket sin cobrar otra vez."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="metodo-pago" className="block text-sm font-medium text-slate-700">
                Método de pago
              </label>
              <select
                id="metodo-pago"
                value={metodoPago}
                onChange={(eventoFormulario) =>
                  setMetodoPago(eventoFormulario.target.value as MetodoPago)
                }
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
              >
                {METODOS_PAGO.map((metodo) => (
                  <option key={metodo} value={metodo}>
                    {ETIQUETA_METODO_PAGO[metodo]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="pasarela" className="block text-sm font-medium text-slate-700">
                Pasarela
              </label>
              <input
                id="pasarela"
                type="text"
                value={pasarela}
                onChange={(eventoFormulario) => setPasarela(eventoFormulario.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="referencia" className="block text-sm font-medium text-slate-700">
                Referencia de la pasarela
              </label>
              <input
                id="referencia"
                type="text"
                value={referencia}
                onChange={(eventoFormulario) => setReferencia(eventoFormulario.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={() => setReferencia(generarReferencia())}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              Generar otra referencia
            </button>
          </div>
        </Tarjeta>

        <Tarjeta
          titulo="Promoción"
          descripcion="El código de una promoción del evento, si la compra lleva una."
        >
          <div className="space-y-1">
            <label htmlFor="promocion-codigo" className="block text-sm font-medium text-slate-700">
              Código de promoción
            </label>
            <input
              id="promocion-codigo"
              type="text"
              value={promocionCodigo}
              onChange={(eventoFormulario) => setPromocionCodigo(eventoFormulario.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
              placeholder="VERANO10"
            />
          </div>

          {evento.data && evento.data.promociones.length > 0 ? (
            <div className="mt-3">
              <p className="text-sm text-slate-600">Promociones del evento:</p>
              <ul className="mt-2 space-y-2">
                {evento.data.promociones.map((promocion) => {
                  const tiposDeLaPromocion = tipos.filter((tipo) =>
                    promocion.aplica_a_tipo_ticket_ids.includes(tipo._id),
                  );
                  const aplicaAlElegido =
                    tipoElegido !== null &&
                    promocion.aplica_a_tipo_ticket_ids.includes(tipoElegido._id);

                  return (
                    <li key={promocion.codigo} className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPromocionCodigo(promocion.codigo)}
                        className="rounded-md border border-slate-300 px-2 py-1 font-mono text-xs text-slate-700 hover:bg-slate-100"
                      >
                        {promocion.codigo}
                      </button>

                      {/*
                        Una promoción declara a qué tipos de ticket aplica, y
                        esa lista **vacía no significa "a todos"**: la API
                        rechaza la que no incluye al tipo comprado. La
                        pantalla lo dice, para que el rechazo no sorprenda.
                      */}
                      <span className="text-xs text-slate-500">
                        {tiposDeLaPromocion.length === 0
                          ? "no aplica a ningún tipo de ticket"
                          : `aplica a ${tiposDeLaPromocion.map((tipo) => tipo.nombre).join(", ")}`}
                      </span>

                      {tipoElegido !== null && !aplicaAlElegido ? (
                        <span className="text-xs text-amber-700">
                          {`no aplica a ${tipoElegido.nombre}`}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </Tarjeta>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!listo || comprar.isPending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {comprar.isPending ? "Comprando…" : "Comprar el ticket"}
          </button>

          {!listo ? (
            <p className="text-sm text-slate-500">
              Elige el evento, el tipo de ticket y quién paga para comprar.
            </p>
          ) : null}
        </div>
      </form>

      {comprar.isError ? <AvisoError error={comprar.error} titulo={diagnostico?.titulo} /> : null}

      {resultado ? (
        <Tarjeta
          titulo="Ticket emitido"
          descripcion="El ticket y su cargo: las dos mitades del mismo hecho."
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-slate-900 px-3 py-2 font-mono text-lg text-white">
              {resultado.ticket.codigo_qr}
            </span>
            <DistintivoEstadoTicket estado={resultado.ticket.estado} />
          </div>

          {resultado.idempotente ? (
            <p className="mt-3 rounded-md bg-sky-50 p-3 text-sm text-sky-900">
              Esta compra ya existía: la misma referencia devolvió el mismo ticket y no se cobró dos
              veces.
            </p>
          ) : null}

          <dl className="mt-4 divide-y divide-slate-100">
            <Dato etiqueta="Tipo de ticket" valor={resultado.ticket.snapshot_tipo_ticket.nombre} />
            <Dato
              etiqueta="Precio pagado"
              valor={formatearMoneda(resultado.ticket.precio_pagado_cop)}
            />
            <Dato
              etiqueta="Asistente"
              valor={`${resultado.ticket.asistente_snapshot.nombre} — ${resultado.ticket.asistente_snapshot.documento_identidad}`}
            />
            <Dato
              etiqueta="Correo del asistente"
              valor={resultado.ticket.asistente_snapshot.email}
            />
            <Dato etiqueta="Promoción" valor={resultado.promocion_codigo ?? "Sin promoción"} />
            <Dato
              etiqueta="Estado del cargo"
              valor={ETIQUETA_ESTADO_CONTABLE[resultado.transaccion.estado]}
            />
            <Dato
              etiqueta="Método de pago"
              valor={ETIQUETA_METODO_PAGO[resultado.transaccion.metodo_pago]}
            />
            <Dato etiqueta="Pasarela" valor={resultado.transaccion.pasarela} />
            <Dato
              etiqueta="Referencia"
              valor={
                <span className="font-mono text-xs">
                  {resultado.transaccion.referencia_pasarela}
                </span>
              }
            />
            <Dato
              etiqueta="Fecha de emisión"
              valor={formatearFechaHora(resultado.ticket.emitido_en)}
            />
          </dl>

          <div className="mt-4">
            <button
              type="button"
              onClick={reintentar}
              disabled={comprar.isPending}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reintentar con la misma referencia
            </button>
          </div>
        </Tarjeta>
      ) : null}
    </div>
  );
}

/**
 * La ventana de venta de un tipo de ticket.
 *
 * La API compara esa ventana con su propio reloj, y una ventana cerrada se
 * traduce en el motivo `venta_cerrada`. La pantalla la muestra **antes** de
 * comprar: el rechazo no debería ser una sorpresa, y más cuando el dataset es
 * una foto del pasado y todas sus ventanas ya están cerradas.
 */
function ventanaDeVenta(tipo: TipoTicket | null): { texto: string; cerrada: boolean } | null {
  if (tipo === null) {
    return null;
  }

  const inicio = tipo.restricciones.venta_inicio;
  const fin = tipo.restricciones.venta_fin;

  if (inicio === undefined && fin === undefined) {
    return {
      texto: "La venta de este tipo de ticket no tiene ventana: está abierta.",
      cerrada: false,
    };
  }

  const partes: string[] = [];

  if (inicio !== undefined) {
    partes.push(`abre el ${formatearFecha(inicio)}`);
  }

  if (fin !== undefined) {
    partes.push(`cierra el ${formatearFecha(fin)}`);
  }

  const cerrada = fin !== undefined && new Date(fin).getTime() < Date.now();

  return {
    texto: `Ventana de venta: ${partes.join(" · ")}.${
      cerrada ? " Ya se cerró: la API rechazará la compra con el motivo venta_cerrada." : ""
    }`,
    cerrada,
  };
}

/**
 * Genera una referencia de cargo.
 *
 * La referencia es la **clave de idempotencia**: la interfaz la genera y la
 * muestra, y repetirla es lo que demuestra que la API no cobra dos veces.
 */
function generarReferencia(): string {
  const marca = Date.now().toString(36).toUpperCase();
  const azar = Math.random().toString(36).slice(2, 8).toUpperCase();

  return `WEB-${marca}-${azar}`;
}
