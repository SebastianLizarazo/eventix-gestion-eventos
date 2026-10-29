import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { config } from "../../src/config.js";
import { aplicarSetup } from "../../src/db/setup.js";
import { compararConDeclarados, sembrar } from "../../src/seed/sembrar.js";
import { ESCALAS, SEMILLA_POR_DEFECTO, VOLUMENES_DECLARADOS } from "../../src/seed/volumenes.js";
import {
  eventoSchema,
  lugarSchema,
  ticketSchema,
  transaccionSchema,
  usuarioSchema,
} from "../../src/domain/schemas/index.js";

/**
 * Siembra del dataset en MongoDB (tarea T5.3).
 *
 * Lo que se comprueba aquí es lo que el script promete: que escribe los
 * volúmenes de la escala, que el servidor acepta los documentos (porque el
 * `$jsonSchema` del servidor está activo) y que dos siembras con la misma
 * semilla dejan **el mismo dataset**.
 */

const DB_PRUEBA = `${config.MONGODB_DB}_seed`;
const ESCALA_DEV = ESCALAS.dev;

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

describe("T5.3 · siembra en MongoDB", () => {
  it("escribe los volúmenes de la escala en las colecciones", async () => {
    const reporte = await sembrar(db, { escala: "dev", semilla: SEMILLA_POR_DEFECTO, reset: true });

    expect(reporte.conteos.lugares).toBe(ESCALA_DEV.lugares);
    expect(reporte.conteos.usuarios).toBe(ESCALA_DEV.usuarios);
    expect(reporte.conteos.eventos).toBe(ESCALA_DEV.eventos);
    expect(reporte.conteos.tickets).toBe(ESCALA_DEV.tickets);
    expect(reporte.conteos.transacciones).toBe(ESCALA_DEV.transacciones);

    await expect(db.collection("usuarios").countDocuments()).resolves.toBe(ESCALA_DEV.usuarios);
    await expect(db.collection("eventos").countDocuments()).resolves.toBe(ESCALA_DEV.eventos);
    await expect(db.collection("tickets").countDocuments()).resolves.toBe(ESCALA_DEV.tickets);
    await expect(db.collection("transacciones").countDocuments()).resolves.toBe(
      ESCALA_DEV.transacciones,
    );
  });

  it("compara los conteos contra los volúmenes declarados", async () => {
    const reporte = await sembrar(db, { escala: "dev", semilla: SEMILLA_POR_DEFECTO, reset: true });
    const comparacion = compararConDeclarados(reporte.conteos);

    const usuarios = comparacion.find((fila) => fila.coleccion === "usuarios");

    expect(usuarios?.declarado).toBe(VOLUMENES_DECLARADOS.usuarios);
    expect(usuarios?.generado).toBe(ESCALA_DEV.usuarios);
    expect(usuarios?.estado).toBe("parcial");

    const lugares = comparacion.find((fila) => fila.coleccion === "lugares");

    expect(lugares?.declarado).toBeNull();
    expect(lugares?.estado).toBe("sin-declarar");
  });

  it("dos siembras con la misma semilla dejan el mismo dataset", async () => {
    const primero = await sembrar(db, { escala: "dev", semilla: SEMILLA_POR_DEFECTO, reset: true });
    const segundo = await sembrar(db, { escala: "dev", semilla: SEMILLA_POR_DEFECTO, reset: true });

    expect(segundo.checksums).toEqual(primero.checksums);
    expect(segundo.conteos).toEqual(primero.conteos);
  });

  it("semillas distintas dejan datasets distintos", async () => {
    const primero = await sembrar(db, { escala: "dev", semilla: SEMILLA_POR_DEFECTO, reset: true });
    const otro = await sembrar(db, {
      escala: "dev",
      semilla: SEMILLA_POR_DEFECTO + 1,
      reset: true,
    });

    expect(otro.checksums.tickets).not.toBe(primero.checksums.tickets);
  });

  it("los documentos escritos validan contra el dominio al releerse", async () => {
    await sembrar(db, { escala: "dev", semilla: SEMILLA_POR_DEFECTO, reset: true });

    const lugar = await db.collection("lugares").findOne({});
    const usuario = await db.collection("usuarios").findOne({});
    const evento = await db.collection("eventos").findOne({});
    const ticket = await db.collection("tickets").findOne({});
    const transaccion = await db.collection("transacciones").findOne({});

    expect(() => lugarSchema.parse(lugar)).not.toThrow();
    expect(() => usuarioSchema.parse(usuario)).not.toThrow();
    expect(() => eventoSchema.parse(evento)).not.toThrow();
    expect(() => ticketSchema.parse(ticket)).not.toThrow();
    expect(() => transaccionSchema.parse(transaccion)).not.toThrow();
  });

  it("la escala completa reproduce los volúmenes declarados", () => {
    expect(ESCALAS.full.usuarios).toBe(VOLUMENES_DECLARADOS.usuarios);
    expect(ESCALAS.full.eventos).toBe(VOLUMENES_DECLARADOS.eventos);
    expect(ESCALAS.full.tickets).toBe(VOLUMENES_DECLARADOS.tickets);
    expect(ESCALAS.full.transacciones).toBe(VOLUMENES_DECLARADOS.transacciones);
  });
});
