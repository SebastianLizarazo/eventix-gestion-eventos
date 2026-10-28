import { Router, type Request } from "express";
import type { Document, Filter } from "mongodb";
import { prepararLugar, lugarSchema } from "../../domain/schemas/index.js";
import type { Repositorios } from "../../db/repos/index.js";
import { crearRouterCrud } from "./crud.js";
import { leerNumero, leerPaginacionDe, pagina } from "./comun.js";

/**
 * Recurso de `lugares` (documento 04 §3.2).
 *
 * Además del CRUD expone la búsqueda por proximity (`$near`), que es la
 * consulta que sostiene el índice `2dsphere`.
 */
export function crearRouterLugares(repos: Repositorios): Router {
  const router = Router();

  router.get("/cerca", async (req, res) => {
    const query = req.query as unknown as Record<string, unknown>;
    const longitud = leerNumero(query.longitud, "longitud");
    const latitud = leerNumero(query.latitud, "latitud");
    const distancia =
      query.distancia === undefined ? undefined : leerNumero(query.distancia, "distancia");

    const resultado = await repos.lugares.cercaDe(
      { longitud, latitud },
      { distanciaMaximaMetros: distancia, ...leerPaginacionDe(req) },
    );

    res.status(200).json(pagina(resultado));
  });

  router.use(
    crearRouterCrud({
      repositorio: repos.lugares,
      esquema: lugarSchema,
      preparar: prepararLugar,
      camposEditables: [
        "nombre",
        "direccion",
        "ciudad",
        "pais",
        "capacidad_total",
        "geometria",
        "salas",
        "activo",
      ],
      nombre: "lugar",
      ruta: "/api/lugares",
      filtro: filtroDeLugares,
      orden: { nombre: 1 },
    }),
  );

  return router;
}

/** Filtro de la lista de lugares. */
function filtroDeLugares(req: Request): Filter<Document> {
  const query = req.query as unknown as Record<string, unknown>;
  const filtro: Filter<Document> = {};

  if (typeof query.ciudad === "string" && query.ciudad.length > 0) {
    filtro.ciudad = query.ciudad;
  }

  if (query.activo !== undefined) {
    filtro.activo = query.activo === "true";
  }

  return filtro;
}
