import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { config } from "../../../src/config.js";
import { aplicarSetup } from "../../../src/db/setup.js";
import { crearRepositorioTickets } from "../../../src/db/repos/tickets.js";
import { ticketSchema, type Ticket } from "../../../src/domain/schemas/index.js";
import { validar } from "../../../src/domain/validar.js";
import { IDS } from "../../domain/fixtures.js";
import { DOCUMENTOS_EJEMPLO } from "../../domain/documentos-ejemplo.js";

/**
 * Repositorio de `tickets` (tarea T3.3): las consultas del documento 04 §4.4.
 *
 * Corre contra una base propia para no tocar la base de desarrollo.
 */

const DB_PRUEBA = `${config.MONGODB_DB}_repos_tickets`;

let cliente: MongoClient;
let db: Db;

/** Referencias válidas (24 hex) para distinguir los documentos sembrados. */
const EVENTO_A = IDS.evento;
const EVENTO_B = "66c100000000000000000099";
const USUARIO_A = IDS.usuario;
const USUARIO_B = "66a800000000000000000099";
const TRANSACCION_A = IDS.transaccion;
const TRANSACCION_B = "66e100000000000000000099";

/** El ticket del documento 04 §3.4, ya validado por el dominio. */
const TICKET_BASE = validar(ticketSchema, DOCUMENTOS_EJEMPLO.tickets, "ticket") as Ticket;

/**
 * Deriva un ticket del ejemplo: el `_id` se quita (lo genera la base) y cada
 * prueba cambia solo los campos que necesita (el `codigo_qr` es único).
 */
function ticket(overrides: Partial<Ticket>): Ticket {
  return validar(
    ticketSchema,
    { ...TICKET_BASE, _id: undefined, ...overrides },
    "ticket",
  ) as Ticket;
}

