import { describe, expect, it } from "vitest";
import { lugarSchema } from "../../src/domain/schemas/lugares.js";
import { IDS } from "./fixtures.js";

const LUGAR_VALIDO = {
  _id: IDS.lugar,
  nombre: "Corferias - Pabellón 4",
  direccion: "Carrera 37 #24-67, Bogotá",
  ciudad: "Bogotá",
  pais: "CO",
  capacidad_total: 2500,
  geometria: {
    type: "Point",
    coordinates: [-74.09, 4.654],
  },
  salas: [
    { nombre: "Sala A", capacidad: 1500, piso: 1 },
    { nombre: "Sala B", capacidad: 800, piso: 1 },
    { nombre: "Streaming", capacidad: 5000, tipo: "virtual" },
  ],
  activo: true,
  creado_en: "2023-08-01T10:00:00Z",
};

describe("lugarSchema", () => {
  it("acepta el lugar de ejemplo del documento 04", () => {
    const lugar = lugarSchema.parse(LUGAR_VALIDO);

    expect(lugar.salas).toHaveLength(3);
    expect(lugar.geometria.coordinates[0]).toBe(-74.09);
  });

  it("normaliza el código de país a mayúsculas", () => {
    const lugar = lugarSchema.parse({ ...LUGAR_VALIDO, pais: "co" });

    expect(lugar.pais).toBe("CO");
  });

  it("rechaza un código de país que no es alfa-2", () => {
    expect(lugarSchema.safeParse({ ...LUGAR_VALIDO, pais: "COL" }).success).toBe(false);
  });

  it("rechaza un tipo de geometría distinto de Point", () => {
    const geometria = { ...LUGAR_VALIDO.geometria, type: "LineString" };

    expect(lugarSchema.safeParse({ ...LUGAR_VALIDO, geometria }).success).toBe(false);
  });

  it("rechaza una latitud fuera de rango", () => {
    const geometria = { type: "Point", coordinates: [-74.09, 91] };

    expect(lugarSchema.safeParse({ ...LUGAR_VALIDO, geometria }).success).toBe(false);
  });

  it("rechaza una longitud fuera de rango", () => {
    const geometria = { type: "Point", coordinates: [181, 4.654] };

    expect(lugarSchema.safeParse({ ...LUGAR_VALIDO, geometria }).success).toBe(false);
  });

  it("rechaza más de 10 salas embebidas", () => {
    const salas = Array.from({ length: 11 }, (_, indice) => ({
      nombre: `Sala ${indice}`,
      capacidad: 10,
    }));

    expect(lugarSchema.safeParse({ ...LUGAR_VALIDO, salas }).success).toBe(false);
  });

  it("rechaza una capacidad total negativa", () => {
    expect(lugarSchema.safeParse({ ...LUGAR_VALIDO, capacidad_total: -1 }).success).toBe(false);
  });

  it("rechaza una sala con capacidad negativa", () => {
    const salas = [{ nombre: "Sala A", capacidad: -10 }];

    expect(lugarSchema.safeParse({ ...LUGAR_VALIDO, salas }).success).toBe(false);
  });
});
