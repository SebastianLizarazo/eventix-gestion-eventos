import {
  ticketSchema,
  transaccionSchema,
  type Ticket,
  type Transaccion,
} from "../domain/schemas/index.js";
import { crearGenerador } from "./aleatorio.js";
import {
  datosTransaccion,
  datosUsuario,
  decidirTicket,
  idTicket,
  idTransaccion,
  type Plan,
} from "./plan.js";

/**
 * Emisión de las ventas del dataset: un ticket y una transacción por venta.
 *
 * El recorrido es **exactamente** el mismo que hizo el plan para contar (mismo
 * generador, mismo orden), así que el ticket que se escribe coincide con el
 * contador que se le sumó a su evento, a su tipo de ticket y a su promoción.
 *
 * La compra del seed es una compra ya resuelta: la transacción nasce
 * confirmada o rechazada, y el ticket nasce `usado`, `emitido` o `anulado`
 * según lo que pasó con el pago.
 */

const SEGUNDOS_POR_HORA = 3_600_000;

/** Genera los tickets del dataset. */
export function* generarTickets(plan: Plan): Generator<Ticket> {
  for (const evento of plan.eventos) {
    const generador = crearGenerador(plan.semilla, "tickets", evento.indice);

    for (let local = 0; local < evento.tickets; local += 1) {
      const decision = decidirTicket(generador, evento, local);
      const tipo = evento.tipos[decision.tipo];
      const usuario = datosUsuario(plan.semilla, decision.usuario, plan.nOrganizadores);

      if (!tipo) {
        throw new Error(`El evento ${evento.slug} no tiene el tipo de ticket ${decision.tipo}`);
      }

      yield ticketSchema.parse({
        _id: idTicket(plan.semilla, decision.global),
        codigo_qr: `EVX-${String(decision.global).padStart(9, "0")}`,
        estado: decision.estado_ticket,
        evento_id: evento.id,
        comprado_por_usuario_id: usuario.id,
        snapshot_tipo_ticket: {
          tipo_ticket_id: tipo.id,
          nombre: tipo.nombre,
          precio_cop: tipo.precio_cop,
        },
        asistente_snapshot: {
          usuario_id: usuario.id,
          nombre: usuario.nombre,
          documento_identidad: usuario.documento_identidad,
          email: usuario.email,
        },
        precio_pagado_cop: decision.precio_pagado,
        promocion_aplicada_codigo: decision.promocion?.codigo,
        transaccion_id: idTransaccion(plan.semilla, decision.global),
        emitido_en: decision.emitido_en,
        validado_en: decision.validado_en,
        validado_por_puerta: decision.validado_por_puerta,
        revalidaciones: decision.revalidaciones,
        _v: 0,
      });
    }
  }
}

/**
 * Genera las transacciones del dataset: una por ticket, con el mismo estado
 * que el ticket que la originó (una compra rechazada no deja ticket válido).
 */
export function* generarTransacciones(plan: Plan): Generator<Transaccion> {
  for (const evento of plan.eventos) {
    const generador = crearGenerador(plan.semilla, "tickets", evento.indice);

    for (let local = 0; local < evento.tickets; local += 1) {
      const decision = decidirTicket(generador, evento, local);
      const usuario = datosUsuario(plan.semilla, decision.usuario, plan.nOrganizadores);
      const datos = datosTransaccion(plan.semilla, decision);

      yield transaccionSchema.parse({
        _id: idTransaccion(plan.semilla, decision.global),
        usuario_id: usuario.id,
        ticket_id: idTicket(plan.semilla, decision.global),
        monto_cop: decision.monto,
        moneda: "COP",
        metodo_pago: datos.metodo_pago,
        pasarela: datos.pasarela,
        estado: decision.estado_transaccion,
        referencia_pasarela: datos.referencia_pasarela,
        creada_en: decision.emitido_en,
        confirmada_en:
          decision.estado_transaccion === "pendiente"
            ? undefined
            : new Date(decision.emitido_en.getTime() + SEGUNDOS_POR_HORA),
      });
    }
  }
}
