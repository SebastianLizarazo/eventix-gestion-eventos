import {
  ObjectId,
  type ClientSession,
  type Collection,
  type Document,
  type Filter,
  type InsertOneOptions,
  type Sort,
  type UpdateOptions,
} from "mongodb";
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

/**
 * Sesión de la transacción en curso.
 *
 * El flujo de compra (H6) necesita que sus lecturas y sus escrituras formen
 * parte de la **misma** transacción de MongoDB: una lectura fuera de la
 * transacción vería un estado que la escritura no encuentra. Por eso las
 * operaciones del repositorio aceptan la sesión como opción opcional: fuera de
 * una transacción behaves exactamente igual que antes.
 */
export type OpcionesSesion = {
  session?: ClientSession;
};

/** Paginación y orden de una lectura. */
export type OpcionesListado = {
  skip?: number;
  limit?: number;
  orden?: OpcionesOrden;
  /**
   * Calcula el total de documentos que cumplen el filtro (por defecto `true`).
   *
   * Se desactiva para los filtros que **no admiten conteo**: `$near` y
   * `$nearSphere` no se permiten en `countDocuments` (MongoDB los rechaza con
   * "are not allowed in this context"), porque exigen ordenar por distancia.
   */
  total?: boolean;
  /** Sesión de la transacción en curso (el flujo de compra). */
  session?: ClientSession;
};

/** Página de resultados: los documentos y el total que hay detrás de la página. */
export type ResultadoPaginado<T> = {
  items: T[];
  /** Documentos que cumplen el filtro, o `null` si la lectura no lo calculó. */
  total: number | null;
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
  contar(filtro: Filter<Document>, opciones?: OpcionesSesion): Promise<number>;
  obtenerPorId(id: string, opciones?: OpcionesSesion): Promise<TDominio | null>;
  obtenerUno(filtro: Filter<Document>, opciones?: OpcionesSesion): Promise<TDominio | null>;
  insertar(documento: TDominio, opciones?: InsertOneOptions): Promise<string>;
  actualizarPorId(id: string, cambios: Document, opciones?: UpdateOptions): Promise<boolean>;
  /**
   * Actualiza los documentos que cumplen un filtro propio.
   *
   * Existe para las escrituras que **dependen del estado** del documento: la
   * reserva de cupo del flujo de compra solo suma el aforo si el tipo de
   * ticket todavía tiene cupo, y eso vive en el filtro, no en el código. Si
   * ningún documento cumple el filtro, la operación no toca nada y devuelve
   * `false`.
   */
  actualizarConFiltro(
    filtro: Filter<Document>,
    cambios: Document,
    opciones?: UpdateOptions,
  ): Promise<boolean>;
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
      const calcularTotal = opciones?.total ?? true;
      const sesion = opciones?.session;
      const total = calcularTotal
        ? await coleccion.countDocuments(filtro, sesion ? { session: sesion } : undefined)
        : null;

      const documentos = await coleccion
        .find(filtro, sesion ? { session: sesion } : undefined)
        .sort((opciones?.orden ?? {}) as Sort)
        .skip(skip)
        .limit(limit)
        .toArray();

      return { items: documentos.map(aDominio), total, skip, limit };
    },

    async contar(filtro, opciones) {
      return coleccion.countDocuments(
        filtro,
        opciones?.session ? { session: opciones.session } : undefined,
      );
    },

    async obtenerPorId(id, opciones) {
      const documento = await coleccion.findOne(
        { _id: toObjectId(id) },
        opciones?.session ? { session: opciones.session } : undefined,
      );

      return documento ? aDominio(documento) : null;
    },

    async obtenerUno(filtro, opciones) {
      const documento = await coleccion.findOne(
        filtro,
        opciones?.session ? { session: opciones.session } : undefined,
      );

      return documento ? aDominio(documento) : null;
    },

    async insertar(documento, opciones) {
      const id = documento._id ? toObjectId(documento._id) : new ObjectId();

      // El `_id` se asigna aquí para que el conversor siempre reciba un
      // identificador: el dominio lo deja opcional porque lo genera la base.
      const conId = { ...documento, _id: id.toHexString() } as TDominio & { _id: string };

      await coleccion.insertOne(aBson(conId), opciones);

      return id.toHexString();
    },

    async actualizarPorId(id, cambios, opciones) {
      // `cambios` son operadores de MongoDB (`$set`, `$inc`, ...): sus valores
      // deben ser compatibles con BSON (`Date` para fechas, `ObjectId` para
      // referencias). El repositorio no los convierte porque el conversor
      // trabaja sobre el documento completo, no sobre una actualización
      // parcial. `_v` tampoco se incrementa aquí: el bloqueo optimista se
      // decide en el caso de uso que escribe.
      //
      // `opciones` existe para las actualizaciones sobre elementos embebidos:
      // `arrayFilters` permite escribir en un elemento concreto de un array
      // (`tipos_ticket.$[tipo]`) sin reescribir el array entero.
      const resultado = await coleccion.updateOne({ _id: toObjectId(id) }, cambios, opciones);

      return resultado.matchedCount > 0;
    },

    async actualizarConFiltro(filtro, cambios, opciones) {
      const resultado = await coleccion.updateOne(filtro, cambios, opciones);

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
