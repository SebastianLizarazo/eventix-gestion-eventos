import { ErrorApi, ErrorConexion, leerCuerpoError, type CuerpoErrorLeido } from "./errores";

/**
 * Cliente HTTP de la interfaz.
 *
 * La interfaz es **consumidora pura** del contrato que la API ya publica
 * (spec S3): no hay rutas nuevas, ni CORS, ni configuración del lado del
 * servidor. Este cliente es el único lugar donde la interfaz habla con la
 * API, así que es también el único lugar donde se decide qué es un error de
 * la API y qué es un fallo de transporte (spec S6).
 *
 * Dos decisiones que conviene tener presentes:
 *
 * - **El `fetch` se resuelve en el momento de la llamada**, no al construir el
 *   cliente. Capturar la referencia al construir ataría el cliente a un
 *   `fetch` que puede no existir todavía (y en las pruebas no existe: se
 *   inyecta uno falso).
 * - **Un `codigo` que la API no mandó no se inventa.** Si el cuerpo de un
 *   error no tiene la forma del contrato —el HTML de un proxy, el JSON de
 *   otra API, un código fuera del vocabulario— el fallo es de transporte
 *   (`ErrorConexion`), no un `ErrorApi` con un código inventado: la interfaz
 *   decide por código, y un código falso decide mal.
 */

/** Base por defecto: el mismo origen (el proxy de Vite reenvía `/api`). */
const BASE_POR_DEFECTO = "/api";

/**
 * Base de la API.
 *
 * Sale de `VITE_API_BASE` porque en la entrega (compose con nginx) la web se
 * sirve en otro contenedor; en desarrollo no hace falta configurarla: el
 * proxy de `/api` mantiene todo en el mismo origen y así no hay CORS.
 */
export const BASE_API: string = normalizarBase(import.meta.env.VITE_API_BASE);

/** Métodos que usa la interfaz. */
export type MetodoHttp = "GET" | "POST" | "PATCH" | "DELETE";

/** Opciones de una petición. */
export type OpcionesPeticion = {
  /** Verbo de la petición; por defecto `GET`. */
  metodo?: MetodoHttp;
  /** Cuerpo de la petición: se manda como JSON. */
  cuerpo?: unknown;
  /** Parámetros de la query: `undefined` y `null` no viajan. */
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Aborta la petición (React Query lo usa para cancelar queries viejas). */
  signal?: AbortSignal;
  /**
   * Estados que **no** se consideran error.
   *
   * El healthcheck responde `503` cuando MongoDB no responde, y ese 503
   * **es** la respuesta que la interfaz quiere mostrar (la API está viva pero
   * degradada), no un fallo del transporte. Sin esta excepción, la pantalla
   * de inicio diría "no se pudo hablar con la API" cuando en realidad sí hay
   * respuesta.
   */
  estadosAceptados?: readonly number[];
};

/** Cliente HTTP tipado. */
export type ClienteHttp = {
  /** Petición genérica: el verbo va en las opciones. */
  pedir<T>(ruta: string, opciones?: OpcionesPeticion): Promise<T>;
  /** Lee un recurso. */
  obtener<T>(ruta: string, opciones?: OpcionesPeticion): Promise<T>;
  /** Crea un recurso. */
  crear<T>(ruta: string, cuerpo: unknown, opciones?: OpcionesPeticion): Promise<T>;
  /** Edita un recurso. */
  editar<T>(ruta: string, cuerpo: unknown, opciones?: OpcionesPeticion): Promise<T>;
  /** Borra un recurso. */
  borrar<T>(ruta: string, opciones?: OpcionesPeticion): Promise<T>;
};

/**
 * Crea un cliente HTTP sobre una base.
 *
 * El `fetch` es inyectable para poder probar sin red; si no se pasa, se usa
 * el `fetch` global **en el momento de la llamada**.
 */
export function crearClienteHttp(base: string, fetchImpl?: typeof fetch): ClienteHttp {
  async function pedir<T>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
    const metodo = opciones.metodo ?? "GET";
    const url = construirUrl(base, ruta, opciones.query);
    const cabeceras: Record<string, string> = { Accept: "application/json" };
    const init: RequestInit = { method: metodo, headers: cabeceras };

    if (opciones.cuerpo !== undefined) {
      cabeceras["Content-Type"] = "application/json";
      init.body = JSON.stringify(opciones.cuerpo);
    }

    if (opciones.signal !== undefined) {
      init.signal = opciones.signal;
    }

    const respuesta = await ejecutar(url, init, fetchImpl);

    const aceptado = opciones.estadosAceptados ?? [];

    if (!respuesta.ok && !aceptado.includes(respuesta.status)) {
      throw await errorDeRespuesta(respuesta);
    }

    // El tipo del cuerpo lo declara quien llama: la API ya publica su
    // contrato, así que el cliente no vuelve a validarlo. Solo valida el
    // error, que es lo que la interfaz decide mostrar.
    return (await leerCuerpo(respuesta)) as T;
  }

  return {
    pedir,
    obtener: <T>(ruta: string, opciones?: OpcionesPeticion): Promise<T> =>
      pedir<T>(ruta, { ...opciones, metodo: "GET" }),
    crear: <T>(ruta: string, cuerpo: unknown, opciones?: OpcionesPeticion): Promise<T> =>
      pedir<T>(ruta, { ...opciones, metodo: "POST", cuerpo }),
    editar: <T>(ruta: string, cuerpo: unknown, opciones?: OpcionesPeticion): Promise<T> =>
      pedir<T>(ruta, { ...opciones, metodo: "PATCH", cuerpo }),
    borrar: <T>(ruta: string, opciones?: OpcionesPeticion): Promise<T> =>
      pedir<T>(ruta, { ...opciones, metodo: "DELETE" }),
  };
}

