import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { config } from "../../src/config.js";
import { INDICES, TOTAL_INDICES } from "../../src/db/indexes.js";
import { aplicarSetup } from "../../src/db/setup.js";

/**
 * Integración de los índices del servidor (spec S5, tarea T2.2).
 *
 * Compara los índices reales contra la lista esperada del documento 04 §4.
 * Corre contra una base propia para no tocar la base de desarrollo.
 */

const DB_PRUEBA = `${config.MONGODB_DB}_indices`;

let cliente: MongoClient;
let db: Db;

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

describe("T2.2 · índices del documento 04 §4", () => {
  it("crea todos los índices declarados y ninguno más (además del _id_ implícito)", async () => {
    expect(TOTAL_INDICES).toBe(27);

    for (const [coleccion, definiciones] of Object.entries(INDICES)) {
      const reales = await db.collection(coleccion).listIndexes().toArray();
      const nombres = reales.map((indice) => indice.name).sort();

      expect(nombres, `índices de ${coleccion}`).toEqual(
        ["_id_", ...definiciones.map((definicion) => definicion.nombre)].sort(),
      );
    }
  });

  it("declara los índices únicos que sostienen la integridad de negocio", async () => {
    const usuarios = await db.collection("usuarios").listIndexes().toArray();
    const eventos = await db.collection("eventos").listIndexes().toArray();
    const tickets = await db.collection("tickets").listIndexes().toArray();

    const unico = (indices: typeof usuarios, nombre: string) =>
      indices.find((indice) => indice.name === nombre)?.unique === true;

    expect(unico(usuarios, "usuarios_email_normalizado_unique")).toBe(true);
    expect(unico(eventos, "eventos_slug_unique")).toBe(true);
    expect(unico(tickets, "tickets_codigo_qr_unique")).toBe(true);
  });

  it("crea el índice geoespacial 2dsphere de lugares", async () => {
    const lugares = await db.collection("lugares").listIndexes().toArray();
    const geodesico = lugares.find((indice) => indice.name === "lugares_geometria_2dsphere");

    expect(geodesico?.key).toEqual({ geometria: "2dsphere" });
  });

  it("crea el índice de texto de eventos con sus tres campos", async () => {
    const eventos = await db.collection("eventos").listIndexes().toArray();
    const texto = eventos.find((indice) => indice.name === "eventos_texto_text");

    expect(texto).toBeDefined();
    // MongoDB reporta los índices text con la forma interna {_fts, _ftsx}.
    expect(texto?.key).toEqual({ _fts: "text", _ftsx: 1 });
  });

  it("crea el índice TTL de auditoría con 365 días", async () => {
    const auditoria = await db.collection("auditoria_eventos").listIndexes().toArray();
    const ttl = auditoria.find((indice) => indice.name === "auditoria_ocurrido_en_ttl");

    expect(ttl?.expireAfterSeconds).toBe(31_536_000);
  });

  it("crea los índices parciales con su filtro", async () => {
    const eventos = await db.collection("eventos").listIndexes().toArray();
    const transacciones = await db.collection("transacciones").listIndexes().toArray();
    const tickets = await db.collection("tickets").listIndexes().toArray();

    const parcialPromociones = eventos.find(
      (indice) => indice.name === "eventos_promociones_codigo_parcial",
    );
    const parcialPasarela = transacciones.find(
      (indice) => indice.name === "transacciones_pasarela_referencia_parcial",
    );
    const parcialValidado = tickets.find(
      (indice) => indice.name === "tickets_estado_validado_en_parcial",
    );

    expect(parcialPromociones?.partialFilterExpression).toEqual({ "promociones.activo": true });
    expect(parcialPasarela?.unique).toBe(true);
    expect(parcialPasarela?.partialFilterExpression).toEqual({
      estado: { $in: ["pendiente", "aprobada"] },
    });
    expect(parcialValidado?.partialFilterExpression).toEqual({ validado_en: { $type: "date" } });
  });

  it("es idempotente: la segunda pasada conserva los índices sin recrear ninguno", async () => {
    const resultado = await aplicarSetup(db);

    expect(resultado.indices.creados).toEqual([]);
    expect(resultado.indices.recreados).toEqual([]);
    expect(resultado.indices.conservados.length).toBe(TOTAL_INDICES);
  });

  it("recrea un índice cuya definición cambió", async () => {
    const eventos = db.collection("eventos");
    await eventos.dropIndex("eventos_fecha_inicio");
    await eventos.createIndex({ fecha_inicio: -1 }, { name: "eventos_fecha_inicio" });

    const resultado = await aplicarSetup(db);

    expect(resultado.indices.recreados).toContain("eventos.eventos_fecha_inicio");

    const recreado = (await eventos.listIndexes().toArray()).find(
      (indice) => indice.name === "eventos_fecha_inicio",
    );
    expect(recreado?.key).toEqual({ fecha_inicio: 1 });
  });
});
