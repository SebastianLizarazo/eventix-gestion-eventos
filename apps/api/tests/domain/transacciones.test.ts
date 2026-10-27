import { describe, expect, it } from "vitest";
import { transaccionSchema } from "../../src/domain/schemas/transacciones.js";
import { IDS } from "./fixtures.js";

const TRANSACCION_VALIDA = {
  _id: IDS.transaccion,
  usuario_id: IDS.usuario,
  ticket_id: IDS.ticket,
  monto_cop: 90000,
  moneda: "COP",
  metodo_pago: "tarjeta_credito",
  pasarela: "wompi_mock",
  estado: "aprobada",
  referencia_pasarela: "TXN-MOCK-987654",
  creada_en: "2025-02-15T11:24:00Z",
  confirmada_en: "2025-02-15T11:24:03Z",
};

describe("transaccionSchema", () => {
  it("acepta la transacción de ejemplo del documento 04", () => {
    const transaccion = transaccionSchema.parse(TRANSACCION_VALIDA);

    expect(transaccion.estado).toBe("aprobada");
    expect(transaccion.moneda).toBe("COP");
  });

  it("rechaza un monto negativo", () => {
    expect(transaccionSchema.safeParse({ ...TRANSACCION_VALIDA, monto_cop: -1 }).success).toBe(
      false,
    );
  });

  it("rechaza un estado fuera del catálogo", () => {
    expect(transaccionSchema.safeParse({ ...TRANSACCION_VALIDA, estado: "pagada" }).success).toBe(
      false,
    );
  });

  it("rechaza un método de pago fuera del catálogo", () => {
    expect(
      transaccionSchema.safeParse({ ...TRANSACCION_VALIDA, metodo_pago: "cripto" }).success,
    ).toBe(false);
  });

  it("exige la referencia de la pasarela", () => {
    const { referencia_pasarela: _referencia, ...sinReferencia } = TRANSACCION_VALIDA;

    expect(transaccionSchema.safeParse(sinReferencia).success).toBe(false);
  });

  it("usa COP como moneda por defecto", () => {
    const { moneda: _moneda, ...sinMoneda } = TRANSACCION_VALIDA;

    expect(transaccionSchema.parse(sinMoneda).moneda).toBe("COP");
  });

  it("rechaza una referencia de pasarela vacía", () => {
    expect(
      transaccionSchema.safeParse({ ...TRANSACCION_VALIDA, referencia_pasarela: "" }).success,
    ).toBe(false);
  });
});
