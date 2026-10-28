import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Logger } from "pino";
import type { Request, Response } from "express";
import { crearContextoPrueba, type ContextoPrueba } from "./helpers.js";
import { manejadorErrores } from "../../src/http/middleware/errores.js";

/**
 * T4.1 · núcleo HTTP: request-id, formato único de error y logging de acceso.
 */
let contexto: ContextoPrueba;

beforeAll(async () => {
  contexto = await crearContextoPrueba();
});

afterAll(async () => {
  await contexto.cerrar();
});

describe("T4.1 · request-id", () => {
  it("propaga el request-id que envía el cliente", async () => {
    const response = await request(contexto.app).get("/api/health").set("x-request-id", "abc-123");

    expect(response.headers["x-request-id"]).toBe("abc-123");
  });

  it("genera un request-id cuando el cliente no lo envía", async () => {
    const response = await request(contexto.app).get("/api/health");

    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/);
  });

  it("ignora un request-id con caracteres de control", async () => {
    const response = await request(contexto.app)
      .get("/api/health")
      .set("x-request-id", "abc\tinyectado");

    expect(response.headers["x-request-id"]).not.toBe("abc\tinyectado");
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f]{8}-/);
  });
});

describe("T4.1 · formato único de error", () => {
  it("devuelve 404 con el mismo formato en una ruta desconocida", async () => {
    const response = await request(contexto.app).get("/api/no-existe");

    expect(response.status).toBe(404);
    expect(response.body.error.codigo).toBe("no_encontrado");
    expect(typeof response.body.error.mensaje).toBe("string");
    expect(response.body.error.request_id).toBe(response.headers["x-request-id"]);
  });

  it("devuelve 400 con el mismo formato cuando el JSON es inválido", async () => {
    const response = await request(contexto.app)
      .post("/api/no-existe")
      .set("content-type", "application/json")
      .send("{ esto no es json");

    expect(response.status).toBe(400);
    expect(response.body.error.codigo).toBe("peticion_invalida");
    expect(response.body.error.request_id).toBe(response.headers["x-request-id"]);
  });

  it("el middleware de errores responde 500 con el mismo formato", () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const req = { requestId: "req-9" } as Request;

    manejadorErrores(new Error("fallo interno"), req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        codigo: "error_interno",
        mensaje: "Error interno",
        request_id: "req-9",
      },
    });
  });
});

describe("T4.1 · logging de acceso", () => {
  it("registra método, ruta, estado y request-id", async () => {
    const info = vi.fn();
    const logger = { info, warn: vi.fn(), error: vi.fn() } as unknown as Logger;
    const contextoLog = await crearContextoPrueba({ logger });

    try {
      await request(contextoLog.app).get("/api/health").set("x-request-id", "req-log");

      expect(info).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          path: "/api/health",
          status: 200,
          request_id: "req-log",
        }),
        expect.any(String),
      );
    } finally {
      await contextoLog.cerrar();
    }
  });
});
