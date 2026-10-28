import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { config } from "../../../src/config.js";
import { aplicarSetup } from "../../../src/db/setup.js";
import { crearRepositorioTransacciones } from "../../../src/db/repos/transacciones.js";
import { transaccionSchema, type Transaccion } from "../../../src/domain/schemas/index.js";
import { validar } from "../../../src/domain/validar.js";
import { IDS } from "../../domain/fixtures.js";
import { DOCUMENTOS_EJEMPLO } from "../../domain/documentos-ejemplo.js";

/**
 * Repositorio de `transacciones` (tarea T3.3): las consultas del documento 04 §4.5.
 *
 * Corre contra una base propia para no tocar la base de desarrollo.
 */

const DB_PRUEBA = `${config.MONGODB_DB}_repos_transacciones`;

let cliente: MongoClient;
let db: Db;

/** Referencias válidas (24 hex) para distinguir los documentos sembrados. */
const USUARIO_A = IDS.usuario;
const USUARIO_B = "66a800000000000000000099";
const TICKET_A = IDS.ticket;
const TICKET_B = "66d100000000000000000099";

/** La transacción del documento 04 §3.5, ya validada por el dominio. */
const TRANSACCION_BASE = validar(
  transaccionSchema,
  DOCUMENTOS_EJEMPLO.transacciones,
  "transaccion",
) as Transaccion;

/**
 * Deriva una transacción del ejemplo: el `_id` se quita (lo genera la base) y
 * cada prueba cambia solo los campos que necesita (la referencia de la
 * pasarela es única).
 */
function transaccion(overrides: Partial<Transaccion>): Transaccion {
  return validar(
    transaccionSchema,
    { ...TRANSACCION_BASE, _id: undefined, ...overrides },
    "transaccion",
  ) as Transaccion;
}

