import { describe, expect, it } from "vitest";
import { auditoriaSchema } from "../../src/domain/schemas/auditoria-eventos.js";
import { eventoSchema } from "../../src/domain/schemas/eventos.js";
import { lugarSchema } from "../../src/domain/schemas/lugares.js";
import { ticketSchema } from "../../src/domain/schemas/tickets.js";
import { transaccionSchema } from "../../src/domain/schemas/transacciones.js";
import { usuarioSchema } from "../../src/domain/schemas/usuarios.js";
import { DOCUMENTOS_EJEMPLO } from "./documentos-ejemplo.js";

/**
 * Los seis documentos representativos del documento 04 §3, con los ObjectId
 * truncados del documento sustituidos por hexadecimales completos.
 * Criterio de aceptación de S4: los documentos de ejemplo validan sin error.
 */
describe("documentos de ejemplo del documento 04", () => {
  it("usuarios", () => {
    const usuario = usuarioSchema.parse(DOCUMENTOS_EJEMPLO.usuarios);

    expect(usuario.email_normalizado).toBe("anagomez@example.com");
  });

  it("lugares", () => {
    const lugar = lugarSchema.parse(DOCUMENTOS_EJEMPLO.lugares);

    expect(lugar.salas).toHaveLength(3);
  });

  it("eventos", () => {
    const evento = eventoSchema.parse(DOCUMENTOS_EJEMPLO.eventos);

    expect(evento.tipos_ticket).toHaveLength(2);
    expect(evento.promociones[0]?.codigo).toBe("EARLY2025");
  });

  it("tickets", () => {
    const ticket = ticketSchema.parse(DOCUMENTOS_EJEMPLO.tickets);

    expect(ticket.codigo_qr).toBe("QR-RK25-AB12CD34");
  });

  it("transacciones", () => {
    const transaccion = transaccionSchema.parse(DOCUMENTOS_EJEMPLO.transacciones);

    expect(transaccion.referencia_pasarela).toBe("TXN-MOCK-987654");
  });

  it("auditoria_eventos", () => {
    const auditoria = auditoriaSchema.parse(DOCUMENTOS_EJEMPLO.auditoria_eventos);

    expect(auditoria.sujeto_tipo).toBe("ticket");
  });
});
