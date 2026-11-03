import { afterEach, describe, expect, it, vi } from "vitest";
import { BASE_API, apiClient, crearClienteHttp } from "@/api/cliente";
import { ErrorApi, ErrorConexion, esErrorApi } from "@/api/errores";

/**
 * Pruebas del cliente HTTP: el contrato de error y el transporte.
 *
 * Todas las respuestas son **falsas** (un `fetch` inyectado, sin red): lo que
 * se comprueba aquí es el contrato que la API ya publica (spec S6) — el
 * código manda, el mensaje se muestra, el `request_id` se propaga — y que el
 * cliente nunca inventa un código que la API no mandó.
 */

/** Llamada que registró el `fetch` falso. */
type Llamada = {
  url: string;
  metodo: string | undefined;
  cabeceras: Headers;
  cuerpo: string | undefined;
};

/**
 * `fetch` falso: devuelve la respuesta fijada y guarda la llamada.
 *
 * Acepta una fábrica porque el cuerpo de una respuesta se lee **una sola
 * vez**: si el mismo `Response` volviera en dos peticiones, la segunda
 * reventaría con "body has already been read".
 */
function fetchFalso(respuesta: Response | (() => Response)): {
  fetch: typeof fetch;
  llamadas: Llamada[];
} {
  const llamadas: Llamada[] = [];

  const impl = async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    llamadas.push({
      url: String(entrada),
      metodo: init?.method,
      cabeceras: new Headers(init?.headers),
      cuerpo: typeof init?.body === "string" ? init.body : undefined,
    });

    return typeof respuesta === "function" ? respuesta() : respuesta;
  };

  return { fetch: impl, llamadas };
}

/** Respuesta JSON con el cuerpo dado. */
function respuestaJson(
  estado: number,
  cuerpo: unknown,
  cabeceras: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "content-type": "application/json", ...cabeceras },
  });
}

/** Respuesta sin cuerpo (un 204 del borrado de un recurso). */
function respuestaSinCuerpo(estado: number): Response {
  return new Response(null, { status: estado });
}

/** Respuesta con un cuerpo que no es JSON (el HTML de un proxy, por ejemplo). */
function respuestaTexto(
  estado: number,
  texto: string,
  cabeceras: Record<string, string> = {},
): Response {
  return new Response(texto, {
    status: estado,
    headers: { "content-type": "text/html", ...cabeceras },
  });
}

/** Cuerpo del contrato único de error de la API. */
function cuerpoDeError(
  codigo: string,
  mensaje: string,
  extras: { detalles?: unknown; request_id?: string } = {},
): unknown {
  return {
    error: {
      codigo,
      mensaje,
      ...(extras.detalles === undefined ? {} : { detalles: extras.detalles }),
      ...(extras.request_id === undefined ? {} : { request_id: extras.request_id }),
    },
  };
}

/** Ejecuta la promesa y devuelve el error que lanza. */
async function errorDe(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
  } catch (error) {
    return error;
  }

  throw new Error("Se esperaba un error y la promesa se resolvió");
}

/** Verifica que el error es de la API y lo devuelve ya tipado. */
function comoErrorApi(error: unknown): ErrorApi {
  if (!esErrorApi(error)) {
    throw new Error(`Se esperaba un ErrorApi y se recibió: ${String(error)}`);
  }

  return error;
}

