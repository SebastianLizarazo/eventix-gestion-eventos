import { describe, expect, it } from "vitest";
import { evaluarPromocion } from "../../src/services/promociones.js";
import { validar } from "../../src/domain/validar.js";
import { promocionSchema, type Promocion } from "../../src/domain/schemas/index.js";

/**
 * Motor de promociones (tarea T6.2): las reglas que decidan si una promoción
 * se aplica y cuánto paga el ticket.
 *
 * Son reglas puras: no tocan la base, así que se prueban sin ella.
 */

const TIPO = "66c200000000000000000004";
const OTRO_TIPO = "66c200000000000000000005";
const AHORA = new Date("2026-03-01T12:00:00Z");

/** Promoción válida con los valores por defecto de las pruebas. */
function promocion(overrides: Partial<Promocion> = {}): Promocion {
  return validar(
    promocionSchema,
    {
      codigo: "VERANO10",
      tipo: "porcentaje",
      valor: 10,
      aplica_a_tipo_ticket_ids: [TIPO],
      vigencia_inicio: new Date("2026-01-01T00:00:00Z"),
      vigencia_fin: new Date("2026-12-31T23:59:59Z"),
      usos_maximos: 100,
      usos_realizados: 0,
      activo: true,
      ...overrides,
    },
    "promoción",
  );
}

/** Contexto de la evaluación. */
function contexto(overrides: Partial<Parameters<typeof evaluarPromocion>[2]> = {}) {
  return {
    ahora: AHORA,
    precioBase: 100_000,
    tipoTicketId: TIPO,
    yaComproEsteTipo: async () => false,
    ...overrides,
  };
}

describe("evaluación de una promoción", () => {
  it("sin código no hay promoción y se paga el precio del tipo de ticket", async () => {
    const evaluacion = await evaluarPromocion([promocion()], undefined, contexto());

    expect(evaluacion.aplicada).toBe(false);
    expect(evaluacion.motivo).toBeNull();
    expect(evaluacion.precio).toBe(100_000);
  });

  it("aplica el descuento porcentual", async () => {
    const evaluacion = await evaluarPromocion([promocion()], "VERANO10", contexto());

    expect(evaluacion.aplicada).toBe(true);
    expect(evaluacion.promocion?.codigo).toBe("VERANO10");
    expect(evaluacion.precio).toBe(90_000);
  });

  it("el código se compara en mayúsculas", async () => {
    const evaluacion = await evaluarPromocion([promocion()], "verano10", contexto());

    expect(evaluacion.aplicada).toBe(true);
    expect(evaluacion.precio).toBe(90_000);
  });

  it("el early bird descuenta el mismo porcentaje que el descuento", async () => {
    const evaluacion = await evaluarPromocion(
      [promocion({ codigo: "EARLY", tipo: "early_bird", valor: 25 })],
      "EARLY",
      contexto(),
    );

    expect(evaluacion.aplicada).toBe(true);
    expect(evaluacion.precio).toBe(75_000);
  });

  it("falla cuando la promoción no existe", async () => {
    const evaluacion = await evaluarPromocion([promocion()], "NOEXISTE", contexto());

    expect(evaluacion.aplicada).toBe(false);
    expect(evaluacion.motivo).toBe("inexistente");
    expect(evaluacion.precio).toBe(100_000);
  });

  it("falla cuando la promoción no está activa", async () => {
    const evaluacion = await evaluarPromocion(
      [promocion({ activo: false })],
      "VERANO10",
      contexto(),
    );

    expect(evaluacion.aplicada).toBe(false);
    expect(evaluacion.motivo).toBe("inactiva");
  });

  it("falla cuando la promoción está fuera de su vigencia", async () => {
    const vencida = await evaluarPromocion(
      [
        promocion({
          vigencia_inicio: new Date("2026-02-01T00:00:00Z"),
          vigencia_fin: new Date("2026-02-28T23:59:59Z"),
        }),
      ],
      "VERANO10",
      contexto(),
    );

    const futura = await evaluarPromocion(
      [
        promocion({
          vigencia_inicio: new Date("2026-04-01T00:00:00Z"),
          vigencia_fin: new Date("2026-05-31T23:59:59Z"),
        }),
      ],
      "VERANO10",
      contexto(),
    );

    expect(vencida.motivo).toBe("fuera_de_vigencia");
    expect(futura.motivo).toBe("fuera_de_vigencia");
  });

  it("falla cuando la promoción agotó sus usos", async () => {
    const evaluacion = await evaluarPromocion(
      [promocion({ usos_maximos: 10, usos_realizados: 10 })],
      "VERANO10",
      contexto(),
    );

    expect(evaluacion.aplicada).toBe(false);
    expect(evaluacion.motivo).toBe("usos_agotados");
  });

  it("una promoción sin tope de usos nunca se agota", async () => {
    const evaluacion = await evaluarPromocion(
      [promocion({ usos_maximos: undefined, usos_realizados: 999 })],
      "VERANO10",
      contexto(),
    );

    expect(evaluacion.aplicada).toBe(true);
  });

  it("falla cuando la promoción no aplica al tipo de ticket comprado", async () => {
    const evaluacion = await evaluarPromocion(
      [promocion()],
      "VERANO10",
      contexto({ tipoTicketId: OTRO_TIPO }),
    );

    expect(evaluacion.aplicada).toBe(false);
    expect(evaluacion.motivo).toBe("no_aplica_al_tipo");
  });

  it("el 2x1 deja el ticket gratis cuando el comprador ya tiene uno del mismo tipo", async () => {
    const evaluacion = await evaluarPromocion(
      [promocion({ codigo: "DOBLE", tipo: "2x1", valor: 2 })],
      "DOBLE",
      contexto({ yaComproEsteTipo: async () => true }),
    );

    expect(evaluacion.aplicada).toBe(true);
    expect(evaluacion.precio).toBe(0);
  });

  it("el 2x1 no aplica al primer ticket del comprador", async () => {
    const evaluacion = await evaluarPromocion(
      [promocion({ codigo: "DOBLE", tipo: "2x1", valor: 2 })],
      "DOBLE",
      contexto({ yaComproEsteTipo: async () => false }),
    );

    expect(evaluacion.aplicada).toBe(false);
    expect(evaluacion.motivo).toBe("2x1_sin_ticket_previo");
  });
});
