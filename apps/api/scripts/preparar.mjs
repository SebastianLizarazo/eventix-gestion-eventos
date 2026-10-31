/**
 * Prepara la base para la imagen de entrega de Eventix.
 *
 * Pasos, en este orden:
 * 1. Espera a que MongoDB esté disponible como PRIMARY. El replica set lo
 *    inicia el servicio `mongo-init` del compose de entrega; aquí solo se
 *    espera a que esté listo.
 * 2. Aplica el esquema: colecciones, validadores e índices (lo que hace
 *    `pnpm db:setup`).
 * 3. Siembra el dataset, salvo que la base ya tenga datos o la siembra esté
 *    desactivada.
 *
 * Es idempotente: relanzar el contenedor no vuelve a sembrar ni duplica nada.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { contarExistentes } from "../dist/seed/sembrar.js";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const URI = process.env.MONGODB_URI ?? "mongodb://mongo:27017/eventix?replicaSet=rs0";
const BASE = process.env.MONGODB_DB ?? "eventix";
const ESCALA = process.env.SEED_SCALE ?? "dev";
const SIEMBRA = process.env.SEED ?? "auto";
const ESPERA_MS = Number(process.env.MONGO_WAIT_TIMEOUT_MS ?? 120_000);

/**
 * Ejecuta uno de los CLI compilados de la API y propaga su código de salida.
 *
 * @param argumentos argumentos del CLI, relativos a `APP_DIR`.
 */
function ejecutar(argumentos) {
  return new Promise((resolver, rechazar) => {
    const proceso = spawn(process.execPath, argumentos, { stdio: "inherit", cwd: APP_DIR });

    proceso.on("error", rechazar);
    proceso.on("close", (codigo) => {
      if (codigo === 0) {
        resolver();
        return;
      }

      rechazar(new Error(`${argumentos.join(" ")} terminó con código ${codigo}`));
    });
  });
}

/**
 * Espera a que el nodo de MongoDB esté PRIMARY y devuelve el cliente abierto.
 *
 * La URI que usa la API incluye `replicaSet=rs0`, así que la conexión solo
 * resuelve cuando el replica set tiene un primario: ese es el estado que hace
 * falta, no un simple "el puerto responde".
 */
async function esperarMongo() {
  const limite = Date.now() + ESPERA_MS;
  let ultimoError = null;

  while (Date.now() < limite) {
    const cliente = new MongoClient(URI, {
      serverSelectionTimeoutMS: 5_000,
      appName: "eventix-entrega",
    });

    try {
      await cliente.connect();

      const info = await cliente.db(BASE).admin().command({ hello: 1 });

      if (info.isWritablePrimary === true) {
        return cliente;
      }

      await cliente.close();
    } catch (error) {
      ultimoError = error;
      await cliente.close().catch(() => {});
    }

    await new Promise((resolver) => setTimeout(resolver, 1_000));
  }

  const detalle = ultimoError instanceof Error ? ultimoError.message : "sin detalle";

  throw new Error(`MongoDB no quedó PRIMARY dentro de ${ESPERA_MS / 1000} s (${detalle})`);
}

async function main() {
  const cliente = await esperarMongo();

  try {
    await ejecutar(["dist/db/setup-cli.js"]);

    if (SIEMBRA === "never") {
      console.log("[entrega] siembra desactivada (SEED=never)");
      return;
    }

    const existentes = await contarExistentes(cliente.db(BASE));

    if (SIEMBRA === "auto" && existentes > 0) {
      console.log(`[entrega] la base ya tiene ${existentes} documentos: no se vuelve a sembrar`);
      return;
    }

    const argumentos = ["dist/seed/seed-cli.js", `--scale=${ESCALA}`];

    if (SIEMBRA === "always") {
      argumentos.push("--reset");
    }

    await ejecutar(argumentos);
  } finally {
    await cliente.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`[entrega] no se pudo preparar la base: ${error.message}`);
  process.exitCode = 1;
});