describe("cliente HTTP de Eventix", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("errores del contrato único", () => {
    it("convierte un 404 en un ErrorApi con su código, su mensaje y su request_id", async () => {
      const { fetch } = fetchFalso(
        respuestaJson(
          404,
          cuerpoDeError("no_encontrado", "No existe el evento", { request_id: "req-404" }),
        ),
      );
      const cliente = crearClienteHttp("/api", fetch);

      const error = comoErrorApi(await errorDe(cliente.obtener("/eventos/123")));

      expect(error.estado).toBe(404);
      expect(error.codigo).toBe("no_encontrado");
      expect(error.message).toBe("No existe el evento");
      expect(error.requestId).toBe("req-404");
    });

    it("convierte un 409 en un ErrorApi con sus detalles", async () => {
      const detalles = [{ campo: "email", mensaje: "Ya existe un documento con ese valor" }];
      const { fetch } = fetchFalso(
        respuestaJson(
          409,
          cuerpoDeError("conflicto", "El recurso ya existe", { detalles, request_id: "req-409" }),
        ),
      );
      const cliente = crearClienteHttp("/api", fetch);

      const error = comoErrorApi(await errorDe(cliente.obtener("/usuarios")));

      expect(error.estado).toBe(409);
      expect(error.codigo).toBe("conflicto");
      expect(error.detalles).toEqual(detalles);
    });

    it("convierte un 422 en un ErrorApi con el detalle por campo", async () => {
      const detalles = [
        { campo: "aforo_total", mensaje: "El aforo no puede ser negativo" },
        { campo: "nombre", mensaje: "El nombre es obligatorio", codigo: "too_small" },
      ];
      const { fetch } = fetchFalso(
        respuestaJson(
          422,
          cuerpoDeError("validacion", "Validación fallida", { detalles, request_id: "req-422" }),
        ),
      );
      const cliente = crearClienteHttp("/api", fetch);

      const error = comoErrorApi(await errorDe(cliente.crear("/eventos", { nombre: "" })));

      expect(error.estado).toBe(422);
      expect(error.codigo).toBe("validacion");
      expect(error.detalles?.[0]?.campo).toBe("aforo_total");
      expect(error.detalles?.[0]?.mensaje).toBe("El aforo no puede ser negativo");
      expect(error.detalles?.[1]?.codigo).toBe("too_small");
    });

    it("propaga el request_id del cuerpo por encima de la cabecera", async () => {
      const { fetch } = fetchFalso(
        respuestaJson(
          422,
          cuerpoDeError("validacion", "Validación fallida", { request_id: "req-cuerpo" }),
          { "x-request-id": "req-cabecera" },
        ),
      );
      const cliente = crearClienteHttp("/api", fetch);

      const error = comoErrorApi(await errorDe(cliente.obtener("/eventos")));

      expect(error.requestId).toBe("req-cuerpo");
    });

    it("usa el x-request-id de la cabecera cuando el cuerpo no trae request_id", async () => {
      const { fetch } = fetchFalso(
        respuestaJson(404, cuerpoDeError("no_encontrado", "No existe el evento"), {
          "x-request-id": "req-cabecera",
        }),
      );
      const cliente = crearClienteHttp("/api", fetch);

      const error = comoErrorApi(await errorDe(cliente.obtener("/eventos")));

      expect(error.requestId).toBe("req-cabecera");
    });

    it("no inventa un código cuando el cuerpo no es el contrato: lanza ErrorConexion", async () => {
      const { fetch } = fetchFalso(respuestaTexto(502, "<html><body>Bad Gateway</body></html>"));
      const cliente = crearClienteHttp("/api", fetch);

      const error = await errorDe(cliente.obtener("/eventos"));

      expect(error).toBeInstanceOf(ErrorConexion);
      expect(error).not.toBeInstanceOf(ErrorApi);
      expect(esErrorApi(error)).toBe(false);
    });

    it("no inventa un código cuando el JSON tiene otra forma: lanza ErrorConexion", async () => {
      const { fetch } = fetchFalso(respuestaJson(500, { mensaje: "algo salió mal" }));
      const cliente = crearClienteHttp("/api", fetch);

      const error = await errorDe(cliente.obtener("/eventos"));

      expect(error).toBeInstanceOf(ErrorConexion);
      expect(error).not.toBeInstanceOf(ErrorApi);
    });

    it("no inventa un código fuera del vocabulario: lanza ErrorConexion", async () => {
      const { fetch } = fetchFalso(respuestaJson(500, cuerpoDeError("inventado", "Error interno")));
      const cliente = crearClienteHttp("/api", fetch);

      const error = await errorDe(cliente.obtener("/eventos"));

      expect(error).toBeInstanceOf(ErrorConexion);
      expect(error).not.toBeInstanceOf(ErrorApi);
    });
  });

  describe("fallos de transporte", () => {
    it("un fetch que rechaza lanza ErrorConexion", async () => {
      const cliente = crearClienteHttp("/api", () =>
        Promise.reject(new TypeError("Failed to fetch")),
      );

      const error = await errorDe(cliente.obtener("/eventos"));

      expect(error).toBeInstanceOf(ErrorConexion);
      expect(error).not.toBeInstanceOf(ErrorApi);
    });
  });

  describe("peticiones", () => {
    it("devuelve el JSON parseado de un 200", async () => {
      const { fetch } = fetchFalso(respuestaJson(200, { _id: "abc", nombre: "Concierto" }));
      const cliente = crearClienteHttp("/api", fetch);

      const evento = await cliente.obtener<{ _id: string; nombre: string }>("/eventos/abc");

      expect(evento).toEqual({ _id: "abc", nombre: "Concierto" });
    });

    it("un 204 devuelve undefined y no revienta al parsear", async () => {
      const { fetch } = fetchFalso(respuestaSinCuerpo(204));
      const cliente = crearClienteHttp("/api", fetch);

      const resultado = await cliente.borrar("/eventos/abc");

      expect(resultado).toBeUndefined();
    });

    it("arma la URL con la base y serializa la query", async () => {
      const { fetch, llamadas } = fetchFalso(respuestaJson(200, []));
      const cliente = crearClienteHttp("/api", fetch);

      await cliente.obtener("/eventos", { query: { tipo: "academico", limite: 20, activo: true } });

      expect(llamadas[0]?.url).toBe("/api/eventos?tipo=academico&limite=20&activo=true");
    });

    it("los valores undefined y null de la query no viajan", async () => {
      const { fetch, llamadas } = fetchFalso(respuestaJson(200, []));
      const cliente = crearClienteHttp("/api", fetch);

      await cliente.obtener("/eventos", { query: { q: "rock", vacio: undefined, nada: null } });

      expect(llamadas[0]?.url).toBe("/api/eventos?q=rock");
    });

    it("POST y PATCH mandan el cuerpo como JSON", async () => {
      const { fetch, llamadas } = fetchFalso(() => respuestaJson(200, { ok: true }));
      const cliente = crearClienteHttp("/api", fetch);

      await cliente.crear("/eventos", { nombre: "Concierto" });
      await cliente.editar("/eventos/abc", { nombre: "Otro" });

      expect(llamadas[0]?.metodo).toBe("POST");
      expect(llamadas[0]?.cuerpo).toBe('{"nombre":"Concierto"}');
      expect(llamadas[0]?.cabeceras.get("content-type")).toBe("application/json");
      expect(llamadas[1]?.metodo).toBe("PATCH");
      expect(llamadas[1]?.cuerpo).toBe('{"nombre":"Otro"}');
      expect(llamadas[1]?.cabeceras.get("content-type")).toBe("application/json");
    });

    it("GET no manda Content-Type", async () => {
      const { fetch, llamadas } = fetchFalso(respuestaJson(200, []));
      const cliente = crearClienteHttp("/api", fetch);

      await cliente.obtener("/eventos");

      expect(llamadas[0]?.metodo).toBe("GET");
      expect(llamadas[0]?.cabeceras.has("content-type")).toBe(false);
      expect(llamadas[0]?.cabeceras.get("accept")).toBe("application/json");
    });

    it("DELETE usa el verbo del borrado", async () => {
      const { fetch, llamadas } = fetchFalso(respuestaSinCuerpo(204));
      const cliente = crearClienteHttp("/api", fetch);

      await cliente.borrar("/eventos/abc");

      expect(llamadas[0]?.metodo).toBe("DELETE");
      expect(llamadas[0]?.cuerpo).toBeUndefined();
    });

    it("un estado declarado como aceptado se lee como respuesta y no como error", async () => {
      const { fetch } = fetchFalso(
        respuestaJson(503, {
          status: "degraded",
          mongo: "down",
          version: "0.1.0",
          uptimeSeconds: 12,
        }),
      );
      const cliente = crearClienteHttp("/api", fetch);

      const salud = await cliente.obtener<{ status: string; mongo: string }>("/health", {
        estadosAceptados: [503],
      });

      expect(salud.status).toBe("degraded");
      expect(salud.mongo).toBe("down");
    });

    it("sin la excepción, ese mismo 503 es un fallo", async () => {
      const { fetch } = fetchFalso(respuestaJson(503, { status: "degraded", mongo: "down" }));
      const cliente = crearClienteHttp("/api", fetch);

      const error = await errorDe(cliente.obtener("/health"));

      expect(error).toBeInstanceOf(ErrorConexion);
    });

    it("el cliente por defecto usa el fetch global en el momento de la llamada", async () => {
      const { fetch, llamadas } = fetchFalso(respuestaJson(200, { status: "ok" }));
      vi.stubGlobal("fetch", fetch);

      const salud = await apiClient.obtener<{ status: string }>("/health");

      expect(salud).toEqual({ status: "ok" });
      expect(llamadas[0]?.url).toBe(`${BASE_API}/health`);
    });
  });

  describe("base de la API", () => {
    it("usa /api (el mismo origen) cuando no hay VITE_API_BASE", () => {
      const configurada = import.meta.env.VITE_API_BASE?.trim();

      expect(BASE_API).toBe(configurada === undefined || configurada === "" ? "/api" : configurada);
    });
  });

  describe("esErrorApi", () => {
    it("reconoce un ErrorApi y descarta lo que no lo es", async () => {
      const { fetch: conContrato } = fetchFalso(
        respuestaJson(404, cuerpoDeError("no_encontrado", "No existe", { request_id: "req-1" })),
      );
      const errorDeApi = await errorDe(crearClienteHttp("/api", conContrato).obtener("/eventos"));

      const { fetch: conHtml } = fetchFalso(respuestaTexto(500, "no soy json"));
      const errorDeTransporte = await errorDe(
        crearClienteHttp("/api", conHtml).obtener("/eventos"),
      );

      expect(esErrorApi(errorDeApi)).toBe(true);
      expect(esErrorApi(errorDeTransporte)).toBe(false);
      expect(esErrorApi(new Error("otro error"))).toBe(false);
      expect(esErrorApi(undefined)).toBe(false);
    });
  });
});
