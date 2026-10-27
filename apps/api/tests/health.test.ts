import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

function buildApp(mongoUp: boolean) {
  return createApp({
    checkMongo: async () => mongoUp,
    version: "test",
    startedAt: Date.now(),
  });
}

describe("GET /api/health", () => {
  it("responde 200 y estado 'ok' cuando MongoDB responde", async () => {
    const response = await request(buildApp(true)).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.mongo).toBe("up");
    expect(response.body.version).toBe("test");
  });

  it("responde 503 y estado 'degraded' cuando MongoDB no responde", async () => {
    const response = await request(buildApp(false)).get("/api/health");

    expect(response.status).toBe(503);
    expect(response.body.status).toBe("degraded");
    expect(response.body.mongo).toBe("down");
  });

  it("expone el uptime en segundos", async () => {
    const response = await request(buildApp(true)).get("/api/health");

    expect(response.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
