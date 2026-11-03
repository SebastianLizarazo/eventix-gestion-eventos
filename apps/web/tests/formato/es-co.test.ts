import { describe, expect, it } from "vitest";
import {
  aCampoFechaHora,
  aIsoUtcDesdeCampo,
  formatearFecha,
  formatearFechaHora,
  formatearMoneda,
  formatearNumero,
  formatearPorcentaje,
} from "../../src/formato/es-co";

/**
 * Los formateadores son el contrato visible del locale.
 *
 * Las fechas se formatean en UTC a propósito: la API guarda y devuelve las
 * fechas en UTC, así que formatear en otra zona movería los eventos de día
 * (un evento del 15 de marzo a las 00:00 se vería el 14 de marzo).
 */
describe("formateadores es-CO", () => {
  it("muestra la fecha en formato dd/mm/aaaa", () => {
    expect(formatearFecha("2026-03-15T00:00:00.000Z")).toBe("15/03/2026");
  });

  it("muestra la fecha y la hora en formato dd/mm/aaaa hh:mm", () => {
    expect(formatearFechaHora("2026-03-15T14:30:00.000Z")).toBe("15/03/2026 14:30");
  });

  it("agrupa los miles con punto", () => {
    expect(formatearNumero(120000)).toBe("120.000");
  });

  it("muestra los importes en pesos colombianos", () => {
    expect(formatearMoneda(120000)).toBe("COP 120.000");
  });

  it("muestra los porcentajes con su unidad", () => {
    expect(formatearPorcentaje(45)).toBe("45 %");
  });

  it("degrada con un guion cuando el valor no existe o no es válido", () => {
    expect(formatearFecha(null)).toBe("—");
    expect(formatearFecha("no-es-fecha")).toBe("—");
    expect(formatearMoneda(Number.NaN)).toBe("—");
    expect(formatearPorcentaje(null)).toBe("—");
  });

  it("convierte el valor de un campo de fecha y hora en un instante ISO UTC", () => {
    expect(aIsoUtcDesdeCampo("2026-03-15T14:30")).toBe("2026-03-15T14:30:00.000Z");
    expect(aIsoUtcDesdeCampo("2026-03-15T14:30:45")).toBe("2026-03-15T14:30:45.000Z");
  });

  it("rechaza un valor de campo de fecha y hora que no es válido", () => {
    expect(aIsoUtcDesdeCampo("")).toBeNull();
    expect(aIsoUtcDesdeCampo("15/03/2026")).toBeNull();
    expect(aIsoUtcDesdeCampo("2026-03-15T25:00")).toBeNull();
  });

  it("convierte un instante ISO en el valor de un campo de fecha y hora", () => {
    expect(aCampoFechaHora("2026-03-15T14:30:00.000Z")).toBe("2026-03-15T14:30");
    expect(aCampoFechaHora(null)).toBe("");
    expect(aCampoFechaHora("no-es-fecha")).toBe("");
  });
});
