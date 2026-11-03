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

/**
 * Formateo de los valores propios del reporting.
 *
 * Los reportes traen tres cosas que el resto de la interfaz no formatea: el
 * **día** del cierre contable (una fecha de calendario, sin hora ni zona), el
 * **porcentaje** de ocupación (que la API calcula con dos decimales) y el
 * **neto** contable (que puede ser negativo, porque un día con más
 * devoluciones que cobros cierra en rojo).
 */
describe("formateo de los valores de los reportes", () => {
  it("muestra el día del cierre contable como fecha de calendario", () => {
    expect(formatearFecha("2023-05-14")).toBe("14/05/2023");
    expect(formatearFecha("2023-07-01")).toBe("01/07/2023");
  });

  it("muestra la ocupación con sus decimales", () => {
    // En `es-CO` el separador decimal es la coma: la ocupación del 26.67 % se
    // lee "26,67 %".
    expect(formatearPorcentaje(26.67)).toBe("26,67 %");
    expect(formatearPorcentaje(75)).toBe("75 %");
    expect(formatearPorcentaje(0)).toBe("0 %");
  });

  it("muestra el neto contable en rojo cuando es negativo", () => {
    expect(formatearMoneda(-30000)).toBe("COP -30.000");
    expect(formatearMoneda(150000)).toBe("COP 150.000");
  });
});
