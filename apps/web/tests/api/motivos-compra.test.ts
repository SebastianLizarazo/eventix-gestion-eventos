import { describe, expect, it } from "vitest";
import { ErrorApi, ErrorConexion } from "@/api/errores";
import { diagnosticoDeCompra } from "@/api/motivos-compra";

/**
 * Pruebas del mapa de motivos de la compra.
 *
 * El error de la API dice **la familia** (`no_encontrado`, `conflicto`,
 * `validacion`) y el motivo exacto viaja en `detalles[0].codigo`. La interfaz
 * decide por código (spec S6): el texto del mensaje puede cambiar sin que
 * nadie avise, el motivo no.
 */

/** Un error de compra tal como lo devuelve la API. */
function errorDeCompra(
  estado: number,
  codigo: "no_encontrado" | "conflicto" | "validacion",
  motivo?: string,
): ErrorApi {
  return new ErrorApi(
    estado,
    codigo,
    "El mensaje del servidor",
    motivo === undefined ? undefined : [{ campo: "evento_id", mensaje: "Detalle", codigo: motivo }],
    "req-123",
  );
}

describe("mapa de motivos de la compra", () => {
  it("reconoce el motivo exacto de un conflicto", () => {
    const diagnostico = diagnosticoDeCompra(errorDeCompra(409, "conflicto", "aforo_agotado"));

    expect(diagnostico).not.toBeNull();
    expect(diagnostico?.familia).toBe("conflicto");
    expect(diagnostico?.motivo).toBe("aforo_agotado");
    expect(diagnostico?.titulo).toBe("No quedan entradas de este tipo de ticket");
  });

  it("distingue un evento no encontrado de un evento no vendible", () => {
    const noEncontrado = diagnosticoDeCompra(
      errorDeCompra(404, "no_encontrado", "evento_no_encontrado"),
    );
    const noVendible = diagnosticoDeCompra(errorDeCompra(409, "conflicto", "evento_no_vendible"));

    expect(noEncontrado?.motivo).toBe("evento_no_encontrado");
    expect(noEncontrado?.titulo).toBe("El evento no existe");
    expect(noVendible?.motivo).toBe("evento_no_vendible");
    expect(noVendible?.titulo).toBe("El evento no está publicado");
  });

  it("reconoce el motivo específico del motor de promociones", () => {
    const diagnostico = diagnosticoDeCompra(errorDeCompra(422, "validacion", "usos_agotados"));

    expect(diagnostico?.motivo).toBe("usos_agotados");
    expect(diagnostico?.titulo).toBe("La promoción ya no tiene usos disponibles");
  });

  it("cae en el título de la familia cuando el motivo no se conoce", () => {
    const diagnostico = diagnosticoDeCompra(errorDeCompra(409, "conflicto", "motivo_del_futuro"));

    expect(diagnostico?.familia).toBe("conflicto");
    expect(diagnostico?.motivo).toBeNull();
    expect(diagnostico?.titulo).toBe("La compra no se puede concretar");
  });

  it("no diagnostica un fallo de transporte", () => {
    expect(diagnosticoDeCompra(new ErrorConexion("no hay API"))).toBeNull();
  });
});
