import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Collection, type Db } from "mongodb";
import { config } from "../../src/config.js";
import { aplicarValidadores } from "../../src/db/setup.js";
import { COLECCIONES, VALIDADORES } from "../../src/db/validators.js";
import { prepararEvento } from "../../src/domain/schemas/index.js";

/**
 * Integración del provisioning del servidor (spec S5, tarea T2.1).
 *
 * Corre contra una base propia (`<db>_esquema`) para no tocar la base de
 * desarrollo: se borra antes y después de la suite.
 */

const DB_PRUEBA = `${config.MONGODB_DB}_esquema`;
const ID_ORGANIZADOR = "66a800000000000000000001";
const ID_LUGAR = "66b000000000000000000002";
const ID_TIPO_TICKET = "66c200000000000000000004";

/**
 * Las seis colecciones del documento 04 §3, escritas a mano: si el test las
 * tomara del propio módulo de validadores, un cambio en ese módulo pasaría
 * inadvertido (y una colección podría quedar sin validator sin que nadie lo
 * note).
 */
const COLECCIONES_ESPERADAS = [
  "usuarios",
  "lugares",
  "eventos",
  "tickets",
  "transacciones",
  "auditoria_eventos",
];

let cliente: MongoClient;
let db: Db;
let conectado = false;

/** El dominio trabaja con identificadores en hexadecimal; en BSON son ObjectId. */
function eventoEnBson() {
  const evento = prepararEvento({
    nombre: "Concierto de prueba",
    tipo_evento: "masivo",
    fecha_inicio: "2026-05-01T18:00:00Z",
    fecha_fin: "2026-05-01T23:00:00Z",
    organizador_id: ID_ORGANIZADOR,
    lugar_id: ID_LUGAR,
    tipos_ticket: [
      {
        _id: ID_TIPO_TICKET,
        nombre: "General",
        precio_cop: 120000,
        aforo_total: 100,
      },
    ],
  });

  return {
    ...evento,
    organizador_id: new ObjectId(evento.organizador_id),
    lugar_id: new ObjectId(evento.lugar_id),
    tipos_ticket: evento.tipos_ticket.map((tipo) => ({
      ...tipo,
      _id: new ObjectId(tipo._id),
    })),
  };
}

beforeAll(async () => {
  cliente = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });
  await cliente.connect();
  db = cliente.db(DB_PRUEBA);
  await db.dropDatabase();
  await aplicarValidadores(db);
  conectado = true;
});

afterAll(async () => {
  // Si el setup falló (por ejemplo, sin MongoDB), el teardown no debe tapar
  // el error original con un acceso a un handle que nunca se asignó.
  if (!conectado) {
    return;
  }

  await db.dropDatabase();
  await cliente.close();
});

describe("T2.1 · validadores $jsonSchema en el servidor", () => {
  it("crea las seis colecciones del documento 04 con su validator", async () => {
    const colecciones = await db.listCollections({}).toArray();
    const nombres = colecciones.map((coleccion) => coleccion.name).sort();

    expect(nombres).toEqual([...COLECCIONES_ESPERADAS].sort());
    expect([...COLECCIONES].sort()).toEqual([...COLECCIONES_ESPERADAS].sort());

    for (const nombre of COLECCIONES_ESPERADAS) {
      const coleccion = colecciones.find((c) => c.name === nombre);
      expect(coleccion?.options?.validator, `validator de ${nombre}`).toEqual(VALIDADORES[nombre]);
    }
  });

  it("deja la validación en modo estricto y con acción de error", async () => {
    const colecciones = await db.listCollections({}).toArray();

    for (const coleccion of colecciones) {
      expect(coleccion.options?.validationLevel).toBe("strict");
      expect(coleccion.options?.validationAction).toBe("error");
    }
  });

  it("acepta un evento que el dominio produce", async () => {
    const eventos = db.collection("eventos") as Collection;

    const insertado = await eventos.insertOne(eventoEnBson() as never);

    expect(insertado.acknowledged).toBe(true);
    await eventos.deleteMany({});
  });

  it("rechaza un evento sin los campos obligatorios", async () => {
    const eventos = db.collection("eventos") as Collection;
    const { nombre, ...incompleto } = eventoEnBson() as Record<string, unknown>;

    await expect(eventos.insertOne(incompleto as never)).rejects.toThrow(/validation/i);
  });

  it("rechaza un evento con un tipo de dato inválido", async () => {
    const eventos = db.collection("eventos") as Collection;
    const evento = eventoEnBson() as Record<string, unknown>;
    evento.fecha_inicio = "2026-05-01T18:00:00Z";

    await expect(eventos.insertOne(evento as never)).rejects.toThrow(/validation/i);
  });

  it("rechaza más de diez tipos de ticket", async () => {
    const eventos = db.collection("eventos") as Collection;
    const evento = eventoEnBson() as Record<string, unknown>;
    const tipo = evento.tipos_ticket as Record<string, unknown>[];

    evento.tipos_ticket = Array.from({ length: 11 }, (_, indice) => ({
      ...tipo[0],
      _id: new ObjectId(),
      nombre: `Tipo ${indice}`,
    }));

    await expect(eventos.insertOne(evento as never)).rejects.toThrow(/validation/i);
  });

  it("rechaza un enum fuera del catálogo del dominio", async () => {
    const eventos = db.collection("eventos") as Collection;
    const evento = eventoEnBson() as Record<string, unknown>;
    evento.estado = "cancelado_por_error";

    await expect(eventos.insertOne(evento as never)).rejects.toThrow(/validation/i);
  });

  it("es idempotente: reaplicar los validadores no rompe nada ni pierde datos", async () => {
    const eventos = db.collection("eventos") as Collection;
    const evento = eventoEnBson() as never;
    await eventos.insertOne(evento);

    const resultado = await aplicarValidadores(db);

    expect(resultado.coleccionesCreadas).toEqual([]);
    expect(resultado.coleccionesActualizadas.sort()).toEqual([...COLECCIONES_ESPERADAS].sort());
    expect(await eventos.countDocuments({})).toBe(1);
    await eventos.deleteMany({});
  });
});