/** Sembra los cuatro tickets que usan las pruebas. */
async function sembrar(): Promise<void> {
  const repositorio = crearRepositorioTickets(db.collection("tickets"));

  // Emitido, del usuario A y del evento A: nunca validado.
  await repositorio.insertar(
    ticket({
      codigo_qr: "QR-0001",
      estado: "emitido",
      evento_id: EVENTO_A,
      comprado_por_usuario_id: USUARIO_A,
      emitido_en: new Date("2025-03-01T10:00:00Z"),
      validado_en: null,
      validado_por_puerta: null,
      transaccion_id: undefined,
    }),
  );

  // Usado y validado dentro de marzo: el ticket que las ventanas deben ver.
  await repositorio.insertar(
    ticket({
      codigo_qr: "QR-0002",
      estado: "usado",
      evento_id: EVENTO_A,
      comprado_por_usuario_id: USUARIO_A,
      emitido_en: new Date("2025-03-05T10:00:00Z"),
      validado_en: new Date("2025-03-05T12:00:00Z"),
      validado_por_puerta: "Puerta 1",
      transaccion_id: TRANSACCION_A,
    }),
  );

  // Usado y validado en abril: otra ventana.
  await repositorio.insertar(
    ticket({
      codigo_qr: "QR-0003",
      estado: "usado",
      evento_id: EVENTO_B,
      comprado_por_usuario_id: USUARIO_B,
      emitido_en: new Date("2025-03-10T10:00:00Z"),
      validado_en: new Date("2025-04-01T10:00:00Z"),
      validado_por_puerta: "Puerta 2",
      transaccion_id: undefined,
    }),
  );

  // Emitido, del usuario B y del evento A: no pertenece al usuario A.
  await repositorio.insertar(
    ticket({
      codigo_qr: "QR-0004",
      estado: "emitido",
      evento_id: EVENTO_A,
      comprado_por_usuario_id: USUARIO_B,
      emitido_en: new Date("2025-03-12T10:00:00Z"),
      validado_en: null,
      validado_por_puerta: null,
      transaccion_id: TRANSACCION_B,
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
  await db.collection("tickets").deleteMany({});
  await sembrar();
});

describe("T3.3 · repositorio de tickets", () => {
  it("busca un ticket por código QR aunque venga en minúsculas (índice tickets_codigo_qr_unique)", async () => {
    const repositorio = crearRepositorioTickets(db.collection("tickets"));

    // El dominio persiste el código en MAYÚSCULAS: la búsqueda normaliza igual.
    const encontrado = await repositorio.porCodigoQr("qr-0002");

    expect(encontrado).not.toBeNull();
    expect(encontrado?.codigo_qr).toBe("QR-0002");
    expect(encontrado?.estado).toBe("usado");

    await expect(repositorio.porCodigoQr("QR-9999")).resolves.toBeNull();
  });

  it("filtra los tickets de un evento por estado (índice tickets_evento_id_estado)", async () => {
    const repositorio = crearRepositorioTickets(db.collection("tickets"));

    const usados = await repositorio.porEventoYEstado(EVENTO_A, "usado");

    expect(usados.total).toBe(1);
    expect(usados.items.map((t) => t.codigo_qr)).toEqual(["QR-0002"]);

    const emitidos = await repositorio.porEventoYEstado(EVENTO_A, "emitido");

    expect(emitidos.total).toBe(2);
    expect(emitidos.items.map((t) => t.codigo_qr).sort()).toEqual(["QR-0001", "QR-0004"]);

    // El ticket usado del evento B no se cuela en la búsqueda del evento A.
    const delOtroEvento = await repositorio.porEventoYEstado(EVENTO_B, "usado");

    expect(delOtroEvento.total).toBe(1);
    expect(delOtroEvento.items[0]?.codigo_qr).toBe("QR-0003");
  });

  it("lista los tickets del usuario del más reciente al más antiguo (índice tickets_comprado_por_usuario_emitido_en)", async () => {
    const repositorio = crearRepositorioTickets(db.collection("tickets"));

    const mios = await repositorio.misTickets(USUARIO_A);

    expect(mios.total).toBe(2);
    // Orden descendente por `emitido_en`: primero el del 5 de marzo.
    expect(mios.items.map((t) => t.codigo_qr)).toEqual(["QR-0002", "QR-0001"]);

    // Solo los del usuario pedido: los de USUARIO_B quedan fuera.
    const delOtro = await repositorio.misTickets(USUARIO_B);

    expect(delOtro.total).toBe(2);
    expect(delOtro.items.map((t) => t.codigo_qr)).toEqual(["QR-0004", "QR-0003"]);
  });

  it("lista los tickets de una transacción (índice tickets_transaccion_id)", async () => {
    const repositorio = crearRepositorioTickets(db.collection("tickets"));

    const deLaTransaccion = await repositorio.porTransaccion(TRANSACCION_A);

    expect(deLaTransaccion.total).toBe(1);
    expect(deLaTransaccion.items[0]?.codigo_qr).toBe("QR-0002");

    const otra = await repositorio.porTransaccion(TRANSACCION_B);

    expect(otra.total).toBe(1);
    expect(otra.items[0]?.codigo_qr).toBe("QR-0004");
  });

  it("lista los tickets validados dentro de una ventana (índice tickets_estado_validado_en_parcial)", async () => {
    const repositorio = crearRepositorioTickets(db.collection("tickets"));

    const marzo = await repositorio.validadosEnVentana(
      new Date("2025-03-01T00:00:00Z"),
      new Date("2025-03-31T23:59:59Z"),
    );

    expect(marzo.total).toBe(1);
    expect(marzo.items[0]?.codigo_qr).toBe("QR-0002");
  });

  it("excluye de la ventana los tickets sin validar y los validados fuera de ella", async () => {
    const repositorio = crearRepositorioTickets(db.collection("tickets"));

    const abril = await repositorio.validadosEnVentana(
      new Date("2025-04-01T00:00:00Z"),
      new Date("2025-04-30T23:59:59Z"),
    );

    // Solo entra el ticket validado en abril: los `emitido` nunca se validaron.
    expect(abril.total).toBe(1);
    expect(abril.items[0]?.codigo_qr).toBe("QR-0003");

    const ventanaVacia = await repositorio.validadosEnVentana(
      new Date("2025-05-01T00:00:00Z"),
      new Date("2025-05-31T23:59:59Z"),
    );

    expect(ventanaVacia.total).toBe(0);
    expect(ventanaVacia.items).toHaveLength(0);
  });

  it("pagina la lista de tickets del usuario", async () => {
    const repositorio = crearRepositorioTickets(db.collection("tickets"));

    const pagina = await repositorio.misTickets(USUARIO_A, { skip: 1, limit: 1 });

    expect(pagina.skip).toBe(1);
    expect(pagina.limit).toBe(1);
    expect(pagina.total).toBe(2);
    expect(pagina.items.map((t) => t.codigo_qr)).toEqual(["QR-0001"]);
  });
});
