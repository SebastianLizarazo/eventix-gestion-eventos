import { describe, expect, it } from "vitest";
import {
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
});
