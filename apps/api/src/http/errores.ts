import { MongoServerError } from "mongodb";
import {
  ErrorCompra,
  ErrorIdInvalido,
  ErrorValidacion,
  type MotivoCompra,
} from "../domain/errors.js";

/**
 * Contrato de error de la API: **un solo formato** para todos los fallos.
 *
 * El cuerpo siempre tiene la misma forma, y el código es un valor estable
 * (`codigo`) que no depende del texto del mensaje: el cliente decide con el
 * código, no leyendo el mensaje.
 */

/** Códigos de error estables del contrato HTTP. */
export type CodigoError =
  | "peticion_invalida"
  | "no_encontrado"
  | "conflicto"
  | "validacion"
  | "metodo_no_permitido"
  | "error_interno";

/** Detalle de un campo concreto que incumplió una regla. */
export type DetalleError = {
  /** Ruta del campo dentro del documento (ej. `tipos_ticket.0.aforo_vendido`). */
  campo: string;
  /** Mensaje legible de la regla incumplida. */
  mensaje: string;
  /** Código de la regla (mismo vocabulario que Zod). */
  codigo?: string;
};

/** Cuerpo de error que devuelve la API. */
export type CuerpoError = {
  error: {
    codigo: CodigoError;
    mensaje: string;
    detalles?: DetalleError[];
    request_id: string;
  };
};

/**
 * Error que la capa HTTP lanza a propósito: lleva el estado y el código con los
 * que tiene que responder, así el middleware no tiene que adivinarlos.
 */
export class ErrorHttp extends Error {
  readonly estado: number;
  readonly codigo: CodigoError;
  readonly detalles?: DetalleError[];

  constructor(estado: number, codigo: CodigoError, mensaje: string, detalles?: DetalleError[]) {
    super(mensaje);
    this.name = "ErrorHttp";
    this.estado = estado;
    this.codigo = codigo;
    this.detalles = detalles;
  }

  /** 400: la petición no se puede entender (sintaxis, parámetros, identificadores). */
  static peticionInvalida(mensaje = "Petición inválida", detalles?: DetalleError[]): ErrorHttp {
    return new ErrorHttp(400, "peticion_invalida", mensaje, detalles);
  }

  /** 404: el recurso no existe. */
  static noEncontrado(mensaje = "Recurso no encontrado"): ErrorHttp {
    return new ErrorHttp(404, "no_encontrado", mensaje);
  }

  /** 405: el método no está permitido sobre ese recurso. */
  static metodoNoPermitido(mensaje = "Método no permitido"): ErrorHttp {
    return new ErrorHttp(405, "metodo_no_permitido", mensaje);
  }

  /** 409: el recurso ya existe (violación de un índice único). */
  static conflicto(mensaje = "El recurso ya existe", detalles?: DetalleError[]): ErrorHttp {
    return new ErrorHttp(409, "conflicto", mensaje, detalles);
  }

  /** 422: la petición se entiende, pero viola una regla del dominio. */
  static validacion(mensaje = "Validación fallida", detalles?: DetalleError[]): ErrorHttp {
    return new ErrorHttp(422, "validacion", mensaje, detalles);
  }
}

/** Traducción de un error al cuerpo y al estado con los que se responde. */
export type TraduccionError = {
  estado: number;
  cuerpo: CuerpoError;
};

/**
 * Familia y campo de cada motivo de compra.
 *
 * El `error.codigo` dice **la familia** (404/409/422) y el motivo exacto
 * viaja en `detalles[0].codigo`: así el cliente distingue `aforo_agotado` de
 * `evento_no_vendible` —los dos son 409— sin leer el mensaje.
 *
 * - *no existe* → 404 `no_encontrado` (falta el recurso);
 * - *existe pero su estado no permite la compra* → 409 `conflicto`;
 * - *la petición pide algo que no es válido* → 422 `validacion`.
 */
