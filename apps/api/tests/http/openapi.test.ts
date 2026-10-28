import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Router } from "express";
import type { Logger } from "pino";
import { MongoClient, type Db } from "mongodb";
import { config } from "../../src/config.js";
import { createApp } from "../../src/app.js";
import { aplicarSetup } from "../../src/db/setup.js";
import { crearRepositorios } from "../../src/db/repos/index.js";
import { openapi } from "../../src/http/openapi.js";
import { createHealthRouter } from "../../src/http/health.js";
import { createRouter } from "../../src/http/router.js";
import { crearRouterAuditoria } from "../../src/http/recursos/auditoria.js";
import { crearRouterEventos } from "../../src/http/recursos/eventos.js";
import { crearRouterLugares } from "../../src/http/recursos/lugares.js";
import { crearRouterTickets } from "../../src/http/recursos/tickets.js";
import { crearRouterTransacciones } from "../../src/http/recursos/transacciones.js";
import { crearRouterUsuarios } from "../../src/http/recursos/usuarios.js";
import { IDS } from "../domain/fixtures.js";

/**
 * T4.4 · contrato OpenAPI 3.1.
 *
 * El contrato tiene que describir **todos** los endpoints, en las dos
 * direcciones: lo que el contrato describe tiene que existir en la
 * aplicación, y lo que la aplicación expone tiene que estar descrito.
 */

/** Prefijo de cada recurso de colección. */
const PREFIJOS = {
  usuarios: "/usuarios",
  lugares: "/lugares",
  eventos: "/eventos",
  tickets: "/tickets",
  transacciones: "/transacciones",
  auditoria: "/auditoria",
} as const;

/** Capa del router de Express (los internos no son públicos). */
type Capa = {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Capa[] };
};

/** Una ruta registrada: método y camino (con los parámetros `{id}`). */
type Ruta = { metodo: string; ruta: string };

let cliente: MongoClient;
let db: Db;
let app: ReturnType<typeof createApp>;

/**
 * Rutas registradas en un router.
 *
 * `incluirMontados` decide si se bajan a los routers montados dentro de este.
 * Los routers montados con prefijo no lo guardan en la capa (Express 5 no lo
 * expone), así que el prefijo se aplica donde se monta el router; por eso los
 * recursos se enumeran por separado.
 */
function rutasDe(router: Router, incluirMontados = true): Ruta[] {
  const rutas: Ruta[] = [];

  const visitar = (capas: Capa[], prefijo: string): void => {
    for (const capa of capas) {
      if (capa.route) {
        for (const metodo of Object.keys(capa.route.methods)) {
          if (metodo === "_all") {
            continue;
          }

          rutas.push({ metodo: metodo.toUpperCase(), ruta: `${prefijo}${capa.route.path}` });
        }
      } else if (incluirMontados && capa.handle && Array.isArray(capa.handle.stack)) {
        visitar(capa.handle.stack, prefijo);
      }
    }
  };

  visitar((router as unknown as { stack: Capa[] }).stack, "");

  return rutas;
}

/** Rutas que declara el contrato. */
function rutasDelContrato(): string[] {
  const rutas: string[] = [];

  for (const [ruta, operaciones] of Object.entries(openapi.paths)) {
    for (const metodo of Object.keys(operaciones)) {
      rutas.push(`${metodo.toUpperCase()} ${ruta}`);
    }
  }

  return rutas.sort();
}

beforeAll(async () => {
  cliente = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });
  await cliente.connect();

  db = cliente.db(`${config.MONGODB_DB}_http_openapi`);
  await db.dropDatabase();
  await aplicarSetup(db);

  app = createApp({
    checkMongo: async () => true,
    version: "test",
    startedAt: 0,
    repos: crearRepositorios(db),
    logger: { info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger,
  });
});

afterAll(async () => {
  await db.dropDatabase();
  await cliente.close();
});

