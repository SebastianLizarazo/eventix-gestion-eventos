import { logger } from "../logger.js";
import { connectMongo } from "./mongo.js";
import { aplicarValidadores } from "./setup.js";

/**
 * CLI de provisioning del esquema: `pnpm db:setup`.
 *
 * Es idempotente, así que se puede correr las veces que haga falta (por
 * ejemplo, tras cambiar un validator en el código).
 */
async function main(): Promise<void> {
  const { client, db } = await connectMongo();

  try {
    const resultado = await aplicarValidadores(db);

    logger.info(
      {
        db: db.databaseName,
        creadas: resultado.coleccionesCreadas,
        actualizadas: resultado.coleccionesActualizadas,
      },
      "Esquema listo: validadores aplicados",
    );
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "No se pudo aplicar el esquema en MongoDB");
  process.exitCode = 1;
});
