import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { config } from "../../src/config.js";
import { aplicarSetup } from "../../src/db/setup.js";
import { ESCALAS } from "../../src/seed/volumenes.js";

/**
 * CLI del seed (tarea T5.3): `pnpm seed --scale=dev|full`.
 *
 * La CLI se prueba como proceso, no como función: lo que el runbook promete es
 * un comando, y un comando se prueba ejecutándolo.
 *
 * Cada caso **arranca un proceso** (`tsx` compila el TypeScript al vuelo) y
 * siembra la base, así que necesita más margen que el timeout por defecto de la
 * suite: con la suite completa corriendo en paralelo, el arranque se estira y el
 * caso se pasa por tiempo, no por un defecto del seed.
 */

vi.setConfig({ testTimeout: 60_000 });

const ejecutar = promisify(execFile);

const DB_PRUEBA = `${config.MONGODB_DB}_seed_cli`;

let cliente: MongoClient;
let db: Db;

/** Corre la CLI como proceso, como lo haría `pnpm seed`. */
async function correrCli(argumentos: string[]) {
  return ejecutar(process.execPath, ["--import", "tsx", "src/seed/seed-cli.ts", ...argumentos], {
    cwd: process.cwd(),
    env: { ...process.env, MONGODB_DB: DB_PRUEBA },
  });
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

describe("T5.3 · CLI del seed", () => {
  it("siembra la base y muestra los conteos contra los declarados", async () => {
    const { stdout } = await correrCli(["--scale=dev", "--reset"]);

    expect(stdout).toContain("colección");
    expect(stdout).toContain("generados");
    expect(stdout).toContain("declarados");
    expect(stdout).toContain("usuarios");

    await expect(db.collection("usuarios").countDocuments()).resolves.toBe(ESCALAS.dev.usuarios);
    await expect(db.collection("tickets").countDocuments()).resolves.toBe(ESCALAS.dev.tickets);
  });

  it("no pisa una base que ya tiene datos sin --reset", async () => {
    await correrCli(["--scale=dev", "--reset"]);

    await expect(correrCli(["--scale=dev"])).rejects.toMatchObject({ code: 1 });
    await expect(db.collection("usuarios").countDocuments()).resolves.toBe(ESCALAS.dev.usuarios);
  });

  it("rechaza una escala que no existe", async () => {
    await expect(correrCli(["--scale=media", "--reset"])).rejects.toMatchObject({ code: 1 });
  });
});
