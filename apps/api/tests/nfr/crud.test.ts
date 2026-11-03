import { describe, expect, it } from "vitest";
import {
  MATRIZ_CRUD,
  cuerpoDeAlta,
  cuerpoDeEdicion,
  formatearTabla,
  leerArgumentos,
  operacionesDe,
  operacionesNoAplicables,
  resumenDeCarga,
  rutaDeListado,
  veredicto,
  type IdsMedicion,
  type MedicionCrud,
} from "../../src/nfr/crud.js";
import { compararConteos } from "../../src/nfr/dataset.js";
import {
  auditoriaInputSchema,
  eventoInputSchema,
  lugarInputSchema,
  ticketInputSchema,
  transaccionInputSchema,
  usuarioInputSchema,
} from "../../src/domain/schemas/index.js";
import { validar } from "../../src/domain/validar.js";

/**
 * T8.1 · lógica de la medición del p95 de CRUD (NFR-01).
 *
 * Los tests de esta unidad **no tocan la red**: comprueban la lógica que
 * decide el resultado —la matriz de operaciones, el veredicto contra el
 * umbral, la forma del resumen y la decisión del código de salida—. El
 * tiempo real que tarda cada operación no se puede afirmar en un test: sería
 * intermitente y no probaría nada del código.
 */

const IDS: IdsMedicion = {
  evento: "66c100000000000000000003",
  usuario: "66a800000000000000000001",
  lugar: "66b000000000000000000002",
  ticket: "66d100000000000000000006",
  transaccion: "66e100000000000000000007",
  tipoTicket: "66c200000000000000000004",
  ciudad: "Bogotá",
};

/** Medición de ejemplo: los tiempos no importan, la forma sí. */
function medicion(overrides: Partial<MedicionCrud> = {}): MedicionCrud {
  return {
    coleccion: "eventos",
    operacion: "listado",
    iteraciones: 20,
    min_ms: 10,
    p50_ms: 12,
    p95_ms: 15,
    max_ms: 20,
    ...overrides,
  };
}

describe("T8.1 · matriz de operaciones del CRUD", () => {
  it("cubre las seis colecciones con su ruta base", () => {
    expect(MATRIZ_CRUD.map((coleccion) => coleccion.nombre)).toEqual([
      "eventos",
      "usuarios",
      "lugares",
      "tickets",
      "transacciones",
      "auditoria_eventos",
    ]);

    expect(MATRIZ_CRUD.map((coleccion) => coleccion.ruta)).toEqual([
      "/api/eventos",
      "/api/usuarios",
      "/api/lugares",
      "/api/tickets",
      "/api/transacciones",
      "/api/auditoria",
    ]);
  });

  it("aplica las cinco operaciones en las colecciones editables", () => {
    for (const coleccion of ["eventos", "usuarios", "lugares", "tickets", "transacciones"]) {
      expect(operacionesDe(coleccion)).toEqual(["listado", "lectura", "alta", "edicion", "baja"]);
    }
  });

  it("la auditoría es append-only: no tiene edición ni baja", () => {
    expect(operacionesDe("auditoria_eventos")).toEqual(["listado", "lectura", "alta"]);
  });

  it("declara las operaciones no aplicables con el motivo del 405", () => {
    const noAplicables = operacionesNoAplicables("auditoria_eventos");

    expect(noAplicables.map((item) => item.operacion)).toEqual(["edicion", "baja"]);

    for (const item of noAplicables) {
      expect(item.motivo).toContain("no aplica por contrato");
      expect(item.motivo).toContain("405");
    }
  });

  it("no declara operaciones no aplicables en las colecciones editables", () => {
    for (const coleccion of ["eventos", "usuarios", "lugares", "tickets", "transacciones"]) {
      expect(operacionesNoAplicables(coleccion)).toEqual([]);
    }
  });

  it("rechaza una colección desconocida", () => {
    expect(() => operacionesDe("inventario")).toThrow(/inventario/);
  });
});

