import { Router, type Request } from "express";
import type { Document, Filter } from "mongodb";
import type { ZodType, ZodTypeDef } from "zod";
import { toObjectId } from "../../domain/ids.js";
import { validar } from "../../domain/validar.js";
import type { Repositorio } from "../../db/repos/base.js";
import { ErrorHttp } from "../errores.js";
import {
  camposAnulados,
  camposPermitidos,
  leerId,
  leerObjeto,
  leerPaginacionDe,
  pagina,
} from "./comun.js";

/**
 * CRUD de una colección.
 *
 * Las seis colecciones comparten la misma forma de escritura, así que la
 * escriben **una sola vez** aquí: leer, editar (fusionando sobre el documento
 * vigente), validar el documento completo y escribir solo lo que cambió.
 *
 * Lo que el recurso decide es qué campos son suyos: el CRUD no sabe qué es un
 * contador del sistema ni qué campo es una referencia a otra colección; eso lo
 * declara la configuración de cada recurso.
 */

/** Configuración del CRUD de una colección. */
export type ConfiguracionCrud<TDominio extends { _id?: string }> = {
  /** Repositorio de la colección. */
  repositorio: Repositorio<TDominio>;
  /** Esquema del documento persistido: valida el documento completo tras la edición. */
  esquema: ZodType<TDominio, ZodTypeDef, unknown>;
  /** Prepara el documento que se inserta (deriva lo que escribe el sistema). */
  preparar: (input: unknown) => TDominio;
  /** Campos que el cliente puede editar. */
  camposEditables: readonly string[];
  /** Campos editables cuyo valor es el identificador de otro documento. */
  camposConId?: readonly string[];
  /** Nombre del recurso en los mensajes de error. */
  nombre: string;
  /** Ruta pública del recurso (para el encabezado `Location`). */
  ruta: string;
  /** El documento lleva versión y la edición la incrementa (`_v`). */
  conVersion?: boolean;
  /** Campo que el sistema actualiza en cada edición (por ejemplo `actualizado_en`). */
  campoActualizacion?: string;
  /** Deriva los campos que el sistema calcula a partir de la edición. */
  derivar?: (fusionado: Record<string, unknown>) => Record<string, unknown>;
  /** Convierte a BSON el valor de un campo editado. */
  convertir?: (campo: string, valor: unknown) => unknown;
  /** Filtro de la lista, leído de la query. */
  filtro?: (req: Request) => Filter<Document>;
  /** Orden de la lista. */
  orden?: Record<string, 1 | -1>;
  /** El recurso es de solo lectura: no se puede editar ni borrar. */
  soloLectura?: boolean;
};

/** Crea el router CRUD de una colección. */
export function crearRouterCrud<TDominio extends { _id?: string }>(
  config: ConfiguracionCrud<TDominio>,
): Router {
  const router = Router();

  const {
    repositorio,
    esquema,
    preparar,
    camposEditables,
    camposConId = [],
    nombre,
    ruta,
    conVersion = false,
    campoActualizacion,
    soloLectura = false,
  } = config;

  router.get("/", async (req, res) => {
    const opciones = {
      ...leerPaginacionDe(req),
      ...(config.orden ? { orden: config.orden } : {}),
    };

    const resultado = await repositorio.listar(config.filtro ? config.filtro(req) : {}, opciones);

    res.status(200).json(pagina(resultado));
  });

  router.get("/:id", async (req, res) => {
    const documento = await repositorio.obtenerPorId(leerId(req.params.id));

    if (!documento) {
      throw ErrorHttp.noEncontrado(`No existe el ${nombre}`);
    }

    res.status(200).json(documento);
  });

  router.post("/", async (req, res) => {
    const documento = preparar(leerObjeto(req.body));
    const id = await repositorio.insertar(documento);

    res
      .status(201)
      .location(`${ruta}/${id}`)
      .json({ ...documento, _id: id });
  });

  if (soloLectura) {
    // El rastro de auditoría es append-only: se puede leer y añadir, nunca
    // modificar ni borrar. Un método no permitido responde 405, no 404: la
    // ruta existe y lo que no se permite es la operación.
    router.all("/:id", () => {
      throw ErrorHttp.metodoNoPermitido(`El ${nombre} no se puede modificar ni borrar`);
    });

    return router;
  }

  router.patch("/:id", async (req, res) => {
    const id = leerId(req.params.id);
    const actual = await repositorio.obtenerPorId(id);

    if (!actual) {
      throw ErrorHttp.noEncontrado(`No existe el ${nombre}`);
    }

    const cuerpo = leerObjeto(req.body);
    const anulados = camposAnulados(cuerpo, camposEditables);
    const editable = camposPermitidos(cuerpo, camposEditables);

    for (const campo of anulados) {
      delete editable[campo];
    }

    if (Object.keys(editable).length === 0 && anulados.length === 0) {
      throw ErrorHttp.peticionInvalida("La petición no incluye ningún campo editable");
    }

    if (conVersion) {
      verificarVersion(cuerpo._v, versionDe(actual));
    }

    const ahora = new Date();
    const fusionado: Record<string, unknown> = { ...actual, ...editable };

    if (campoActualizacion) {
      fusionado[campoActualizacion] = ahora;
    }

    for (const campo of anulados) {
      delete fusionado[campo];
    }

    const derivados = config.derivar ? config.derivar(fusionado) : {};

    Object.assign(fusionado, derivados);

    const validado = validar(esquema, fusionado, nombre) as unknown as Record<string, unknown>;

    const cambios: Document = {};

    for (const campo of camposEditables) {
      if (!(campo in editable)) {
        continue;
      }

      cambios[campo] = aBson(campo, validado[campo]);
    }

    for (const [campo, valor] of Object.entries(derivados)) {
      cambios[campo] = aBson(campo, valor);
    }

    if (campoActualizacion) {
      cambios[campoActualizacion] = ahora;
    }

    const operadores: Document = { $set: cambios };

    if (conVersion) {
      operadores.$inc = { _v: 1 };
    }

    if (anulados.length > 0) {
      operadores.$unset = Object.fromEntries(anulados.map((campo) => [campo, ""]));
    }

    await repositorio.actualizarPorId(id, operadores);

    const actualizado = await repositorio.obtenerPorId(id);

    res.status(200).json(actualizado);
  });

  router.delete("/:id", async (req, res) => {
    const id = leerId(req.params.id);
    const eliminado = await repositorio.eliminarPorId(id);

    if (!eliminado) {
      throw ErrorHttp.noEncontrado(`No existe el ${nombre}`);
    }

    res.status(204).end();
  });

  return router;

  /** Convierte a BSON el valor de un campo editado. */
  function aBson(campo: string, valor: unknown): unknown {
    if (config.convertir) {
      return config.convertir(campo, valor);
    }

    if (camposConId.includes(campo)) {
      return toObjectId(String(valor));
    }

    return valor;
  }
}

/** Versión de un documento, para el bloqueo optimista. */
function versionDe(documento: unknown): number {
  const version = (documento as { _v?: number })._v;

  return version ?? 0;
}

/**
 * Comprueba la versión optimista: si el cliente manda la versión que leyó y ya
 * no es la vigente, el recurso cambió y la edición se rechaza.
 */
function verificarVersion(esperada: unknown, actual: number): void {
  if (esperada === undefined) {
    return;
  }

  if (esperada !== actual) {
    throw ErrorHttp.conflicto("El recurso cambió desde que se leyó");
  }
}
