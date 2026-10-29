import { describe, expect, it } from "vitest";
import { Checksum, canonizar } from "../../src/seed/checksum.js";

/**
 * Checksum del dataset (tarea T5.3).
 *
 * El checksum es la **evidencia de reproducibilidad** del seed: dos corridas
 * con la misma semilla tienen que producir el mismo checksum, y el seed lo
 * imprime para que cualquiera pueda comprobarlo.
 */

describe("T5.3 · checksum del dataset", () => {
  it("no depende del orden de las claves", () => {
    expect(canonizar({ b: 1, a: 2 })).toBe(canonizar({ a: 2, b: 1 }));
  });

  it("normaliza las fechas a ISO y deja fuera los valores indefinidos", () => {
    expect(canonizar({ fecha: new Date("2023-05-04T10:00:00.000Z"), ausente: undefined })).toBe(
      '{"fecha":"2023-05-04T10:00:00.000Z"}',
    );
  });

  it("mantiene el orden de los arreglos", () => {
    expect(canonizar([1, 2, 3])).not.toBe(canonizar([3, 2, 1]));
  });

  it("el checksum cambia si cambia un valor del documento", () => {
    const primero = new Checksum();
    primero.agregar({ _id: "a", monto: 100 });
    primero.agregar({ _id: "b", monto: 200 });

    const segundo = new Checksum();
    segundo.agregar({ _id: "a", monto: 100 });
    segundo.agregar({ _id: "b", monto: 201 });

    expect(primero.finalizar()).not.toBe(segundo.finalizar());
  });

  it("el checksum es el mismo si los documentos llegan en otro orden de claves", () => {
    const primero = new Checksum();
    primero.agregar({ _id: "a", monto: 100, pasarela: "demo" });

    const segundo = new Checksum();
    segundo.agregar({ pasarela: "demo", monto: 100, _id: "a" });

    expect(primero.finalizar()).toBe(segundo.finalizar());
  });
});
