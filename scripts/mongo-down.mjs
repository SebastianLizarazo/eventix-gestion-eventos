/**
 * Detiene el stack de Docker del proyecto.
 *
 * Uso: pnpm mongo:down            -> detiene conservando el volumen de datos
 *      pnpm mongo:down --volumes  -> detiene y borra los datos
 */
import { spawnSync } from "node:child_process";

const args = ["down"];
if (process.argv.includes("--volumes")) args.push("--volumes");

const result = spawnSync("docker", ["compose", ...args], { stdio: "inherit" });
process.exit(result.status ?? 1);
