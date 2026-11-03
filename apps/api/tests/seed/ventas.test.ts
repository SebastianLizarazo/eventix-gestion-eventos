import { describe, expect, it } from "vitest";
import { crearPlan } from "../../src/seed/plan.js";
import { generarEventos, generarUsuarios } from "../../src/seed/generadores.js";
import { generarTickets, generarTransacciones } from "../../src/seed/ventas.js";
import { ESCALAS, SEMILLA_POR_DEFECTO } from "../../src/seed/volumenes.js";

/**
 * Tickets y transacciones del seed (tarea T5.2).
 *
 * El contrato de las ventas es la **coherencia**: lo que el plan cuenta tiene
 * que ser exactamente lo que el seed escribe. Un contador que no cuadra con
 * los tickets es peor que no tener contador, porque las consultas de reporting
 * (H7) lo darían por bueno.
 */

const ESCALA_DEV = ESCALAS.dev;

function planDePrueba() {
  return crearPlan({ semilla: SEMILLA_POR_DEFECTO, volumenes: ESCALA_DEV });
}

describe("T5.2 · tickets y transacciones", () => {
  it("genera un ticket y una transacción por cada ticket del plan", () => {
    const plan = planDePrueba();

    const tickets = [...generarTickets(plan)];
    const transacciones = [...generarTransacciones(plan)];

    expect(tickets).toHaveLength(ESCALA_DEV.tickets);
    expect(transacciones).toHaveLength(ESCALA_DEV.transacciones);
    expect(transacciones).toHaveLength(tickets.length);
  });

  it("cada ticket referencia un evento y un usuario que existen, con snapshot coherente", () => {
    const plan = planDePrueba();

    const eventos = new Map(generarEventos(plan).map((evento) => [evento._id, evento]));
    const usuarios = new Map(generarUsuarios(plan).map((usuario) => [usuario._id, usuario]));

    for (const ticket of generarTickets(plan)) {
      const evento = eventos.get(ticket.evento_id);
      const usuario = usuarios.get(ticket.comprado_por_usuario_id);

      expect(evento).toBeDefined();
      expect(usuario).toBeDefined();

      const tipo = evento?.tipos_ticket.find(
        (tipoTicket) => tipoTicket._id === ticket.snapshot_tipo_ticket.tipo_ticket_id,
      );

      expect(tipo).toBeDefined();
      expect(ticket.snapshot_tipo_ticket.nombre).toBe(tipo?.nombre);
      expect(ticket.snapshot_tipo_ticket.precio_cop).toBe(tipo?.precio_cop);

      expect(ticket.asistente_snapshot.usuario_id).toBe(usuario?._id);
      expect(ticket.asistente_snapshot.nombre).toBe(usuario?.nombre);
      expect(ticket.asistente_snapshot.email).toBe(usuario?.email);
    }
  });

  it("ningún tipo de ticket supera su aforo", () => {
    const plan = planDePrueba();

    for (const evento of generarEventos(plan)) {
      for (const tipo of evento.tipos_ticket) {
        expect(tipo.aforo_vendido).toBeLessThanOrEqual(tipo.aforo_total);
      }
    }
  });

  it("los contadores del evento cuadran con los tickets que se emiten", () => {
    const plan = planDePrueba();

    const vendidosPorEvento = new Map<string, number>();
    const vendidosPorTipo = new Map<string, number>();

    for (const ticket of generarTickets(plan)) {
      if (ticket.estado === "anulado") {
        continue;
      }

      vendidosPorEvento.set(ticket.evento_id, (vendidosPorEvento.get(ticket.evento_id) ?? 0) + 1);

      const clave = `${ticket.evento_id}:${ticket.snapshot_tipo_ticket.tipo_ticket_id}`;
      vendidosPorTipo.set(clave, (vendidosPorTipo.get(clave) ?? 0) + 1);
    }

    for (const evento of generarEventos(plan)) {
      expect(evento.metricas_evento?.tickets_vendidos_total).toBe(
        vendidosPorEvento.get(evento._id) ?? 0,
      );

      for (const tipo of evento.tipos_ticket) {
        expect(tipo.aforo_vendido).toBe(vendidosPorTipo.get(`${evento._id}:${tipo._id}`) ?? 0);
      }
    }
  });

  it("los ingresos del evento cuadran con las transacciones aprobadas", () => {
    const plan = planDePrueba();

    const eventoPorTicket = new Map<string, string>();
    const tickets = [...generarTickets(plan)];

    for (const ticket of tickets) {
      eventoPorTicket.set(ticket._id, ticket.evento_id);
    }

    const ingresosPorEvento = new Map<string, number>();

    for (const transaccion of generarTransacciones(plan)) {
      if (transaccion.estado !== "aprobada") {
        continue;
      }

      const eventoId = eventoPorTicket.get(transaccion.ticket_id) ?? "";

      ingresosPorEvento.set(
        eventoId,
        (ingresosPorEvento.get(eventoId) ?? 0) + transaccion.monto_cop,
      );
    }

    for (const evento of generarEventos(plan)) {
      expect(evento.metricas_evento?.ingresos_cop).toBe(ingresosPorEvento.get(evento._id) ?? 0);
    }
  });

  it("cada transacción referencia su ticket y el monto es lo que el ticket pagó", () => {
    const plan = planDePrueba();

    const tickets = new Map([...generarTickets(plan)].map((ticket) => [ticket._id, ticket]));

    for (const transaccion of generarTransacciones(plan)) {
      const ticket = tickets.get(transaccion.ticket_id);

      expect(ticket).toBeDefined();
      expect(transaccion.usuario_id).toBe(ticket?.comprado_por_usuario_id);

      if (transaccion.estado === "rechazada" || transaccion.estado === "anulada") {
        expect(transaccion.monto_cop).toBe(0);
        expect(ticket?.estado).toBe("anulado");
      } else {
        expect(transaccion.monto_cop).toBe(ticket?.precio_pagado_cop);
      }
    }
  });

  it("los usos de cada promoción cuadran con los tickets que la usaron", () => {
    const plan = planDePrueba();

    const usos = new Map<string, number>();

    for (const ticket of generarTickets(plan)) {
      if (ticket.promocion_aplicada_codigo) {
        const clave = `${ticket.evento_id}:${ticket.promocion_aplicada_codigo}`;
        usos.set(clave, (usos.get(clave) ?? 0) + 1);
      }
    }

    for (const evento of generarEventos(plan)) {
      for (const promocion of evento.promociones) {
        const usados = usos.get(`${evento._id}:${promocion.codigo}`) ?? 0;

        expect(promocion.usos_realizados).toBe(usados);
        expect(promocion.usos_realizados).toBeLessThanOrEqual(promocion.usos_maximos ?? 0);
      }
    }
  });

  it("las referencias de pasarela no se repiten entre las transacciones pendientes o aprobadas", () => {
    const plan = planDePrueba();

    const referencias = new Set<string>();

    for (const transaccion of generarTransacciones(plan)) {
      if (transaccion.estado !== "pendiente" && transaccion.estado !== "aprobada") {
        continue;
      }

      expect(referencias.has(transaccion.referencia_pasarela)).toBe(false);
      referencias.add(transaccion.referencia_pasarela);
    }
  });

  it("es determinista: dos corridas con la misma semilla emiten los mismos tickets", () => {
    const primero = [...generarTickets(planDePrueba())];
    const segundo = [...generarTickets(planDePrueba())];

    expect(segundo).toEqual(primero);
  });
});
