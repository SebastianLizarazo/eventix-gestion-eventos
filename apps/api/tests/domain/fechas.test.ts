import { describe, expect, it } from "vitest";
import { parsearFechaIso } from "../../src/domain/fechas.js";
import { dateSchema } from "../../src/domain/schemas/common.js";

describe("parsearFechaIso", () => {
  it("interpreta un instante con zona Z", () => {
    const fecha = parsearFechaIso("2025-09-12T16:00:00Z");

    expect(fecha?.toISOString()).toBe("2025-09-12T16:00:00.000Z");
  });

  it("interpreta una fecha sin hora como medianoche UTC", () => {
    const fecha = parsearFechaIso("2025-09-12");

    expect(fecha?.toISOString()).toBe("2025-09-12T00:00:00.000Z");
  });

  it("acepta el separador de espacio", () => {
    const fecha = parsearFechaIso("2025-09-12 16:00:00Z");

    expect(fecha?.toISOString()).toBe("2025-09-12T16:00:00.000Z");
  });

  it("acepta milisegundos y los trunca a precisión de Date", () => {
    const fecha = parsearFechaIso("2025-09-12T16:00:00.123Z");

    expect(fecha?.toISOString()).toBe("2025-09-12T16:00:00.123Z");
  });

  it("aplica un offset con dos puntos", () => {
    const fecha = parsearFechaIso("2025-09-12T16:00:00+02:00");

    expect(fecha?.toISOString()).toBe("2025-09-12T14:00:00.000Z");
  });

  it("aplica un offset compacto", () => {
    const fecha = parsearFechaIso("2025-09-12T16:00:00+0200");

    expect(fecha?.toISOString()).toBe("2025-09-12T14:00:00.000Z");
  });

  it("interpreta una fecha sin zona como UTC, no como hora local del servidor", () => {
    const fecha = parsearFechaIso("2025-09-12T16:00");

    expect(fecha?.toISOString()).toBe("2025-09-12T16:00:00.000Z");
  });

  it("rechaza un día que no existe en el mes", () => {
    expect(parsearFechaIso("2025-02-30")).toBeNull();
  });

  it("rechaza el 29 de febrero en un año que no es bisiesto", () => {
    expect(parsearFechaIso("2025-02-29")).toBeNull();
  });

  it("acepta el 29 de febrero en un año bisiesto", () => {
    expect(parsearFechaIso("2024-02-29")?.toISOString()).toBe("2024-02-29T00:00:00.000Z");
  });

  it("rechaza un mes fuera de rango", () => {
    expect(parsearFechaIso("2025-13-01")).toBeNull();
  });

  it("rechaza una hora fuera de rango", () => {
    expect(parsearFechaIso("2025-09-12T25:00:00Z")).toBeNull();
  });

  it("rechaza un formato que no es ISO 8601", () => {
    expect(parsearFechaIso("12/09/2025")).toBeNull();
  });
});

describe("dateSchema", () => {
  it("normaliza una cadena ISO a Date", () => {
    const fecha = dateSchema.parse("2025-09-12T16:00:00Z");

    expect(fecha).toBeInstanceOf(Date);
    expect(fecha.toISOString()).toBe("2025-09-12T16:00:00.000Z");
  });

  it("rechaza una fecha de calendario inexistente en lugar de desplazarla", () => {
    const resultado = dateSchema.safeParse("2025-02-30");

    expect(resultado.success).toBe(false);
  });

  it("acepta un Date nativo", () => {
    const nativo = new Date("2025-09-12T16:00:00Z");

    expect(dateSchema.parse(nativo)).toEqual(nativo);
  });
});
