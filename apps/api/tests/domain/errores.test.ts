import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ErrorDominio, ErrorIdInvalido, ErrorValidacion } from "../../src/domain/errors.js";
import { validar } from "../../src/domain/validar.js";

describe("validar", () => {
  it("devuelve los datos parseados cuando el esquema es válido", () => {
    const datos = validar(z.object({ nombre: z.string() }), { nombre: "ok" });

    expect(datos).toEqual({ nombre: "ok" });
  });

  it("lanza ErrorValidacion cuando el esquema no se cumple", () => {
    expect(() => validar(z.object({ nombre: z.string() }), {})).toThrow(ErrorValidacion);
  });

  it("identifica cada campo culpable", () => {
    try {
      validar(z.object({ a: z.string(), b: z.number() }), { b: "texto" });
      expect.unreachable("la validación should've fallado");
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorValidacion);
      const campos = (error as ErrorValidacion).campos.map((campo) => campo.campo);
      expect(campos).toContain("a");
      expect(campos).toContain("b");
    }
  });

  it("anida la ruta del campo culpable", () => {
    try {
      validar(z.object({ tipos: z.array(z.object({ aforo: z.number() })) }), {
        tipos: [{ aforo: "mucho" }],
      });
      expect.unreachable("la validación should've fallado");
    } catch (error) {
      const campos = (error as ErrorValidacion).campos.map((campo) => campo.campo);
      expect(campos).toContain("tipos.0.aforo");
    }
  });

  it("expone un código de error estable y un mensaje por campo", () => {
    try {
      validar(z.object({ nombre: z.string().min(1, "el nombre es obligatorio") }), {});
      expect.unreachable("la validación should've fallado");
    } catch (error) {
      const validacion = error as ErrorValidacion;
      expect(validacion.codigo).toBe("VALIDACION");
      expect(validacion.campos[0]?.mensaje).toBe("El campo es obligatorio");
    }
  });

  it("respeta el mensaje propio de la regla cuando el valor está presente", () => {
    try {
      validar(z.object({ nombre: z.string().min(1, "el nombre es obligatorio") }), { nombre: "" });
      expect.unreachable("la validación should've fallado");
    } catch (error) {
      const validacion = error as ErrorValidacion;
      expect(validacion.campos[0]?.mensaje).toBe("el nombre es obligatorio");
    }
  });

  it("devuelve el detalle de un campo concreto", () => {
    try {
      validar(z.object({ nombre: z.string() }), {});
      expect.unreachable("la validación should've fallado");
    } catch (error) {
      expect((error as ErrorValidacion).campo("nombre")?.campo).toBe("nombre");
    }
  });
});

describe("jerarquía de errores de dominio", () => {
  it("ErrorValidacion y ErrorIdInvalido heredan de ErrorDominio", () => {
    expect(new ErrorValidacion([])).toBeInstanceOf(ErrorDominio);
    expect(new ErrorIdInvalido("x", "ObjectId")).toBeInstanceOf(ErrorDominio);
  });

  it("cada error de dominio expone un código estable", () => {
    expect(new ErrorIdInvalido("x", "ObjectId").codigo).toBe("ID_INVALIDO");
    expect(new ErrorValidacion([]).codigo).toBe("VALIDACION");
  });

  it("el nombre de la clase queda disponible para discriminate", () => {
    expect(new ErrorValidacion([]).name).toBe("ErrorValidacion");
    expect(new ErrorIdInvalido("x", "ObjectId").name).toBe("ErrorIdInvalido");
  });
});
