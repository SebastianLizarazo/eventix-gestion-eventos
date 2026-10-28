import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { config } from "../../../src/config.js";
import { aplicarSetup } from "../../../src/db/setup.js";
import { crearRepositorioAuditoria } from "../../../src/db/repos/auditoria.js";
import { auditoriaSchema, type Auditoria } from "../../../src/domain/schemas/index.js";
import { validar } from "../../../src/domain/validar.js";
import { IDS } from "../../domain/fixtures.js";
import { DOCUMENTOS_EJEMPLO } from "../../domain/documentos-ejemplo.js";

/**
 * Repositorio de `auditoria_eventos` (tarea T3.3): las consultas del documento 04 §4.6.
 *
 * Corre contra una base propia para no tocar la base de desarrollo.
 */

const DB_PRUEBA = `${config.MONGODB_DB}_repos_auditoria`;

let cliente: MongoClient;
let db: Db;

/** Referencias válidas (24 hex) para distinguir los documentos sembrados. */
const ACTOR_A = IDS.usuario;
const ACTOR_B = "66a800000000000000000099";
const SUJETO_TICKET_A = IDS.ticket;
const SUJETO_TICKET_B = "66d100000000000000000099";

/** El registro de auditoría del documento 04 §3.6, ya validado por el dominio. */
const AUDITORIA_BASE = validar(
  auditoriaSchema,
  DOCUMENTOS_EJEMPLO.auditoria_eventos,
  "auditoria",
) as Auditoria;

/**
 * Deriva un registro del ejemplo: el `_id` se quita (lo genera la base) y cada
 * prueba cambia solo los campos que necesita.
 */
function auditoria(overrides: Partial<Auditoria>): Auditoria {
  return validar(
    auditoriaSchema,
    { ...AUDITORIA_BASE, _id: undefined, ...overrides },
    "auditoria",
  ) as Auditoria;
}

/** Sembra los cuatro registros que usan las pruebas. */
async function sembrar(): Promise<void> {
  const repositorio = crearRepositorioAuditoria(db.collection("auditoria_eventos"));

  // El actor A emite un ticket (marzo).
  await repositorio.insertar(
    auditoria({
      actor_id: ACTOR_A,
      actor_rol: "organizador",
      accion: "ticket.emitido",
      sujeto_tipo: "ticket",
      sujeto_id: SUJETO_TICKET_A,
      ocurrido_en: new Date("2025-03-01T10:00:00Z"),
    }),
  );

  // El actor A aprueba una transacción (marzo).
  await repositorio.insertar(
    auditoria({
      actor_id: ACTOR_A,
      actor_rol: "organizador",
      accion: "transaccion.aprobada",
      sujeto_tipo: "transaccion",
      sujeto_id: IDS.transaccion,
      ocurrido_en: new Date("2025-03-05T10:00:00Z"),
    }),
  );

  // El sistema valida un ticket (abril).
  await repositorio.insertar(
    auditoria({
      actor_id: ACTOR_B,
      actor_rol: "sistema",
      accion: "ticket.usado",
      sujeto_tipo: "ticket",
      sujeto_id: SUJETO_TICKET_B,
      ocurrido_en: new Date("2025-04-01T10:00:00Z"),
    }),
  );

  // Un asistente emite un ticket (marzo), sobre el mismo sujeto del primero.
  await repositorio.insertar(
    auditoria({
      actor_id: ACTOR_B,
      actor_rol: "asistente",
      accion: "ticket.emitido",
      sujeto_tipo: "ticket",
      sujeto_id: SUJETO_TICKET_A,
      ocurrido_en: new Date("2025-03-08T10:00:00Z"),
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
  await db.collection("auditoria_eventos").deleteMany({});
  await sembrar();
});

describe("T3.3 · repositorio de auditoría", () => {
  it("lista los registros de un actor en una ventana de fechas (índice auditoria_actor_ocurrido_en)", async () => {
    const repositorio = crearRepositorioAuditoria(db.collection("auditoria_eventos"));

    const marzo = await repositorio.porActorYFecha(
      ACTOR_A,
      new Date("2025-03-01T00:00:00Z"),
      new Date("2025-03-31T23:59:59Z"),
    );

    expect(marzo.total).toBe(2);
    expect(marzo.items.map((a) => a.accion).sort()).toEqual([
      "ticket.emitido",
      "transaccion.aprobada",
    ]);

    // El registro de abril es de otro actor: queda fuera.
    const abril = await repositorio.porActorYFecha(
      ACTOR_A,
      new Date("2025-04-01T00:00:00Z"),
      new Date("2025-04-30T23:59:59Z"),
    );

    expect(abril.total).toBe(0);
  });

  it("lista los registros de un sujeto por tipo (índice auditoria_sujeto_tipo_sujeto_id)", async () => {
    const repositorio = crearRepositorioAuditoria(db.collection("auditoria_eventos"));

    const delTicket = await repositorio.porSujeto("ticket", SUJETO_TICKET_A);

    expect(delTicket.total).toBe(2);
    expect(delTicket.items.map((a) => a.actor_id).sort()).toEqual([ACTOR_A, ACTOR_B].sort());

    const deLaTransaccion = await repositorio.porSujeto("transaccion", IDS.transaccion);

    expect(deLaTransaccion.total).toBe(1);
    expect(deLaTransaccion.items[0]?.accion).toBe("transaccion.aprobada");

    // El mismo identificador con otro tipo de sujeto no es el mismo documento.
    const comoUsuario = await repositorio.porSujeto("usuario", SUJETO_TICKET_A);

    expect(comoUsuario.total).toBe(0);
  });

  it("lista los registros ocurridos en una ventana (índice auditoria_ocurrido_en_ttl)", async () => {
    const repositorio = crearRepositorioAuditoria(db.collection("auditoria_eventos"));

    const marzo = await repositorio.porOcurridoEn(
      new Date("2025-03-01T00:00:00Z"),
      new Date("2025-03-31T23:59:59Z"),
    );

    expect(marzo.total).toBe(3);
    expect(marzo.items.map((a) => a.accion).sort()).toEqual([
      "ticket.emitido",
      "ticket.emitido",
      "transaccion.aprobada",
    ]);

    const abril = await repositorio.porOcurridoEn(
      new Date("2025-04-01T00:00:00Z"),
      new Date("2025-04-30T23:59:59Z"),
    );

    expect(abril.total).toBe(1);
    expect(abril.items[0]?.accion).toBe("ticket.usado");
  });

  it("pagina la lista de registros de un actor", async () => {
    const repositorio = crearRepositorioAuditoria(db.collection("auditoria_eventos"));

    const pagina = await repositorio.porActorYFecha(
      ACTOR_A,
      new Date("2025-03-01T00:00:00Z"),
      new Date("2025-03-31T23:59:59Z"),
      { skip: 1, limit: 1 },
    );

    expect(pagina.skip).toBe(1);
    expect(pagina.limit).toBe(1);
    expect(pagina.total).toBe(2);
    expect(pagina.items).toHaveLength(1);
  });
});
