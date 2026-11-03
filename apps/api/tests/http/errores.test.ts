import { describe, expect, it } from "vitest";
import { MongoServerError } from "mongodb";
import { ErrorIdInvalido, ErrorValidacion } from "../../src/domain/errors.js";
import { ErrorHttp, traducirError } from "../../src/http/errores.js";

/**
 * T4.1 · formato único de error.
 *
 * El contrato de error de la API no depende del texto del mensaje: cada
 * fallo posible se traduce a un `codigo` estable y a un estado HTTP.
 */
describe("T4.1 · traducción de errores", () => {
  it("traduce un error de validación del dominio a 422 con el detalle por campo", () => {
    const error = new ErrorValidacion([
      { campo: "nombre", mensaje: "El nombre es obligatorio", codigo: "too_small" },
    ]);

    const { estado, cuerpo } = traducirError(error, "req-1");

    expect(estado).toBe(422);
    expect(cuerpo.error.codigo).toBe("validacion");
    expect(cuerpo.error.mensaje).toBe("Validación fallida");
    expect(cuerpo.error.detalles).toEqual([
      { campo: "nombre", mensaje: "El nombre es obligatorio", codigo: "too_small" },
    ]);
    expect(cuerpo.error.request_id).toBe("req-1");
  });

  it("traduce un identificador inválido a 400", () => {
    const { estado, cuerpo } = traducirError(new ErrorIdInvalido("abc"), "req-2");

    expect(estado).toBe(400);
    expect(cuerpo.error.codigo).toBe("peticion_invalida");
    expect(cuerpo.error.request_id).toBe("req-2");
  });

  it("traduce una clave duplicada a 409 con el campo en conflicto", () => {
    const error = new MongoServerError({ message: "E11000 duplicate key error" });
    error.code = 11000;
    error.keyValue = { email_normalizado: "ana@example.com" };

    const { estado, cuerpo } = traducirError(error, "req-3");

    expect(estado).toBe(409);
    expect(cuerpo.error.codigo).toBe("conflicto");
    expect(cuerpo.error.detalles).toEqual([
      { campo: "email_normalizado", mensaje: "ana@example.com" },
    ]);
  });

  it("traduce un JSON malformado a 400", () => {
    const error = new SyntaxError("Unexpected token } in JSON at position 10");
    Object.assign(error, { type: "entity.parse.failed", status: 400 });

    const { estado, cuerpo } = traducirError(error, "req-4");

    expect(estado).toBe(400);
    expect(cuerpo.error.codigo).toBe("peticion_invalida");
  });

  it("traduce un error inesperado a 500 sin filtrar detalles internos", () => {
    const { estado, cuerpo } = traducirError(new Error("conexión perdida"), "req-5");

    expect(estado).toBe(500);
    expect(cuerpo.error.codigo).toBe("error_interno");
    expect(cuerpo.error.mensaje).toBe("Error interno");
    expect(JSON.stringify(cuerpo)).not.toContain("conexión perdida");
  });

  it("respeta el estado y el código de un error HTTP de la propia capa", () => {
    const error = ErrorHttp.noEncontrado("No existe el evento");

    const { estado, cuerpo } = traducirError(error, "req-6");

    expect(estado).toBe(404);
    expect(cuerpo.error.codigo).toBe("no_encontrado");
    expect(cuerpo.error.mensaje).toBe("No existe el evento");
  });
});
