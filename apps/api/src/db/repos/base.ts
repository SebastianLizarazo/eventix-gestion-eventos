import { ObjectId, type Collection, type Document, type Filter, type Sort } from "mongodb";
import type { ZodType, ZodTypeDef } from "zod";
import { toObjectId } from "../../domain/ids.js";
import { validar } from "../../domain/validar.js";

/**
 * Repositorio base: la parte común de las seis colecciones.
 *
 * La capa de persistencia tiene dos responsabilidades y ninguna más:
 *
 * 1. **Hablar BSON.** Los filtros, las proyecciones y los orders son
 *    documentos de MongoDB: quien llama decide qué índice se quiere tocar.
 * 2. **Devolver el dominio.** Cada documento leído se valida contra el esquema
 *    del dominio, así que el repositorio nunca devuelve una forma que el
 *    dominio no aceptaría, y los identificadores vuelven como hexadecimal.
 *
 * Lo que el repositorio **no** hace: decidir reglas de negocio. Un filtro no
 * es una regla; la regla vive en el dominio y el repositorio la aplica.
 */

/** Máximo de documentos que devuelve una lectura: evita escaneos accidentales. */
export const LIMITE_MAXIMO = 200;

/** Límite por defecto de una lectura paginada. */
export const LIMITE_POR_DEFECTO = 50;

/** Orden de una lectura: `{ campo: 1 }` ascendente, `{ campo: -1 }` descendente. */
export type OpcionesOrden = Record<string, 1 | -1>;

/** Paginación y orden de una lectura. */
export type OpcionesListado = {
  skip?: number;
  limit?: number;
  orden?: OpcionesOrden;
};

/** Página de resultados: los documentos y el total que hay detrás de la página. */
export type ResultadoPaginado<T> = {
  items: T[];
  total: number;
  skip: number;
  limit: number;
};

/**
 * Superficie común de un repositorio de colección.
 *
 * `TDominio` es el tipo que devuelve el esquema del dominio (por ejemplo
 * `Usuario`), no el documento BSON.
 */
export type Repositorio<TDominio extends { _id?: string }> = {
  readonly coleccion: Collection<Document>;
  listar(
    filtro: Filter<Document>,
    opciones?: OpcionesListado,
  ): Promise<ResultadoPaginado<TDominio>>;
  contar(filtro: Filter<Document>): Promise<number>;
  obtenerPorId(id: string): Promise<TDominio | null>;
  obtenerUno(filtro: Filter<Document>): Promise<TDominio | null>;
  insertar(documento: TDominio): Promise<string>;
  actualizarPorId(id: string, cambios: Document): Promise<boolean>;
  eliminarPorId(id: string): Promise<boolean>;
};

/** Lo que necesita saber el repositorio base para trabajar con una colección. */
export type ConfiguracionRepositorio<TDominio extends { _id?: string }> = {
  /** Colección física (el nombre del documento 04 §3). */
  coleccion: Collection<Document>;
  /** Esquema del dominio: valida y convierte cada documento leído. */
  esquema: ZodType<TDominio, ZodTypeDef, unknown>;
  /** Conversión del documento del dominio al documento BSON. */
  aBson: (documento: TDominio & { _id: string }) => Document;
};

/**
 * Crea el repositorio de una colección.
 *
 * @param configuracion colección, esquema del dominio y conversor a BSON.
 */
export function crearRepositorio<TDominio extends { _id?: string }>(
  configuracion: ConfiguracionRepositorio<TDominio>,
): Repositorio<TDominio> {
  const { coleccion, esquema, aBson } = configuracion;

  const aDominio = (documento: Document): TDominio =>
    validar(esquema, documento, coleccion.collectionName);

  return {
    coleccion,

    async listar(filtro, opciones) {
      const skip = Math.max(opciones?.skip ?? 0, 0);
      const limit = limitar(opciones?.limit);
      const total = await coleccion.countDocuments(filtro);

      const documentos = await coleccion
        .find(filtro)
        .sort((opciones?.orden ?? {}) as Sort)
        .skip(skip)
        .limit(limit)
        .toArray();

      return { items: documentos.map(aDominio), total, skip, limit };
    },

    async contar(filtro) {
      return coleccion.countDocuments(filtro);
    },

    async obtenerPorId(id) {
      const documento = await coleccion.findOne({ _id: toObjectId(id) });

      return documento ? aDominio(documento) : null;
    },

    async obtenerUno(filtro) {
      const documento = await coleccion.findOne(filtro);

      return documento ? aDominio(documento) : null;
    },

    async insertar(documento) {
      const id = documento._id ? toObjectId(documento._id) : new ObjectId();

      // El `_id` se asigna aquí para que el conversor siempre reciba un
      // identificador: el dominio lo deja opcional porque lo genera la base.
      const conId = { ...documento, _id: id.toHexString() } as TDominio & { _id: string };

      await coleccion.insertOne(aBson(conId));

      return id.toHexString();
    },

    async actualizarPorId(id, cambios) {
      // `cambios` son operadores de MongoDB (`$set`, `$inc`, ...): sus valores
      // deben ser compatibles con BSON (`Date` para fechas, `ObjectId` para
      // referencias). El repositorio no los convierte porque el conversor
      // trabaja sobre el documento completo, no sobre una actualización
      // parcial. `_v` tampoco se incrementa aquí: el bloqueo optimista se
      // decide en el caso de uso que escribe.
      const resultado = await coleccion.updateOne({ _id: toObjectId(id) }, cambios);

      return resultado.matchedCount > 0;
    },

    async eliminarPorId(id) {
      const resultado = await coleccion.deleteOne({ _id: toObjectId(id) });

      return resultado.deletedCount > 0;
    },
  };
}

/** Acota el límite pedido a un rango utilizable. */
function limitar(pedido: number | undefined): number {
  if (pedido === undefined) {
    return LIMITE_POR_DEFECTO;
  }

  return Math.min(Math.max(Math.trunc(pedido), 1), LIMITE_MAXIMO);
}