describe("T8.1 · veredicto contra el umbral", () => {
  it("dentro cuando el p95 no supera el umbral", () => {
    expect(veredicto(medicion({ p95_ms: 199.9 }), 200)).toBe("dentro");
  });

  it("dentro cuando el p95 iguala el umbral", () => {
    expect(veredicto(medicion({ p95_ms: 200 }), 200)).toBe("dentro");
  });

  it("FUERA cuando el p95 supera el umbral", () => {
    expect(veredicto(medicion({ p95_ms: 200.01 }), 200)).toBe("FUERA");
  });
});

describe("T8.1 · resumen de la carga", () => {
  it("cuenta las operaciones dentro y fuera del umbral", () => {
    const resumen = resumenDeCarga(
      [
        medicion({ p95_ms: 10 }),
        medicion({ p95_ms: 20 }),
        medicion({ p95_ms: 900, operacion: "alta" }),
      ],
      200,
    );

    expect(resumen.total).toBe(3);
    expect(resumen.dentro).toBe(2);
    expect(resumen.fuera).toBe(1);
  });

  it("el resumen decide el código de salida: una operación fuera impide el verde", () => {
    const resumen = resumenDeCarga([medicion({ p95_ms: 10 }), medicion({ p95_ms: 500 })], 200);

    expect(resumen.cumple).toBe(false);
  });

  it("una carga vacía no falla", () => {
    const resumen = resumenDeCarga([], 200);

    expect(resumen.total).toBe(0);
    expect(resumen.cumple).toBe(true);
  });
});

describe("T8.1 · tabla de resultados", () => {
  it("incluye las columnas del criterio y el veredicto de cada operación", () => {
    const tabla = formatearTabla(
      [
        medicion({ p95_ms: 12 }),
        medicion({ coleccion: "tickets", operacion: "alta", p95_ms: 900 }),
      ],
      200,
    );

    const lineas = tabla.split("\n");

    expect(lineas[0]).toContain("colección");
    expect(lineas[0]).toContain("operación");
    expect(lineas[0]).toContain("iteraciones");
    expect(lineas[0]).toContain("p95 ms");
    expect(lineas[0]).toContain("veredicto");
    expect(tabla).toContain("eventos");
    expect(tabla).toContain("dentro");
    expect(tabla).toContain("FUERA");
  });
});

describe("T8.1 · argumentos de la línea de comandos", () => {
  it("usa los valores por defecto del criterio", () => {
    const argumentos = leerArgumentos([]);

    expect(argumentos.iteraciones).toBe(20);
    expect(argumentos.calentamiento).toBe(3);
    expect(argumentos.umbralMs).toBe(200);
    expect(argumentos.ayuda).toBe(false);
  });

  it("lee las opciones explícitas", () => {
    const argumentos = leerArgumentos([
      "--iteraciones=5",
      "--calentamiento=1",
      "--umbral-ms=50",
      "--ayuda",
    ]);

    expect(argumentos.iteraciones).toBe(5);
    expect(argumentos.calentamiento).toBe(1);
    expect(argumentos.umbralMs).toBe(50);
    expect(argumentos.ayuda).toBe(true);
  });

  it("una opción desconocida es un error", () => {
    expect(() => leerArgumentos(["--desconocida=1"])).toThrow(/desconocida/);
  });

  it("las iteraciones deben ser un entero positivo", () => {
    expect(() => leerArgumentos(["--iteraciones=0"])).toThrow(/iteraciones/);
    expect(() => leerArgumentos(["--iteraciones=1.5"])).toThrow(/iteraciones/);
  });

  it("el calentamiento debe ser un entero no negativo", () => {
    expect(() => leerArgumentos(["--calentamiento=-1"])).toThrow(/calentamiento/);
  });

  it("el umbral debe ser un número positivo", () => {
    expect(() => leerArgumentos(["--umbral-ms=0"])).toThrow(/umbral/);
  });
});

