import { describe, expect, it } from "vitest";
import { auditoriaSchema } from "../../src/domain/schemas/auditoria-eventos.js";
import { IDS } from "./fixtures.js";

const AUDITORIA_VALIDA = {
  _id: IDS.auditoria,
  actor_id: IDS.usuario,
  actor_rol: "organizador",
  accion: "ticket.emitido",
  sujeto_tipo: "ticket",
  sujeto_id: IDS.ticket,
  metadata: {
    evento_id: IDS.evento,
    ip: "190.24.1.10",
    user_agent: "Mozilla/5.0",
    monto_cop: 90000,
  },
  ocurrido_en: "2025-02-15T11:24:00Z",
};

describe("auditoriaSchema", () => {
  it("acepta la auditoría de ejemplo del documento 04", () => {
    const auditoria = auditoriaSchema.parse(AUDITORIA_VALIDA);

    expect(auditoria.accion).toBe("ticket.emitido");
    expect(auditoria.metadata["monto_cop"]).toBe(90000);
  });

  it("rechaza una acción con mayúsculas o espacios", () => {
    expect(
      auditoriaSchema.safeParse({ ...AUDITORIA_VALIDA, accion: "Ticket Emitido" }).success,
    ).toBe(false);
  });

  it("rechaza un sujeto_tipo fuera del catálogo", () => {
    expect(auditoriaSchema.safeParse({ ...AUDITORIA_VALIDA, sujeto_tipo: "sede" }).success).toBe(
      false,
    );
  });

  it("rechaza un actor_rol fuera del catálogo", () => {
    expect(auditoriaSchema.safeParse({ ...AUDITORIA_VALIDA, actor_rol: "root" }).success).toBe(
      false,
    );
  });

  it("acepta el rol sistema para las entradas escritas fuera del camino crítico", () => {
    expect(auditoriaSchema.safeParse({ ...AUDITORIA_VALIDA, actor_rol: "sistema" }).success).toBe(
      true,
    );
  });

  it("admite metadata libre (flexibilidad de esquema, NFR-04)", () => {
    const auditoria = auditoriaSchema.parse({
      ...AUDITORIA_VALIDA,
      metadata: { campo_nuevo: { anidado: true } },
    });

    expect(auditoria.metadata["campo_nuevo"]).toEqual({ anidado: true });
  });

  it("rechaza un actor_id que no es un ObjectId", () => {
    expect(auditoriaSchema.safeParse({ ...AUDITORIA_VALIDA, actor_id: "abc" }).success).toBe(false);
  });

  it("acepta una acción con guiones", () => {
    expect(
      auditoriaSchema.safeParse({ ...AUDITORIA_VALIDA, accion: "ticket.re-emitido" }).success,
    ).toBe(true);
  });
});
