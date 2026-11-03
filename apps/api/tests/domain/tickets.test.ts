import { describe, expect, it } from "vitest";
import { ticketSchema } from "../../src/domain/schemas/tickets.js";
import { IDS } from "./fixtures.js";

const TICKET_VALIDO = {
  _id: IDS.ticket,
  codigo_qr: "QR-RK25-AB12CD34",
  estado: "emitido",
  evento_id: IDS.evento,
  comprado_por_usuario_id: IDS.usuario,
  snapshot_tipo_ticket: {
    tipo_ticket_id: IDS.tipoTicket1,
    nombre: "General Día 1",
    precio_cop: 120000,
  },
  asistente_snapshot: {
    usuario_id: IDS.usuario,
    nombre: "Ana Gómez",
    documento_identidad: "1234567890",
    email: "ana.gomez@example.com",
  },
  precio_pagado_cop: 90000,
  promocion_aplicada_codigo: "EARLY2025",
  transaccion_id: IDS.transaccion,
  emitido_en: "2025-02-15T11:24:00Z",
  validado_en: null,
  validado_por_puerta: null,
  revalidaciones: [],
  _v: 1,
};

describe("ticketSchema", () => {
  it("acepta el ticket de ejemplo del documento 04", () => {
    const ticket = ticketSchema.parse(TICKET_VALIDO);

    expect(ticket.estado).toBe("emitido");
    expect(ticket.snapshot_tipo_ticket.precio_cop).toBe(120000);
  });

  it("acepta un código QR en minúsculas y lo normaliza a mayúsculas", () => {
    const ticket = ticketSchema.parse({ ...TICKET_VALIDO, codigo_qr: "qr-rk25-ab12cd34" });

    expect(ticket.codigo_qr).toBe("QR-RK25-AB12CD34");
  });

  it("rechaza un código QR con símbolos no permitidos", () => {
    expect(ticketSchema.safeParse({ ...TICKET_VALIDO, codigo_qr: "QR RK25" }).success).toBe(false);
  });

  it("rechaza un estado de ticket fuera del catálogo", () => {
    expect(ticketSchema.safeParse({ ...TICKET_VALIDO, estado: "vendido" }).success).toBe(false);
  });

  it("exige el snapshot del asistente", () => {
    const { asistente_snapshot: _snapshot, ...sinSnapshot } = TICKET_VALIDO;

    expect(ticketSchema.safeParse(sinSnapshot).success).toBe(false);
  });

  it("acepta validado_en y validado_por_puerta en null", () => {
    const ticket = ticketSchema.parse(TICKET_VALIDO);

    expect(ticket.validado_en).toBeNull();
    expect(ticket.validado_por_puerta).toBeNull();
  });

  it("rechaza un precio pagado negativo", () => {
    expect(ticketSchema.safeParse({ ...TICKET_VALIDO, precio_pagado_cop: -1 }).success).toBe(false);
  });

  it("rechaza un snapshot de tipo de ticket sin precio", () => {
    const snapshot = { ...TICKET_VALIDO.snapshot_tipo_ticket, precio_cop: undefined };

    expect(
      ticketSchema.safeParse({ ...TICKET_VALIDO, snapshot_tipo_ticket: snapshot }).success,
    ).toBe(false);
  });

  it("rechaza una revalidación sin fecha", () => {
    const revalidaciones = [{ puerta: "A", resultado: "aceptado" }];

    expect(ticketSchema.safeParse({ ...TICKET_VALIDO, revalidaciones }).success).toBe(false);
  });
});
