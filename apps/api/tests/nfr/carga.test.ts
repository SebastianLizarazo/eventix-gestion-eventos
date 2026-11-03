import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { config } from "../../src/config.js";
import { aplicarSetup } from "../../src/db/setup.js";
import { crearRepositorios, type Repositorios } from "../../src/db/repos/index.js";
import { arrancarServidorDeMedicion, type ServidorDeMedicion } from "../../src/nfr/servidor.js";
import {
  AFORO_POR_DEFECTO,
  COMPRADORES_POR_DEFECTO,
  MOTIVO_A_FORO_AGOTADO,
  PRECIO_POR_DEFECTO,
  analizarRespuestas,
  cargar,
  crearMarcador,
  leerArgumentos,
  medirCarga,
  type RespuestaCompra,
} from "../../src/nfr/carga.js";

/**
 * T8.3 · prueba de carga de compras (NFR-05).
 *
 * El requisito de negocio (documento 01 §4, NFR-05) es que *el inventario de
 * tickets debe ser consistentemente consistente: no se puede vender el mismo
 * asiento dos veces*. H6 ya lo probó a nivel de servicio (ocho compradores
 * contra un aforo de dos); esta unidad lo prueba **por HTTP**, que es el
 * camino que de verdad usa el cliente.
 *
 * La suite corre la **misma lógica** que el CLI (`cargar`), pero contra su
 * propia base y con una escala reducida (diez compradores contra un aforo de
 * cuatro) para que siga siendo rápida y hermética. Los números oficiales
 * (cien compradores contra un aforo de cincuenta) son los del CLI.
 *
 * Los tests **no afirman tiempos reales**: serían intermitentes y no probaría
 * nada del código. Afirman los **invariantes**: la mitad de las compras entra,
 * los rechazos dicen `aforo_agotado`, no queda ni un ticket ni una transacción
 * huérfanos, los contadores del evento cuadran y la corrida deja la base como
 * estaba.
 */

/** Base propia de la suite: no toca la base de desarrollo ni la del seed. */
const DB_PRUEBA = `${config.MONGODB_DB}_nfr_carga`;

/** Escala reducida de la suite: la oficial (100 contra 50) es la del CLI. */
const COMPRADORES = 10;
const AFORO = 4;
const PRECIO = 120_000;

/** Las seis colecciones del modelo: la corrida no puede dejar ninguna sucia. */
const COLECCIONES = [
  "eventos",
  "usuarios",
  "lugares",
  "tickets",
  "transacciones",
  "auditoria_eventos",
] as const;

let cliente: MongoClient;
let db: Db;
let repos: Repositorios;
let servidor: ServidorDeMedicion;

/** Corre la carga de la suite con la escala reducida. */
async function correrCargaDePrueba(): Promise<Awaited<ReturnType<typeof cargar>>> {
  return cargar({
    base: servidor.base,
    db,
    repos,
    compradores: COMPRADORES,
    aforo: AFORO,
    precio: PRECIO,
    correccion: "T8F3A1B2",
  });
}

/** Respuesta de una compra rechazada, con el motivo en el detalle. */
function respuestaRechazada(motivo: string, latencia = 10): RespuestaCompra {
  return {
    status: 409,
    cuerpo: {
      error: {
        codigo: "conflicto",
        mensaje: "No quedan entradas",
        detalles: [{ campo: "aforo_total", mensaje: "No quedan entradas", codigo: motivo }],
      },
    },
    latencia_ms: latencia,
  };
}

/** Respuesta de una compra creada. */
function respuestaCreada(latencia = 10): RespuestaCompra {
  return {
    status: 201,
    cuerpo: { ticket: { _id: "66d100000000000000000001" }, idempotente: false },
    latencia_ms: latencia,
  };
}

beforeAll(async () => {
  cliente = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });

  await cliente.connect();

  db = cliente.db(DB_PRUEBA);
  await db.dropDatabase();
  await aplicarSetup(db);

  repos = crearRepositorios(db);
  servidor = await arrancarServidorDeMedicion(repos, cliente);
});

beforeEach(async () => {
  await Promise.all(COLECCIONES.map((coleccion) => db.collection(coleccion).deleteMany({})));
});

