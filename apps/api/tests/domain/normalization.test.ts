import { describe, expect, it } from "vitest";
import { normalizeEmail, slugify } from "../../src/domain/normalization.js";

describe("normalizeEmail", () => {
  it("pasa el correo a minúsculas", () => {
    expect(normalizeEmail("Ana.Gomez@Example.COM")).toBe("anagomez@example.com");
  });

  it("elimina los puntos de la parte local", () => {
    expect(normalizeEmail("ana.gomez@example.com")).toBe("anagomez@example.com");
  });

  it("conserva los puntos del dominio", () => {
    expect(normalizeEmail("ana@mail.eventix.test")).toBe("ana@mail.eventix.test");
  });

  it("recorta espacios antes de normalizar", () => {
    expect(normalizeEmail("  ana.gomez@example.com  ")).toBe("anagomez@example.com");
  });

  it("no altera un valor sin arroba", () => {
    expect(normalizeEmail("ana")).toBe("ana");
  });
});

describe("slugify", () => {
  it("convierte un nombre en slug en minúsculas y separado por guiones", () => {
    expect(slugify("Rock al Parque 2025")).toBe("rock-al-parque-2025");
  });

  it("elimina los acentos", () => {
    expect(slugify("Festival Ñandú")).toBe("festival-nandu");
  });

  it("colapsa separadores repetidos y recorta los guiones de los extremos", () => {
    expect(slugify("  Evento   del  //  Año  ")).toBe("evento-del-ano");
  });

  it("devuelve cadena vacía cuando no hay caracteres alfanuméricos", () => {
    expect(slugify("!!!")).toBe("");
  });
});