/** Sembra las cuatro transacciones que usan las pruebas. */
async function sembrar(): Promise<void> {
  const repositorio = crearRepositorioTransacciones(db.collection("transacciones"));

  // Aprobada y confirmada en marzo.
  await repositorio.insertar(
    transaccion({
      usuario_id: USUARIO_A,
      ticket_id: TICKET_A,
      estado: "aprobada",
      pasarela: "wompi_mock",
      referencia_pasarela: "TXN-0001",
      creada_en: new Date("2025-03-01T10:00:00Z"),
      confirmada_en: new Date("2025-03-01T10:00:05Z"),
    }),
  );

  // Pendiente: todavía no confirmada.
  await repositorio.insertar(
    transaccion({
      usuario_id: USUARIO_A,
      ticket_id: TICKET_A,
      estado: "pendiente",
      pasarela: "wompi_mock",
      referencia_pasarela: "TXN-0002",
      creada_en: new Date("2025-03-05T10:00:00Z"),
      confirmada_en: undefined,
    }),
  );

  // Rechazada en abril: fuera de la ventana de marzo.
  await repositorio.insertar(
    transaccion({
      usuario_id: USUARIO_B,
      ticket_id: TICKET_B,
      estado: "rechazada",
      pasarela: "stripe_mock",
      referencia_pasarela: "TXN-0003",
      creada_en: new Date("2025-04-01T10:00:00Z"),
      confirmada_en: undefined,
    }),
  );

  // Aprobada y confirmada en marzo, pero de otro usuario.
  await repositorio.insertar(
    transaccion({
      usuario_id: USUARIO_B,
      ticket_id: TICKET_B,
      estado: "aprobada",
      pasarela: "wompi_mock",
      referencia_pasarela: "TXN-0004",
      creada_en: new Date("2025-03-15T10:00:00Z"),
      confirmada_en: new Date("2025-03-15T10:00:01Z"),
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
  await db.collection("transacciones").deleteMany({});
  await sembrar();
});

describe("T3.3 · repositorio de transacciones", () => {
  it("lista las transacciones de un usuario en una ventana de fechas (índice transacciones_usuario_creada_en)", async () => {
    const repositorio = crearRepositorioTransacciones(db.collection("transacciones"));

    const marzo = await repositorio.porUsuarioYFecha(
      USUARIO_A,
      new Date("2025-03-01T00:00:00Z"),
      new Date("2025-03-31T23:59:59Z"),
    );

    expect(marzo.total).toBe(2);
    expect(marzo.items.map((t) => t.referencia_pasarela).sort()).toEqual(["TXN-0001", "TXN-0002"]);

    // Fuera de la ventana no hay nada del usuario A.
    const abril = await repositorio.porUsuarioYFecha(
      USUARIO_A,
      new Date("2025-04-01T00:00:00Z"),
      new Date("2025-04-30T23:59:59Z"),
    );

    expect(abril.total).toBe(0);
  });

  it("lista las transacciones de un estado en una ventana de fechas (índice transacciones_estado_creada_en)", async () => {
    const repositorio = crearRepositorioTransacciones(db.collection("transacciones"));

    const aprobadas = await repositorio.porEstadoYFecha(
      "aprobada",
      new Date("2025-03-01T00:00:00Z"),
      new Date("2025-03-31T23:59:59Z"),
    );

    expect(aprobadas.total).toBe(2);
    expect(aprobadas.items.map((t) => t.referencia_pasarela).sort()).toEqual([
      "TXN-0001",
      "TXN-0004",
    ]);

    // La rechazada de abril tampoco entra: ni por estado ni por fecha.
    const rechazadas = await repositorio.porEstadoYFecha(
      "rechazada",
      new Date("2025-03-01T00:00:00Z"),
      new Date("2025-04-30T23:59:59Z"),
    );

    expect(rechazadas.total).toBe(1);
    expect(rechazadas.items[0]?.referencia_pasarela).toBe("TXN-0003");
  });

  it("busca una transacción por pasarela y referencia (índice transacciones_pasarela_referencia_parcial)", async () => {
    const repositorio = crearRepositorioTransacciones(db.collection("transacciones"));

    const encontrada = await repositorio.porReferencia("wompi_mock", "TXN-0001");

    expect(encontrada).not.toBeNull();
    expect(encontrada?.estado).toBe("aprobada");
    expect(encontrada?.monto_cop).toBe(90000);

    // La referencia sola no alcanza: la pasarela es parte de la clave.
    await expect(repositorio.porReferencia("stripe_mock", "TXN-0001")).resolves.toBeNull();
    await expect(repositorio.porReferencia("wompi_mock", "TXN-9999")).resolves.toBeNull();
  });

  it("la búsqueda por referencia no filtra por estado: también encuentra una rechazada", async () => {
    const repositorio = crearRepositorioTransacciones(db.collection("transacciones"));

    // El índice `transacciones_pasarela_referencia_parcial` solo cubre
    // `pendiente` y `aprobada`, así que esta consulta no puede usarlo: es
    // una decisión consciente, no un descuido.
    const rechazada = await repositorio.porReferencia("stripe_mock", "TXN-0003");

    expect(rechazada).not.toBeNull();
    expect(rechazada?.estado).toBe("rechazada");
  });

  it("lista las transacciones confirmadas en una ventana (índice transacciones_confirmada_en)", async () => {
    const repositorio = crearRepositorioTransacciones(db.collection("transacciones"));

    const marzo = await repositorio.porFechaConfirmacion(
      new Date("2025-03-01T00:00:00Z"),
      new Date("2025-03-31T23:59:59Z"),
    );

    // Solo las que tienen `confirmada_en`: la pendiente y la rechazada quedan fuera.
    expect(marzo.total).toBe(2);
    expect(marzo.items.map((t) => t.referencia_pasarela).sort()).toEqual(["TXN-0001", "TXN-0004"]);

    const abril = await repositorio.porFechaConfirmacion(
      new Date("2025-04-01T00:00:00Z"),
      new Date("2025-04-30T23:59:59Z"),
    );

    expect(abril.total).toBe(0);
  });

  it("pagina la lista de transacciones de un usuario", async () => {
    const repositorio = crearRepositorioTransacciones(db.collection("transacciones"));

    const pagina = await repositorio.porUsuarioYFecha(
      USUARIO_A,
      new Date("2025-03-01T00:00:00Z"),
      new Date("2025-03-31T23:59:59Z"),
      { skip: 1, limit: 1, orden: { creada_en: -1 } },
    );

    expect(pagina.skip).toBe(1);
    expect(pagina.limit).toBe(1);
    expect(pagina.total).toBe(2);
    // Orden descendente por `creada_en`: la primera página es TXN-0002 (5 de
    // marzo) y la segunda TXN-0001 (1 de marzo).
    expect(pagina.items.map((t) => t.referencia_pasarela)).toEqual(["TXN-0001"]);
  });
});