const MOTIVO_COMPRA: Record<MotivoCompra, { estado: number; codigo: CodigoError; campo: string }> =
  {
    evento_no_encontrado: { estado: 404, codigo: "no_encontrado", campo: "evento_id" },
    tipo_ticket_no_encontrado: { estado: 404, codigo: "no_encontrado", campo: "tipo_ticket_id" },
    usuario_no_encontrado: { estado: 404, codigo: "no_encontrado", campo: "usuario_id" },
    evento_no_vendible: { estado: 409, codigo: "conflicto", campo: "estado" },
    venta_no_iniciada: { estado: 409, codigo: "conflicto", campo: "venta_inicio" },
    venta_cerrada: { estado: 409, codigo: "conflicto", campo: "venta_fin" },
    aforo_agotado: { estado: 409, codigo: "conflicto", campo: "aforo_total" },
    promocion_no_aplica: { estado: 422, codigo: "validacion", campo: "promocion_codigo" },
    compra_de_otro_comprador: {
      estado: 409,
      codigo: "conflicto",
      campo: "referencia_pasarela",
    },
  };

/** Construye el cuerpo de error con el formato único. */
function construir(
  codigo: CodigoError,
  mensaje: string,
  requestId: string,
  detalles?: DetalleError[],
): CuerpoError {
  return {
    error: {
      codigo,
      mensaje,
      ...(detalles && detalles.length > 0 ? { detalles } : {}),
      request_id: requestId,
    },
  };
}

/** ¿El error viene de un cuerpo JSON que no se pudo leer? */
function esErrorDeCuerpoInvalido(error: unknown): boolean {
  if (!(error instanceof SyntaxError)) {
    return false;
  }

  const tipo = (error as { type?: string }).type;

  return tipo === "entity.parse.failed" || tipo === "entity.too.large";
}

/** Campos que forman la clave duplicada, para señalar el conflicto. */
function detallesDeClaveDuplicada(error: MongoServerError): DetalleError[] {
  const clave = error.keyValue ?? {};

  return Object.entries(clave).map(([campo, valor]) => ({
    campo,
    mensaje: String(valor),
  }));
}

/**
 * Traduce cualquier error al contrato de error de la API.
 *
 * La traducción es **total**: no hay ningún error que escape sin un estado y
 * un código. Un error inesperado nunca expone su mensaje interno (puede
 * contener datos o rutas), solo el `request-id` que permite correlacionarlo con
 * el log del servidor.
 */
export function traducirError(error: unknown, requestId: string): TraduccionError {
  if (error instanceof ErrorHttp) {
    return {
      estado: error.estado,
      cuerpo: construir(error.codigo, error.message, requestId, error.detalles),
    };
  }

  if (error instanceof ErrorValidacion) {
    return {
      estado: 422,
      cuerpo: construir("validacion", "Validación fallida", requestId, error.campos),
    };
  }

  if (error instanceof ErrorIdInvalido) {
    return {
      estado: 400,
      cuerpo: construir("peticion_invalida", "Identificador inválido", requestId),
    };
  }

  if (error instanceof ErrorCompra) {
    const familia = MOTIVO_COMPRA[error.motivo];
    // El detalle del error es el motivo más específico que se conoce (el del
    // motor de promociones, si viene); si no, el propio motivo de la compra.
    const detalle = error.detalle ?? {
      campo: familia.campo,
      mensaje: error.message,
      codigo: error.motivo,
    };

    return {
      estado: familia.estado,
      cuerpo: construir(familia.codigo, error.message, requestId, [detalle]),
    };
  }

  if (error instanceof MongoServerError && error.code === 11000) {
    return {
      estado: 409,
      cuerpo: construir(
        "conflicto",
        "Ya existe un documento con ese valor",
        requestId,
        detallesDeClaveDuplicada(error),
      ),
    };
  }

  if (esErrorDeCuerpoInvalido(error)) {
    return {
      estado: 400,
      cuerpo: construir(
        "peticion_invalida",
        "El cuerpo de la petición no es un JSON válido",
        requestId,
      ),
    };
  }

  if (error instanceof Error && error.name === "BSONError") {
    return {
      estado: 400,
      cuerpo: construir("peticion_invalida", "Valor inválido para el tipo de dato", requestId),
    };
  }

  return {
    estado: 500,
    cuerpo: construir("error_interno", "Error interno", requestId),
  };
}
