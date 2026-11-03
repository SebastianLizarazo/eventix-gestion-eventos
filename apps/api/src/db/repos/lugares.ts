import type { Collection, Document, Filter } from "mongodb";
import { lugarSchema, type Lugar } from "../../domain/schemas/index.js";
import { lugarABson } from "../mapeo.js";
import {
  crearRepositorio,
  type OpcionesListado,
  type Repositorio,
  type ResultadoPaginado,
} from "./base.js";

/**
 * Opciones de la búsqueda por proximidad.
 *
 * `distanciaMaximaMetros` se traduce a `$maxDistance`; si no se indica, la
 * búsqueda devuelve todos los lugares ordenados por distancia.
 */
export type OpcionesCercaDe = {
  distanciaMaximaMetros?: number;
  skip?: number;
  limit?: number;
};

/**
 * Repositorio de `lugares` (documento 04 §3.2).
 *
 * Cada consulta corresponde a un patrón de query del documento 04 §4.2.
 */
export type RepositorioLugares = Repositorio<Lugar> & {
  /** Lugares activos de una ciudad (índice `lugares_ciudad_activo`). */
  porCiudad(ciudad: string, opciones?: OpcionesListado): Promise<ResultadoPaginado<Lugar>>;
  /** Lugares cercanos, del más cercano al más lejano (índice `lugares_geometria_2dsphere`). */
  cercaDe(
    punto: { longitud: number; latitud: number },
    opciones?: OpcionesCercaDe,
  ): Promise<ResultadoPaginado<Lugar>>;
};

/**
 * Crea el repositorio de `lugares`.
 *
 * @param coleccion colección física `lugares`.
 */
export function crearRepositorioLugares(coleccion: Collection<Document>): RepositorioLugares {
  const base = crearRepositorio<Lugar>({
    coleccion,
    esquema: lugarSchema,
    aBson: lugarABson,
  });

  return {
    ...base,

    async porCiudad(ciudad, opciones) {
      return base.listar({ ciudad, activo: true }, opciones);
    },

    async cercaDe(punto, opciones) {
      const maxDistance = opciones?.distanciaMaximaMetros;

      // Las coordenadas van en orden [longitud, latitud] (GeoJSON).
      const cerca: Filter<Document> = {
        geometria: {
          $near: {
            $geometry: { type: "Point", coordinates: [punto.longitud, punto.latitud] },
            ...(maxDistance === undefined ? {} : { $maxDistance: maxDistance }),
          },
        },
      };

      // `total: false` es obligatorio: `countDocuments` rechaza `$near`
      // ("$geoNear, $near, and $nearSphere are not allowed in this context").
      // El orden lo impone `$near` (de más cercano a más lejano), así que este
      // método no acepta `orden`.
      return base.listar(cerca, {
        skip: opciones?.skip,
        limit: opciones?.limit,
        total: false,
      });
    },
  };
}
