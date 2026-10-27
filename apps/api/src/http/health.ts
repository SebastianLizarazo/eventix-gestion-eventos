import { Router } from "express";

export type HealthDeps = {
  checkMongo: () => Promise<boolean>;
  version: string;
  startedAt: number;
};

export function createHealthRouter(deps: HealthDeps): Router {
  const router = Router();

  router.get("/health", async (_req, res) => {
    const mongoUp = await deps.checkMongo();

    res.status(mongoUp ? 200 : 503).json({
      status: mongoUp ? "ok" : "degraded",
      mongo: mongoUp ? "up" : "down",
      version: deps.version,
      uptimeSeconds: Math.floor((Date.now() - deps.startedAt) / 1000),
    });
  });

  return router;
}
