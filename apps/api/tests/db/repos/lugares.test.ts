import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { config } from "../../../src/config.js";
import { aplicarSetup } from "../../../src/db/setup.js";
import { crearRepositorioLugares } from "../../../src/db/repos/lugares.js";
import { lugarSchema, type Lugar } from "../../../src/domain/schemas/index.js";
import { validar } from "../../../src/domain/validar.js";
import { DOCUMENTOS_EJEMPLO } from "../../domain/documentos-ejemplo.js";

/**
 * Repositorio de `lugares` (tarea T3.2): las consultas del documento 04 §4.2.
 *
 * Corre contra una base propia para no tocar la base de desarrollo.
 */

const DB_PRUEBA = `${config.MONGODB_DB}_repos_lugares`;

let cliente: MongoClient;
let db: Db;

/** Punto de referencia desde el que se busca (`$near`). */
const ORIGEN = { longitud: -74.07, latitud: 4.66 };

/** El lugar del documento 04 §3.2, ya validado por el dominio. */
const LUGAR_BASE = validar(lugarSchema, DOCUMENTOS_EJEMPLO.lugares, "lugar") as Lugar;

/**
 * Deriva un lugar del ejemplo: el `_id` se quita (lo genera la base) y cada
 * prueba cambia solo los campos que necesita.
 */
function lugar(overrides: Partial<Lugar>): Lugar {
  return { ...LUGAR_BASE, _id: undefined, ...overrides };
}

/** Sembra los cuatro lugares que usan las pruebas. */
async function sembrar(): Promise<void> {
  const repositorio = crearRepositorioLugares(db.collection("lugares"));

  // A ~2,3 km del origen.
  await repositorio.insertar(
    lugar({
      nombre: "Corferias - Pabellón 4",
      ciudad: "Bogotá",
      geometria: { type: "Point", coordinates: [-74.09, 4.654] },
      activo: true,
    }),
  );

  // A ~1,7 km del origen: el más cercano.
  await repositorio.insertar(
    lugar({
      nombre: "Teatro Colón - Sala Principal",
      direccion: "Carrera 7 #37-40, Bogotá",
      ciudad: "Bogotá",
      geometria: { type: "Point", coordinates: [-74.081, 4.649] },
      activo: true,
    }),
  );

  // A ~21 km del origen.
  await repositorio.insertar(
    lugar({
      nombre: "Auditorio Cerrado",
      direccion: "Calle 100 #20-30, Bogotá",
      ciudad: "Bogotá",
      geometria: { type: "Point", coordinates: [-74.2, 4.8] },
      activo: false,
    }),
  );

  // A ~33 km del origen y en otra ciudad.
  await repositorio.insertar(
    lugar({
      nombre: "Teatro Metropolitano",
      direccion: "Calle 41 #65-70, Medellín",
      ciudad: "Medellín",
      geometria: { type: "Point", coordinates: [-74.3, 4.85] },
      activo: true,
    }),
  );
}

beforeAll(async () => {
  cliente = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });
  await cliente.connect();
  db = cliente.db(DB_PRUEBA);
  await db.dropDatabase();
  await aplicarSetup(db);
});

afterAll(async () => {
  await db.dropDatabase();
  await cliente.close();
});

beforeEach(async () => {
  await db.collection("lugares").deleteMany({});
  await sembrar();
});

describe("T3.2 · repositorio de lugares", () => {
  it("lista los lugares activos de una ciudad (índice lugares_ciudad_activo)", async () => {
    const repositorio = crearRepositorioLugares(db.collection("lugares"));

    const bogota = await repositorio.porCiudad("Bogotá");

    expect(bogota.total).toBe(2);
    expect(bogota.items.map((lugar) => lugar.nombre).sort()).toEqual([
      "Corferias - Pabellón 4",
      "Teatro Colón - Sala Principal",
    ]);

    // El lugar inactivo de Bogota queda fuera, y los de otras ciudades tambien.
    expect(bogota.items.map((lugar) => lugar.activo)).toEqual([true, true]);

    const medellin = await repositorio.porCiudad("Medellín");

    expect(medellin.total).toBe(1);
    expect(medellin.items[0]?.nombre).toBe("Teatro Metropolitano");
  });

  it("busca los lugares cercanos ordenados por distancia (índice lugares_geometria_2dsphere)", async () => {
    const repositorio = crearRepositorioLugares(db.collection("lugares"));

    const cercanos = await repositorio.cercaDe(ORIGEN);

    // `$near` ya ordena por distancia: el mas cercano va primero.
    expect(cercanos.items.map((lugar) => lugar.nombre)).toEqual([
      "Teatro Colón - Sala Principal",
      "Corferias - Pabellón 4",
      "Auditorio Cerrado",
      "Teatro Metropolitano",
    ]);
    // `$near` no admite conteo: el total no se calcula.
    expect(cercanos.total).toBeNull();
  });

  it("excluye los lugares que superan la distancia maxima", async () => {
    const repositorio = crearRepositorioLugares(db.collection("lugares"));

    const cercanos = await repositorio.cercaDe(ORIGEN, { distanciaMaximaMetros: 5_000 });

    expect(cercanos.total).toBeNull();
    expect(cercanos.items.map((lugar) => lugar.nombre)).toEqual([
      "Teatro Colón - Sala Principal",
      "Corferias - Pabellón 4",
    ]);
  });

  it("pagina la busqueda por proximity", async () => {
    const repositorio = crearRepositorioLugares(db.collection("lugares"));

    const pagina = await repositorio.cercaDe(ORIGEN, { skip: 1, limit: 1 });

    expect(pagina.skip).toBe(1);
    expect(pagina.limit).toBe(1);
    expect(pagina.items.map((lugar) => lugar.nombre)).toEqual(["Corferias - Pabellón 4"]);
  });
});