describe("T4.4 · contrato OpenAPI 3.1", () => {
  it("declara la versión 3.1 y la información del contrato", () => {
    expect(openapi.openapi).toBe("3.1.0");
    expect(openapi.info.title).toBe("Eventix API");
    expect(openapi.info.version).toBeTruthy();
    expect(Object.keys(openapi.paths).length).toBeGreaterThan(0);
  });

  it("describe el esquema del error único de la API", () => {
    const error = openapi.components.schemas.Error as {
      properties: { error: { properties: { codigo: { enum: string[] } } } };
    };

    expect(error.properties.error.properties.codigo.enum).toContain("validacion");
    expect(error.properties.error.properties.codigo.enum).toContain("no_encontrado");
  });

  it("describe todos los endpoints registrados en la aplicación", () => {
    const repos = crearRepositorios(db);

    const deLaApp = [
      ...rutasDe(createHealthRouter({ checkMongo: async () => true, version: "t", startedAt: 0 })),
      ...rutasDe(
        createRouter({
          checkMongo: async () => true,
          version: "t",
          startedAt: 0,
          repos,
          logger: {} as unknown as Logger,
        }),
        false,
      ),
      ...rutasDe(crearRouterUsuarios(repos)).map((ruta) => ({
        ...ruta,
        ruta: `${PREFIJOS.usuarios}${ruta.ruta}`,
      })),
      ...rutasDe(crearRouterLugares(repos)).map((ruta) => ({
        ...ruta,
        ruta: `${PREFIJOS.lugares}${ruta.ruta}`,
      })),
      ...rutasDe(crearRouterEventos(repos)).map((ruta) => ({
        ...ruta,
        ruta: `${PREFIJOS.eventos}${ruta.ruta}`,
      })),
      ...rutasDe(crearRouterTickets(repos)).map((ruta) => ({
        ...ruta,
        ruta: `${PREFIJOS.tickets}${ruta.ruta}`,
      })),
      ...rutasDe(crearRouterTransacciones(repos)).map((ruta) => ({
        ...ruta,
        ruta: `${PREFIJOS.transacciones}${ruta.ruta}`,
      })),
      ...rutasDe(crearRouterAuditoria(repos)).map((ruta) => ({
        ...ruta,
        ruta: `${PREFIJOS.auditoria}${ruta.ruta}`,
      })),
    ];

    const deLaApi = deLaApp
      .map((ruta) => {
        const camino = ruta.ruta.replace(/:([A-Za-z0-9_]+)/g, "{$1}").replace(/\/$/, "");

        return `${ruta.metodo} ${camino}`;
      })
      .sort();

    const declaradas = rutasDelContrato();

    // El contrato tiene que describir todo lo que la aplicación expone, y la
    // aplicación tiene que exponer todo lo que el contrato describe.
    expect({
      sinDescribir: deLaApi.filter((ruta) => !declaradas.includes(ruta)),
      sinImplementar: declaradas.filter((ruta) => !deLaApi.includes(ruta)),
    }).toEqual({ sinDescribir: [], sinImplementar: [] });
  });

  it("tiene una ruta real para cada endpoint que describe", async () => {
    for (const [ruta, operaciones] of Object.entries(openapi.paths)) {
      const url = `/api${ruta.replace(/\{[^}]+\}/g, IDS.evento)}`;

      for (const metodo of Object.keys(operaciones)) {
        const respuesta = await request(app)[metodo.toLowerCase() as "get"](url);

        // Una ruta que no existe responde 404 con el mensaje del manejador
        // global; cualquier otro 404 (el recurso no existe) sí es la
        // respuesta de un endpoint registrado.
        expect(respuesta.body?.error?.mensaje ?? "").not.toContain("No existe el recurso");
      }
    }
  });

  it("se sirve en /api/openapi.json", async () => {
    const respuesta = await request(app).get("/api/openapi.json");

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.openapi).toBe("3.1.0");
    expect(respuesta.body.paths["/eventos/{id}"]).toBeDefined();
  });
});
