/**
 * Inicializa el replica set rs0 sobre un mongod que ya está corriendo.
 *
 * Es la contraparte de scripts/mongo-up.mjs para entornos donde el contenedor lo
 * levanta otro (CI, por ejemplo): en lugar de `docker compose`, este script habla
 * directo con el nodo usando el driver oficial.
 *
 * Uso:
 *   MONGODB_ADMIN_URI=mongodb://localhost:27017/admin?directConnection=true \
 *   MONGODB_REPLICA_HOST=localhost:27017 \
 *   node scripts/mongo-replica-init.mjs
 */
import { MongoClient } from "mongodb";

const ADMIN_URI =
  process.env.MONGODB_ADMIN_URI ?? "mongodb://localhost:27017/admin?directConnection=true";
const REPLICA_SET = process.env.MONGODB_REPLICA_SET ?? "rs0";
const REPLICA_HOST = process.env.MONGODB_REPLICA_HOST ?? "localhost:27017";
const TIMEOUT_MS = 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  console.error(`[eventix] ${message}`);
  process.exit(1);
}

async function main() {
  const deadline = Date.now() + TIMEOUT_MS;

  let client;
  while (Date.now() < deadline) {
    try {
      client = new MongoClient(ADMIN_URI, { serverSelectionTimeoutMS: 3_000 });
      await client.connect();
      break;
    } catch {
      client = undefined;
      await sleep(1_000);
    }
  }
  if (!client) fail(`mongod no respondió en ${TIMEOUT_MS / 1000}s.`);

  const admin = client.db("admin").admin();

  try {
    await admin.command({ replSetGetStatus: 1 });
    console.log(`[eventix] Replica set ${REPLICA_SET} ya estaba iniciado.`);
  } catch (error) {
    const code = error?.code ?? error?.codeName;
    if (code === 76 || code === "NoReplicationEnabled") {
      fail(
        "El mongod no está corriendo con --replSet. " +
          "Levantalo con: mongod --replSet rs0 --bind_ip_all",
      );
    }
    if (code === 93 || code === "InvalidReplicaSetConfig") {
      fail(
        `El host ${REPLICA_HOST} no mapea al nodo. El replica set debe announcing ` +
          "el puerto que escucha el servidor dentro del contenedor: el mapeo de puertos " +
          "tiene que ser el mismo (host:puerto == contenedor:puerto).",
      );
    }
    if (code !== 94 && code !== "NotYetInitialized") throw error;

    await admin.command({
      replSetInitiate: { _id: REPLICA_SET, members: [{ _id: 0, host: REPLICA_HOST }] },
    });
    console.log(`[eventix] Replica set ${REPLICA_SET} iniciado (host: ${REPLICA_HOST}).`);
  }

  while (Date.now() < deadline) {
    const hello = await admin.command({ hello: 1 });
    if (hello.isWritablePrimary) {
      console.log("[eventix] Nodo PRIMARY listo.");
      await client.close();
      return;
    }
    await sleep(1_000);
  }

  fail("El nodo no quedó PRIMARY dentro del tiempo esperado.");
}

await main();