describe("T8.1 · verificación del dataset sembrado", () => {
  it("detecta los conteos intactos", () => {
    const comparacion = compararConteos(
      { eventos: 340, tickets: 520_000 },
      { eventos: 340, tickets: 520_000 },
    );

    expect(comparacion.iguales).toBe(true);
    expect(comparacion.diferencias).toEqual([]);
  });

  it("detecta una colección que quedó sucia", () => {
    const comparacion = compararConteos(
      { eventos: 340, tickets: 520_000 },
      { eventos: 341, tickets: 520_000 },
    );

    expect(comparacion.iguales).toBe(false);
    expect(comparacion.diferencias).toEqual([{ coleccion: "eventos", antes: 340, despues: 341 }]);
  });
});

describe("T8.1 · cuerpos de alta válidos según el dominio", () => {
  it("cada colección acepta el cuerpo que la corrida envía", () => {
    const correccion = "AB12CD34-1";

    expect(() =>
      validar(eventoInputSchema, cuerpoDeAlta("eventos", IDS, correccion), "evento"),
    ).not.toThrow();
    expect(() =>
      validar(usuarioInputSchema, cuerpoDeAlta("usuarios", IDS, correccion), "usuario"),
    ).not.toThrow();
    expect(() =>
      validar(lugarInputSchema, cuerpoDeAlta("lugares", IDS, correccion), "lugar"),
    ).not.toThrow();
    expect(() =>
      validar(ticketInputSchema, cuerpoDeAlta("tickets", IDS, correccion), "ticket"),
    ).not.toThrow();
    expect(() =>
      validar(
        transaccionInputSchema,
        cuerpoDeAlta("transacciones", IDS, correccion),
        "transacción",
      ),
    ).not.toThrow();
    expect(() =>
      validar(
        auditoriaInputSchema,
        cuerpoDeAlta("auditoria_eventos", IDS, correccion),
        "auditoría",
      ),
    ).not.toThrow();
  });

  it("los valores únicos del modelo no se repiten entre iteraciones", () => {
    const primera = cuerpoDeAlta("eventos", IDS, "AB12CD34-1");
    const segunda = cuerpoDeAlta("eventos", IDS, "AB12CD34-2");
    const ticketUno = cuerpoDeAlta("tickets", IDS, "AB12CD34-1");
    const ticketDos = cuerpoDeAlta("tickets", IDS, "AB12CD34-2");
    const transaccionUna = cuerpoDeAlta("transacciones", IDS, "AB12CD34-1");
    const transaccionDos = cuerpoDeAlta("transacciones", IDS, "AB12CD34-2");

    expect(primera["slug"]).not.toBe(segunda["slug"]);
    expect(ticketUno["codigo_qr"]).not.toBe(ticketDos["codigo_qr"]);
    expect(transaccionUna["referencia_pasarela"]).not.toBe(transaccionDos["referencia_pasarela"]);
  });

  it("la edición cambia un campo editable y nada más", () => {
    const edicion = cuerpoDeEdicion("eventos", "AB12CD34-1");

    expect(Object.keys(edicion)).toEqual(["descripcion"]);
  });
});

describe("T8.1 · consulta de listado", () => {
  it("usa el patrón de query que el modelo indexa", () => {
    expect(rutaDeListado("eventos", IDS)).toBe("/api/eventos?estado=publicado");
    expect(rutaDeListado("usuarios", IDS)).toBe("/api/usuarios?tipo_usuario=organizador");
    expect(rutaDeListado("lugares", IDS)).toContain("/api/lugares?ciudad=");
    expect(rutaDeListado("tickets", IDS)).toBe(`/api/tickets?evento_id=${IDS.evento}`);
    expect(rutaDeListado("transacciones", IDS)).toBe(
      `/api/transacciones?usuario_id=${IDS.usuario}`,
    );
    expect(rutaDeListado("auditoria_eventos", IDS)).toBe(`/api/auditoria?actor_id=${IDS.usuario}`);
  });
});
