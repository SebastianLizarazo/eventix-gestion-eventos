import { describe, expect, it } from "vitest";
import { percentil, resumir } from "../../src/reporting/medir.js";

/**
 * T7.3 · resumen de la medición de latencia.
 *
 * El resumen es la evidencia del criterio de 2 s, así que la cuenta tiene que
 * ser correcta: un percentil mal calculado reportaría un latency que nadie
 * midió.
 */

describe("T7.3 · percentil por rango más cercano", () => {
  it("toma el valor central en la mediana", () => {
    expect(percentil([10, 20, 30, 40, 50], 50)).toBe(30);
  });

  it("con veinte muestras, el p95 es la segunda más lenta", () => {
    const tiempos = Array.from({ length: 20 }, (_, indice) => indice + 1);

    expect(percentil(tiempos, 95)).toBe(19);
    expect(percentil(tiempos, 50)).toBe(10);
  });

  it("devuelve cero cuando no hay valores", () => {
    expect(percentil([], 95)).toBe(0);
  });

  it("no depende del orden de entrada", () => {
    expect(percentil([50, 10, 30, 20, 40], 50)).toBe(30);
  });
});

describe("T7.3 · resumen de una medición", () => {
  it("resume mínimo, mediana, p95 y máximo", () => {
    const resumen = resumir(
      "Cierre contable",
      "/api/reportes/cierre-contable",
      [120, 100, 110, 130, 105],
    );

    expect(resumen.nombre).toBe("Cierre contable");
    expect(resumen.iteraciones).toBe(5);
    expect(resumen.min_ms).toBe(100);
    expect(resumen.p50_ms).toBe(110);
    expect(resumen.max_ms).toBe(130);
  });

  it("redondea a dos decimales", () => {
    const resumen = resumir("Dashboard", "/api/reportes/x", [10.123456, 20.987654]);

    expect(resumen.min_ms).toBe(10.12);
    expect(resumen.max_ms).toBe(20.99);
  });
});
