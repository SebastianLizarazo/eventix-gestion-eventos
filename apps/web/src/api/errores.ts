/**
 * Contrato de error de la API, del lado del consumidor.
 *
 * La API responde **siempre** con la misma forma:
 * `{ "error": { "codigo", "mensaje", "detalles"?, "request_id" } }`. La
 * interfaz decide por `codigo` —un vocabulario estable— y **nunca** leyendo
 * el mensaje: el texto puede cambiar sin que nadie avise, el código no.
 *
 * Esto es la contraparte de `apps/api/src/http/errores.ts`: allí se produce el
 * contrato, aquí se consume.
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
 * Error de error como llegó del cable.
 *
 * La diferencia con `CuerpoError` es deliberada: el `request_id` **puede
 * faltar** en el cuerpo (la API siempre lo manda en la cabecera
 * `x-request-id`, pero el cuerpo es lo primero que se lee y puede venir sin
 * él). El cliente lo completa con la cabecera antes de construir el error.
 */
export type CuerpoErrorLeido = {
  codigo: CodigoError;
  mensaje: string;
  detalles?: DetalleError[];
  request_id?: string;
};

/**
 * Error que la API devolvió con su contrato.
 *
 * Lleva el estado, el código y el `request_id` con el que se puede
 * correlacionar la queja con el log del servidor (spec S7).
 */
export class ErrorApi extends Error {
  readonly estado: number;
  readonly codigo: CodigoError;
  readonly detalles?: DetalleError[];
  readonly requestId: string;

  constructor(
    estado: number,
    codigo: CodigoError,
    mensaje: string,
    detalles?: DetalleError[],
    requestId?: string,
  ) {
    super(mensaje);
    this.name = "ErrorApi";
    this.estado = estado;
    this.codigo = codigo;
    this.detalles = detalles;
    // Sin identificador no hay correlación posible, pero un identificador
    // inventado sería peor que ninguno: se deja vacío.
    this.requestId = requestId ?? "";
  }
}

/**
 * Error de transporte: no hubo una respuesta utilizable.
 *
 * Se lanza cuando la API no está arriba, cuando la respuesta no trae el
 * contrato de error o cuando el cuerpo no se puede leer. **No** lleva código
 * de error: un `codigo` inventado sería una mentira, y la interfaz decide por
 * código.
 */
export class ErrorConexion extends Error {
  constructor(mensaje: string, opciones?: ErrorOptions) {
    super(mensaje, opciones);
    this.name = "ErrorConexion";
  }
}

/** El vocabulario de códigos: cerrado, para que un código desconocido se note. */
const CODIGOS_ERROR: readonly CodigoError[] = [
  "peticion_invalida",
  "no_encontrado",
  "conflicto",
  "validacion",
  "metodo_no_permitido",
  "error_interno",
];

/** ¿El valor es uno de los códigos del contrato? */
export function esCodigoError(valor: unknown): valor is CodigoError {
  return typeof valor === "string" && CODIGOS_ERROR.some((codigo) => codigo === valor);
}

/** ¿El valor es un objeto (no nulo) que se puede leer por clave? */
function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}

/**
 * ¿El error viene de la API?
 *
 * Se comprueba la forma y no solo la identidad: un error que cruzó un límite
 * de bundle (o que alguien reconstruyó) conserva su `codigo` aunque no sea
 * `instanceof` de esta clase.
 */
export function esErrorApi(valor: unknown): valor is ErrorApi {
  if (valor instanceof ErrorApi) {
    return true;
  }

  if (!esRegistro(valor)) {
    return false;
  }

  return (
    typeof valor.estado === "number" &&
    typeof valor.mensaje === "string" &&
    typeof valor.requestId === "string" &&
    esCodigoError(valor.codigo)
  );
}

/**
 * Interpreta un cuerpo JSON como el contrato de error de la API.
 *
 * Devuelve `undefined` cuando el cuerpo **no** es el contrato: un HTML de un
 * proxy, el JSON de otra API o un código fuera del vocabulario. Esa
 * diferencia importa: un cuerpo ajeno no es un error de la API con un código
 * inventado, es un fallo de transporte.
 */
export function leerCuerpoError(valor: unknown): CuerpoErrorLeido | undefined {
  if (!esRegistro(valor)) {
    return undefined;
  }

  const error = valor.error;

  if (!esRegistro(error)) {
    return undefined;
  }

  if (!esCodigoError(error.codigo) || typeof error.mensaje !== "string") {
    return undefined;
  }

  const detalles = leerDetalles(error.detalles);

  if (error.detalles !== undefined && detalles === undefined) {
    return undefined;
  }

  const requestId = error.request_id;

  return {
    codigo: error.codigo,
    mensaje: error.mensaje,
    ...(detalles === undefined ? {} : { detalles }),
    ...(typeof requestId === "string" ? { request_id: requestId } : {}),
  };
}

/**
 * Lee el detalle por campo.
 *
 * `undefined` significa "no había detalle" o "el detalle no es del contrato":
 * en los dos casos no se puede confiar en él.
 */
function leerDetalles(valor: unknown): DetalleError[] | undefined {
  if (valor === undefined) {
    return undefined;
  }

  if (!Array.isArray(valor)) {
    return undefined;
  }

  const elementos: unknown[] = valor;
  const detalles: DetalleError[] = [];

  for (const elemento of elementos) {
    if (!esRegistro(elemento)) {
      return undefined;
    }

    if (typeof elemento.campo !== "string" || typeof elemento.mensaje !== "string") {
      return undefined;
    }

    if (elemento.codigo !== undefined && typeof elemento.codigo !== "string") {
      return undefined;
    }

    detalles.push({
      campo: elemento.campo,
      mensaje: elemento.mensaje,
      ...(typeof elemento.codigo === "string" ? { codigo: elemento.codigo } : {}),
    });
  }

  return detalles;
}
