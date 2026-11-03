import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { config } from "../../src/config.js";
import { aplicarSetup } from "../../src/db/setup.js";
import { crearRepositorios, type Repositorios } from "../../src/db/repos/index.js";
import { crearServicioCompra } from "../../src/services/compra.js";
import { ErrorCompra } from "../../src/domain/errors.js";
import { prepararEvento, prepararUsuario } from "../../src/domain/schemas/index.js";

/**
 * Concurrencia de la compra (tarea T6.4): la prueba de NFR-05.
 *
 * Ocho compradores entran a la vez contra un evento que solo tiene **dos**
 * entradas: el que gana, gana, y los que pierden se quedan sin ticket, sin
 * transacción y sin ocupar cupo. Es la evidencia directa de que el flujo de
 * compra no sobrevende (documento 01, NFR-05).
 *
 * Corre contra una base propia para no tocar la base de desarrollo.
 */

const DB_PRUEBA = `${config.MONGODB_DB}_servicios_concurrencia`;

const ORGANIZADOR = "66a800000000000000000001";
const LUGAR = "66b000000000000000000002";
const TIPO_GENERAL = "66c200000000000000000004";

const PRECIO = 100_000;
const AFORO = 2;
const COMPRADORES = 8;

let cliente: MongoClient;
let db: Db;
let repos: Repositorios;
let servicio: ReturnType<typeof crearServicioCompra>;

/** Id del evento sembrado (lo asigna la base al insertar). */
let eventoId: string;

/** Siembra el evento con dos entradas de tipo General. */
async function sembrarEvento(): Promise<void> {
  const evento = await repos.eventos.insertar(
    prepararEvento({
      nombre: "Concierto concurrente",
      tipo_evento: "masivo",
      descripcion: "Evento con dos entradas y ocho compradores",
      estado: "publicado",
      visibilidad: "publico",
      fecha_inicio: new Date("2026-01-01T16:00:00Z"),
      fecha_fin: new Date("2026-01-01T23:00:00Z"),
      organizador_id: ORGANIZADOR,
      lugar_id: LUGAR,
      tipos_ticket: [
        {
          _id: TIPO_GENERAL,
          nombre: "General",
          precio_cop: PRECIO,
          aforo_total: AFORO,
          aforo_vendido: 0,
          restricciones: {},
        },
      ],
    }),
  );

  eventoId = evento;
}

/** Siembra los ocho compradores. */
async function sembrarCompradores(): Promise<string[]> {
  return Promise.all(
    Array.from({ length: COMPRADORES }, (_, indice) =>
      repos.usuarios.insertar(
        prepararUsuario({
          email: `concurrente${indice}@eventix.test`,
          nombre: `Concurrente ${indice}`,
          documento_identidad: `CC-20000${indice}`,
          tipo_usuario: ["asistente"],
        }),
      ),
    ),
  );
}

beforeAll(async () => {
  cliente = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });
  await cliente.connect();

  db = cliente.db(DB_PRUEBA);
  await db.dropDatabase();
  await aplicarSetup(db);

  repos = crearRepositorios(db);
  servicio = crearServicioCompra(cliente, repos);
});

beforeEach(async () => {
  await Promise.all(
    ["usuarios", "lugares", "eventos", "tickets", "transacciones", "auditoria_eventos"].map(
      (coleccion) => db.collection(coleccion).deleteMany({}),
    ),
  );

  await sembrarEvento();
});

afterAll(async () => {
  await db.dropDatabase();
  await cliente.close();
});

describe("concurrencia de la compra", () => {
  it("ocho compradores simultáneos contra un aforo de dos no sobrevenden", async () => {
    const compradores = await sembrarCompradores();

    const resultados = await Promise.allSettled(
      compradores.map((comprador, indice) =>
        servicio.comprar({
          evento_id: eventoId,
          tipo_ticket_id: TIPO_GENERAL,
          usuario_id: comprador,
          asistente_id: comprador,
          metodo_pago: "tarjeta_credito",
          pasarela: "demo_pago",
          referencia_pasarela: `REF-CONC-${indice}`,
        }),
      ),
    );

    const exitos = resultados.filter((resultado) => resultado.status === "fulfilled");
    const fallidos = resultados.filter((resultado) => resultado.status === "rejected");

    expect(exitos).toHaveLength(AFORO);
    expect(fallidos).toHaveLength(COMPRADORES - AFORO);

    for (const fallido of fallidos) {
      const motivo = (fallido as PromiseRejectedResult).reason as ErrorCompra;

      expect(motivo).toBeInstanceOf(ErrorCompra);
      expect(motivo.motivo).toBe("aforo_agotado");
    }

    const tickets = await repos.tickets.listar({});
    const transacciones = await repos.transacciones.listar({});
    const evento = await repos.eventos.obtenerPorId(eventoId);

    expect(tickets.items).toHaveLength(AFORO);
    expect(transacciones.items).toHaveLength(AFORO);
    expect(evento?.tipos_ticket.find((tipo) => tipo._id === TIPO_GENERAL)?.aforo_vendido).toBe(
      AFORO,
    );
    expect(evento?.metricas_evento?.tickets_vendidos_total).toBe(AFORO);
    expect(evento?.metricas_evento?.ingresos_cop).toBe(AFORO * PRECIO);
  });

  it("las compras perdedoras no dejan ticket ni transacción", async () => {
    const compradores = await sembrarCompradores();

    await Promise.allSettled(
      compradores.map((comprador, indice) =>
        servicio.comprar({
          evento_id: eventoId,
          tipo_ticket_id: TIPO_GENERAL,
          usuario_id: comprador,
          asistente_id: comprador,
          metodo_pago: "tarjeta_credito",
          pasarela: "demo_pago",
          referencia_pasarela: `REF-CONC-${indice}`,
        }),
      ),
    );

    const tickets = await repos.tickets.listar({});
    const transacciones = await repos.transacciones.listar({});

    // Ni un ticket suelto ni una transacción huérfana: la transacción que no
    // pudo confirmar no dejó nada.
    expect(tickets.items).toHaveLength(AFORO);
    expect(transacciones.items).toHaveLength(AFORO);

    for (const ticket of tickets.items) {
      const transaccion = await repos.transacciones.obtenerPorId(ticket.transaccion_id ?? "");

      expect(transaccion?.ticket_id).toBe(ticket._id);
    }
  });
});