afterAll(async () => {
  await servidor.cerrar();
  await db.dropDatabase();
  await cliente.close();
});

describe("T8.3 · argumentos de la línea de comandos", () => {
  it("usa los valores por defecto de la prueba oficial", () => {
    const argumentos = leerArgumentos([]);

    expect(argumentos.compradores).toBe(COMPRADORES_POR_DEFECTO);
    expect(argumentos.aforo).toBe(AFORO_POR_DEFECTO);
    expect(argumentos.precio).toBe(PRECIO_POR_DEFECTO);
    expect(argumentos.ayuda).toBe(false);
  });

  it("los valores por defecto son los de la corrida oficial: 100 contra 50", () => {
    expect(COMPRADORES_POR_DEFECTO).toBe(100);
    expect(AFORO_POR_DEFECTO).toBe(50);
  });

  it("lee las opciones explícitas", () => {
    const argumentos = leerArgumentos(["--compradores=8", "--aforo=3", "--precio=5000", "--ayuda"]);

    expect(argumentos.compradores).toBe(8);
    expect(argumentos.aforo).toBe(3);
    expect(argumentos.precio).toBe(5000);
    expect(argumentos.ayuda).toBe(true);
  });

  it("una opción desconocida es un error", () => {
    expect(() => leerArgumentos(["--desconocida=1"])).toThrow(/desconocida/);
  });

  it("los compradores deben ser un entero positivo", () => {
    expect(() => leerArgumentos(["--compradores=0"])).toThrow(/compradores/);
    expect(() => leerArgumentos(["--compradores=1.5"])).toThrow(/compradores/);
  });

  it("el aforo debe ser un entero no negativo", () => {
    expect(() => leerArgumentos(["--aforo=-1"])).toThrow(/aforo/);
    expect(() => leerArgumentos(["--aforo=2.5"])).toThrow(/aforo/);
  });

  it("el precio debe ser un entero no negativo", () => {
    expect(() => leerArgumentos(["--precio=-1"])).toThrow(/precio/);
  });
});

describe("T8.3 · análisis de las respuestas", () => {
  it("cuenta las compras creadas y las rechazadas", () => {
    const analisis = analizarRespuestas([
      respuestaCreada(),
      respuestaCreada(),
      respuestaRechazada(MOTIVO_A_FORO_AGOTADO),
    ]);

    expect(analisis.exitosas).toBe(2);
    expect(analisis.rechazadas).toBe(1);
  });

  it("el motivo del rechazo se lee del detalle del error", () => {
    const analisis = analizarRespuestas([respuestaRechazada(MOTIVO_A_FORO_AGOTADO)]);

    expect(analisis.motivos).toEqual({ [MOTIVO_A_FORO_AGOTADO]: 1 });
  });

  it("un rechazo con otro motivo queda separado de `aforo_agotado`", () => {
    const analisis = analizarRespuestas([
      respuestaRechazada(MOTIVO_A_FORO_AGOTADO),
      respuestaRechazada("venta_no_iniciada"),
    ]);

    expect(analisis.motivos).toEqual({
      [MOTIVO_A_FORO_AGOTADO]: 1,
      venta_no_iniciada: 1,
    });
  });

  it("una respuesta sin motivo identifiable no se pierde: cuenta como `sin_motivo`", () => {
    const analisis = analizarRespuestas([{ status: 500, cuerpo: {}, latencia_ms: 5 }]);

    expect(analisis.rechazadas).toBe(1);
    expect(analisis.motivos).toEqual({ sin_motivo: 1 });
  });

  it("las latencias de la corrida se conservan en el análisis", () => {
    const analisis = analizarRespuestas([respuestaCreada(12), respuestaRechazada("x", 34)]);

    expect(analisis.latencias_ms).toEqual([12, 34]);
  });
});

