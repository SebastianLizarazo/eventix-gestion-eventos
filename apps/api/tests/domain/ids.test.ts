import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { ErrorIdInvalido } from "../../src/domain/errors.js";
import {
  esObjectIdValido,
  fromObjectId,
  optionalToObjectId,
  toObjectId,
  toObjectIds,
} from "../../src/domain/ids.js";

const ID_VALIDO = "66a800000000000000000001";

describe("toObjectId", () => {
  it("convierte un hexadecimal válido en ObjectId", () => {
    const oid = toObjectId(ID_VALIDO);

    expect(oid).toBeInstanceOf(ObjectId);
    expect(oid.toHexString()).toBe(ID_VALIDO);
  });

  it("normaliza el hexadecimal a minúsculas", () => {
    expect(toObjectId("66A800000000000000000001").toHexString()).toBe(ID_VALIDO);
  });

  it("lanza ErrorIdInvalido cuando el valor no es un ObjectId", () => {
    expect(() => toObjectId("no-es-objectid")).toThrow(ErrorIdInvalido);
  });

  it("lanza ErrorIdInvalido cuando el hexadecimal tiene longitud incorrecta", () => {
    expect(() => toObjectId("66a80000000000000000")).toThrow(ErrorIdInvalido);
  });
});

describe("fromObjectId", () => {
  it("devuelve el hexadecimal del ObjectId", () => {
    expect(fromObjectId(new ObjectId(ID_VALIDO))).toBe(ID_VALIDO);
  });
});

describe("esObjectIdValido", () => {
  it("acepta un hexadecimal de 24 caracteres", () => {
    expect(esObjectIdValido(ID_VALIDO)).toBe(true);
  });

  it("rechaza un valor que no es hexadecimal de 24 caracteres", () => {
    expect(esObjectIdValido("66a8zz00000000000000001")).toBe(false);
  });

  it("rechaza valores que no son cadenas", () => {
    expect(esObjectIdValido(undefined)).toBe(false);
    expect(esObjectIdValido(42)).toBe(false);
  });
});

describe("optionalToObjectId", () => {
  it("devuelve undefined cuando el id es null o undefined", () => {
    expect(optionalToObjectId(null)).toBeUndefined();
    expect(optionalToObjectId(undefined)).toBeUndefined();
  });

  it("convierte el id cuando viene informado", () => {
    expect(optionalToObjectId(ID_VALIDO)?.toHexString()).toBe(ID_VALIDO);
  });
});

describe("toObjectIds", () => {
  it("convierte una lista de ids", () => {
    const ids = toObjectIds([ID_VALIDO, "66b000000000000000000002"]);

    expect(ids).toHaveLength(2);
    expect(ids[0]?.toHexString()).toBe(ID_VALIDO);
    expect(ids[1]?.toHexString()).toBe("66b000000000000000000002");
  });
});