/**
 * Cliente por defecto de la interfaz.
 *
 * Usa `BASE_API` y el `fetch` global: es lo que usan los hooks y los
 * componentes, sin tener que inyectar nada.
 */
export const apiClient: ClienteHttp = crearClienteHttp(BASE_API);

/**
 * Llama a la API y traduce un rechazo a `ErrorConexion`.
 *
 * El `fetch` se resuelve **aquí**, no al construir el cliente: así, un
 * `fetch` sustituido después de construir el cliente (o ausente al
 * construirlo) no deja el cliente inservible.
 */
async function ejecutar(
  url: string,
  init: RequestInit,
  fetchImpl?: typeof fetch,
): Promise<Response> {
  const hacer =
    fetchImpl ??
    ((entrada: RequestInfo | URL, opciones?: RequestInit) => globalThis.fetch(entrada, opciones));

  try {
    return await hacer(url, init);
  } catch (error) {
    throw new ErrorConexion(`No se pudo hablar con la API: ${mensajeDe(error)}`, {
      cause: error,
    });
  }
}

/**
 * Traduce una respuesta fallida al contrato de error.
 *
 * Con un cuerpo del contrato sale un `ErrorApi` (estado, código, mensaje,
 * detalles y `request_id`). Sin cuerpo del contrato sale un `ErrorConexion`:
 * inventar un código sería mentirle a la interfaz.
 */
async function errorDeRespuesta(respuesta: Response): Promise<ErrorApi | ErrorConexion> {
  const cuerpo = await cuerpoDeError(respuesta);

  if (cuerpo === undefined) {
    return new ErrorConexion(
      `La API respondió ${respuesta.status} con un cuerpo que no es el contrato de error`,
    );
  }

  const deCabecera = respuesta.headers.get("x-request-id") ?? "";
  const requestId =
    cuerpo.request_id !== undefined && cuerpo.request_id !== "" ? cuerpo.request_id : deCabecera;

  return new ErrorApi(respuesta.status, cuerpo.codigo, cuerpo.mensaje, cuerpo.detalles, requestId);
}

/**
 * Lee el cuerpo de una respuesta fallida y lo contrasta con el contrato.
 *
 * Un cuerpo que no se puede leer, que no es JSON o que no tiene la forma del
 * contrato único no es un error de la API: es un fallo de transporte.
 */
async function cuerpoDeError(respuesta: Response): Promise<CuerpoErrorLeido | undefined> {
  let texto: string;

  try {
    texto = await respuesta.text();
  } catch {
    return undefined;
  }

  let cuerpo: unknown;

  try {
    cuerpo = JSON.parse(texto);
  } catch {
    return undefined;
  }

  return leerCuerpoError(cuerpo);
}

/**
 * Lee el cuerpo JSON de una respuesta exitosa.
 *
 * Un 204 no tiene cuerpo: se devuelve `undefined` sin parsearlo, porque un
 * `JSON.parse` de una cadena vacía revienta y borrar un recurso es un 204
 * legítimo en la API.
 */
async function leerCuerpo(respuesta: Response): Promise<unknown> {
  if (respuesta.status === 204) {
    return undefined;
  }

  const texto = await respuesta.text();

  if (texto.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(texto);
  } catch {
    throw new ErrorConexion(`La API respondió ${respuesta.status} con un cuerpo que no es JSON`);
  }
}

/**
 * Arma la URL final: base + ruta + query.
 *
 * Los parámetros `undefined` y `null` **no viajan**: mandarlos como texto
 * ("undefined", "null") haría que la API creyera que el cliente pidió algo.
 */
function construirUrl(
  base: string,
  ruta: string,
  query?: Record<string, string | number | boolean | null | undefined>,
): string {
  const url = unirRuta(base, ruta);

  if (query === undefined) {
    return url;
  }

  const parametros = new URLSearchParams();

  for (const [clave, valor] of Object.entries(query)) {
    if (valor === undefined || valor === null) {
      continue;
    }

    parametros.append(clave, String(valor));
  }

  const cadena = parametros.toString();

  return cadena.length === 0 ? url : `${url}?${cadena}`;
}

/** Une la base y la ruta con exactamente una barra. */
function unirRuta(base: string, ruta: string): string {
  if (ruta.length === 0) {
    return base;
  }

  const baseSinBarra = base.endsWith("/") ? base.slice(0, -1) : base;
  const rutaConBarra = ruta.startsWith("/") ? ruta : `/${ruta}`;

  return `${baseSinBarra}${rutaConBarra}`;
}

/** Base configurada, o la del mismo origen si no hay ninguna. */
function normalizarBase(base: string | undefined): string {
  const limpia = base?.trim();

  return limpia === undefined || limpia.length === 0 ? BASE_POR_DEFECTO : limpia;
}

/** Mensaje de un error desconocido, sin quedarse con nada si no es un error. */
function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
