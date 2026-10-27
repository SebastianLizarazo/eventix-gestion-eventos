import { MongoClient, type Db } from "mongodb";
import { config } from "../config.js";
import { logger } from "../logger.js";

export type MongoContext = {
  client: MongoClient;
  db: Db;
};

export async function connectMongo(
  uri: string = config.MONGODB_URI,
  dbName: string = config.MONGODB_DB,
): Promise<MongoContext> {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5_000,
    appName: "eventix-api",
  });

  await client.connect();
  const db = client.db(dbName);

  logger.info({ db: dbName }, "MongoDB conectado");

  return { client, db };
}

export async function pingMongo(db: Db): Promise<boolean> {
  try {
    await db.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}
