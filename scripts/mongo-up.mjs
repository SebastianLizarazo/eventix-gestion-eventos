/**
 * Levanta MongoDB 7.x en Docker como replica set de un solo nodo (rs0) y espera
 * a que el nodo quede PRIMARY. Es idempotente: se puede volver a ejecutar.
 *
 * Uso: pnpm mongo:up
 */
import { spawnSync } from "node:child_process";

const COMPOSE = ["docker", "compose"];
const RS_INIT = `try { rs.status().ok } catch (e) { rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]}).ok }`;
const PRIMARY_CHECK = "db.hello().isWritablePrimary";
const TIMEOUT_MS = 90_000;

function compose(args, { capture = false } = {}) {
  return spawnSync(COMPOSE[0], [...COMPOSE.slice(1), ...args], {
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
}

function fail(message, detail) {
  console.error(`\n[eventix] ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

// `--wait` espera a que el healthcheck del contenedor pase (el mongod ya
// acepta conexiones). Sin esta espera, el `rs.initiate` de abajo puede correr
// contra un mongod que todavía no escucha y fallar con ECONNREFUSED: el
// arranque en frío del contenedor es una carrera.
const up = compose(["up", "-d", "--wait", "mongo"]);
if (up.status !== 0) fail("No se pudo levantar el contenedor de MongoDB.");

const initiated = compose(["exec", "-T", "mongo", "mongosh", "--quiet", "--eval", RS_INIT], {
  capture: true,
});
if (initiated.status !== 0) {
  fail("No se pudo inicializar el replica set rs0.", initiated.stderr);
}

const deadline = Date.now() + TIMEOUT_MS;
while (Date.now() < deadline) {
  const check = compose(["exec", "-T", "mongo", "mongosh", "--quiet", "--eval", PRIMARY_CHECK], {
    capture: true,
  });
  if (check.status === 0 && check.stdout.trim() === "true") {
    console.log("[eventix] MongoDB 7.x listo — nodo PRIMARY (rs0).");
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

fail(`El nodo no quedó PRIMARY dentro de ${TIMEOUT_MS / 1000}s.`);
