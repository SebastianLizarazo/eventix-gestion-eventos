import { createApp } from "./app.js";
import { config } from "./config.js";
import { connectMongo, pingMongo } from "./db/mongo.js";
import { crearRepositorios } from "./db/repos/index.js";
import { logger } from "./logger.js";

const startedAt = Date.now();

const { client, db } = await connectMongo();

const app = createApp({
  checkMongo: () => pingMongo(db),
  version: "0.1.0",
  startedAt,
  repos: crearRepositorios(db),
  logger,
});

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, "API Eventix escuchando");
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Cerrando la API");
  server.close();
  await client.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
