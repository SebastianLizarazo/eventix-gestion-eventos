import { logger } from "../logger.js";
import { connectMongo } from "./mongo.js";
import { aplicarSetup } from "./setup.js";

/**
 * CLI de provisioning del esquema: `pnpm db:setup`.
 *
 * Es idempotente, así que se puede correr las veces que haga falta (por
 * ejemplo, tras cambiar un validator en el código).
 */
async function main(): Promise<void> {
  const { client, db } = await connectMongo();

  try {
    const resultado = await aplicarSetup(db);

    logger.info(
      {
        db: db.databaseName,
        coleccionesCreadas: resultado.validadores.coleccionesCreadas,
        coleccionesActualizadas: resultado.validadores.coleccionesActualizadas,
        indicesCreados: resultado.indices.creados.length,
        indicesConservados: resultado.indices.conservados.length,
        indicesRecreados: resultado.indices.recreados,
      },
      "Esquema listo: validadores e índices aplicados",
    );
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "No se pudo aplicar el esquema en MongoDB");
  process.exitCode = 1;
});