describe("T8.3 · medición de la ráfaga", () => {
  it("el throughput son las operaciones por segundo de la ráfaga", () => {
    const medicion = medirCarga([100, 200, 300, 400], 2_000);

    expect(medicion.iteraciones).toBe(4);
    expect(medicion.duracion_ms).toBe(2_000);
    expect(medicion.throughput_ops_s).toBe(2);
  });

  it("el p95 es el percentil por rango más cercano", () => {
    const latencias = Array.from({ length: 100 }, (_, indice) => indice + 1);
    const medicion = medirCarga(latencias, 1_000);

    expect(medicion.p95_ms).toBe(95);
    expect(medicion.p50_ms).toBe(50);
    expect(medicion.min_ms).toBe(1);
    expect(medicion.max_ms).toBe(100);
  });

  it("una ráfaga sin latencias no rompe la medición", () => {
    const medicion = medirCarga([], 0);

    expect(medicion.iteraciones).toBe(0);
    expect(medicion.p95_ms).toBe(0);
    expect(medicion.throughput_ops_s).toBe(0);
  });
});

describe("T8.3 · marcador de la corrida", () => {
  it("dos corridas no comparten los valores que sostienen índices únicos", () => {
    const uno = crearMarcador("AB12CD34");
    const otro = crearMarcador("EF56GH78");

    expect(uno.pasarela).not.toBe(otro.pasarela);
    expect(uno.prefijoEmail).not.toBe(otro.prefijoEmail);
    expect(uno.prefijoReferencia).not.toBe(otro.prefijoReferencia);
    expect(uno.slugEvento).not.toBe(otro.slugEvento);
  });

  it("el prefijo de correo identifica la corrida en minúsculas (así se persiste)", () => {
    const marcador = crearMarcador("AB12CD34");

    expect(marcador.prefijoEmail).toBe("nfr-carga-ab12cd34-");
  });

  it("la pasarela de la corrida es un nombre válido de pasarela", () => {
    const marcador = crearMarcador("AB12CD34");

    expect(marcador.pasarela).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(marcador.pasarela.length).toBeLessThanOrEqual(64);
  });
});

describe("T8.3 · carga de compras por HTTP", () => {
  it("diez compradores simultáneos contra un aforo de cuatro no sobrevenden", async () => {
    const resultado = await correrCargaDePrueba();

    expect(resultado.errores).toEqual([]);
    expect(resultado.cumple).toBe(true);
    expect(resultado.exitosas).toBe(AFORO);
    expect(resultado.rechazadas).toBe(COMPRADORES - AFORO);
  });

  it("todo rechazo dice `aforo_agotado` y ningún motivo más", async () => {
    const resultado = await correrCargaDePrueba();

    expect(resultado.motivos).toEqual({ [MOTIVO_A_FORO_AGOTADO]: COMPRADORES - AFORO });
  });

  it("no queda ni un ticket ni una transacción huérfanos", async () => {
    const resultado = await correrCargaDePrueba();

    expect(resultado.tickets).toBe(AFORO);
    expect(resultado.transacciones).toBe(AFORO);
    expect(resultado.tickets_sin_transaccion).toBe(0);
    expect(resultado.transacciones_sin_ticket).toBe(0);
  });

  it("los contadores del evento cuadran y nunca superan el aforo", async () => {
    const resultado = await correrCargaDePrueba();

    expect(resultado.aforo_vendido).toBe(AFORO);
    expect(resultado.tickets_vendidos_total).toBe(AFORO);
    expect(resultado.ingresos_cop).toBe(AFORO * PRECIO);
    expect(resultado.aforo_vendido).toBeLessThanOrEqual(AFORO);
  });

  it("la corrida deja la base como estaba", async () => {
    const resultado = await correrCargaDePrueba();

    expect(resultado.conteos_iguales).toBe(true);
    expect(resultado.conteos_antes).toEqual(resultado.conteos_despues);

    for (const coleccion of COLECCIONES) {
      expect(await db.collection(coleccion).countDocuments({})).toBe(0);
    }
  });

  it("con más aforo que compradores no espera rechazos", async () => {
    const resultado = await cargar({
      base: servidor.base,
      db,
      repos,
      compradores: 3,
      aforo: 10,
      precio: PRECIO,
      correccion: "T8F3C3D4",
    });

    expect(resultado.errores).toEqual([]);
    expect(resultado.exitosas).toBe(3);
    expect(resultado.rechazadas).toBe(0);
    expect(resultado.aforo_vendido).toBe(3);
    expect(resultado.ingresos_cop).toBe(3 * PRECIO);
  });
});
