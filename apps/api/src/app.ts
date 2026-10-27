import express, { type Express } from "express";
import { createHealthRouter, type HealthDeps } from "./http/health.js";

export function createApp(deps: HealthDeps): Express {
  const app = express();

  app.use(express.json());
  app.use("/api", createHealthRouter(deps));

  return app;
}
