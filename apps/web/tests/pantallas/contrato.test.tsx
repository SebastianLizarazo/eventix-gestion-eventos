import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openapi } from "../../../api/src/http/openapi";
import { formatearNumero } from "@/formato/es-co";
import { Contrato } from "@/pantallas/contrato";

/**
 * Pruebas de la pantalla del contrato de la API.
 *
 * La primera parte renderiza la pantalla **contra el documento real**: el
 * mismo generador que la API sirve en `/api/openapi.json`. Ningún número
 * esperado está escrito a mano: los conteos, las rutas, los esquemas y los
 * códigos de error se leen del documento, así que la prueba falla si la
 * pantalla deja de mostrar lo que el servidor publica.
 *
 * La segunda parte intercepta el `fetch` global con respuestas falsas: así se
 * prueba la cadena completa —el cliente, el hook y la pantalla— y no una
 * maqueta.
 */

/**
 * Un esquema del documento, leído sin el tipo estricto del contrato.
 *
 * El contrato de la API declara sus esquemas como un mapa de valores libres,
 * así que la prueba los lee con una forma propia: lo que le importa es qué
 * declara el documento, no cómo lo tipó el servidor.
 */
type EsquemaDelDocumento = {
  type?: string | string[];
  properties?: Record<string, EsquemaDelDocumento>;
  items?: EsquemaDelDocumento;
  enum?: unknown[];
};

/** Los esquemas del documento real, sin estrechar el tipo del contrato. */
const esquemas = openapi.components.schemas as unknown as Record<string, EsquemaDelDocumento>;

/** Los métodos HTTP que el contrato declara en cada ruta. */
const METODOS = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];

/**
 * Los métodos que declara una ruta.
 *
 * El conteo de operaciones sale de los **métodos**, no de las claves sueltas
 * del documento: una ruta puede declarar cosas que no son operaciones.
 */
function metodosDe(operaciones: Record<string, unknown>): string[] {
  return Object.keys(operaciones).filter((metodo) => METODOS.includes(metodo));
}

/** La operación que el documento declara para una ruta y un método. */
function operacionDe(ruta: string, metodo: string) {
  return openapi.paths[ruta]?.[metodo];
}

/**
 * Un contrato de mentira, con la forma del documento real.
 *
 * Sirve para comprobar que la pantalla muestra **lo que le llega**: si las
 * rutas o los esquemas estuvieran escritos a mano en la interfaz, este
 * contrato no aparecería en pantalla.
 */
const CONTRATO_FALSO = {
  openapi: "3.1.0",
  info: {
    title: "API de prueba",
    version: "9.9.9",
    description: "Un contrato de mentira, con una sola ruta.",
  },
  paths: {
    "/saludo": {
      get: {
        summary: "Saluda a quien pregunte",
        description: "La operación de prueba del contrato de mentira.",
        tags: ["saludo"],
        parameters: [{ name: "quien", in: "query", description: "A quién saluda" }],
        responses: {},
      },
    },
  },
  components: {
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: { codigo: { type: "string", enum: ["peticion_invalida"] } },
          },
        },
      },
    },
  },
};

/** El error del contrato único, con su identificador de petición. */
const ERROR_FALSO = {
  error: {
    codigo: "error_interno",
    mensaje: "El contrato no se pudo leer",
    request_id: "req-contrato-1",
  },
};

/** Un `fetch` falso que responde con el cuerpo dado. */
function fetchCon(cuerpo: unknown, estado = 200): typeof fetch {
  return async () =>
    new Response(JSON.stringify(cuerpo), {
      status: estado,
      headers: { "content-type": "application/json" },
    });
}

/** Cliente de React Query sin reintentos: una prueba no espera tres intentos. */
function clienteDePrueba(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

/** Renderiza la pantalla con su proveedor de consultas. */
function renderPantalla() {
  return render(
    <QueryClientProvider client={clienteDePrueba()}>
      <Contrato />
    </QueryClientProvider>,
  );
}

describe("pantalla del contrato de la API", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra los conteos de rutas y operaciones que calcula del documento", async () => {
    vi.stubGlobal("fetch", fetchCon(openapi));

    renderPantalla();

    const rutas = Object.keys(openapi.paths).length;
    const operaciones = Object.values(openapi.paths).reduce(
      (total, operacionesDeRuta) => total + metodosDe(operacionesDeRuta).length,
      0,
    );

    expect(await screen.findByText(`${formatearNumero(rutas)} rutas`)).toBeInTheDocument();
    expect(
      await screen.findByText(`${formatearNumero(operaciones)} operaciones`),
    ).toBeInTheDocument();
  });

  it("lista todas las plantillas de ruta que declara el documento", async () => {
    vi.stubGlobal("fetch", fetchCon(openapi));

    renderPantalla();

    const plantillas = Object.keys(openapi.paths);

    // La primera ruta espera a que el documento llegue; las demás ya están.
    expect(await screen.findByText(plantillas[0] ?? "")).toBeInTheDocument();

    for (const plantilla of plantillas) {
      expect(screen.getByText(plantilla)).toBeInTheDocument();
    }
  });

  it("muestra el esquema de cada colección con sus campos", async () => {
    vi.stubGlobal("fetch", fetchCon(openapi));

    renderPantalla();

    for (const nombre of ["Usuario", "Lugar", "Evento", "Ticket", "Transaccion", "Auditoria"]) {
      expect(await screen.findByRole("heading", { name: nombre })).toBeInTheDocument();
    }

    // Los campos que se comprueban son claves reales del esquema publicado.
    expect(esquemas.Usuario?.properties?.email_normalizado).toBeDefined();
    expect(esquemas.Auditoria?.properties?.ocurrido_en).toBeDefined();

    expect(screen.getByText("email_normalizado")).toBeInTheDocument();
    expect(screen.getByText("ocurrido_en")).toBeInTheDocument();
  });

  it("muestra los códigos de error que declara el contrato", async () => {
    vi.stubGlobal("fetch", fetchCon(openapi));

    renderPantalla();

    const codigos = esquemas.Error?.properties?.error?.properties?.codigo?.enum ?? [];

    expect(codigos.length).toBeGreaterThan(0);

    for (const codigo of codigos) {
      expect(await screen.findByText(String(codigo))).toBeInTheDocument();
    }

    // Y, cuando el documento la trae, la descripción de la respuesta que
    // produce el código.
    const respuesta = openapi.paths["/usuarios"]?.["get"]?.responses?.["404"] as
      { description?: string } | undefined;

    if (respuesta?.description === undefined) {
      throw new Error("El contrato no describe la respuesta de recurso inexistente");
    }

    expect(await screen.findByText(respuesta.description)).toBeInTheDocument();
  });

  it("muestra los parámetros de una operación con su nombre y su lugar", async () => {
    vi.stubGlobal("fetch", fetchCon(openapi));

    renderPantalla();

    const parametros = operacionDe("/lugares/cerca", "get")?.parameters ?? [];
    const nombre = parametros[0]?.nombre;
    const lugar = parametros[0]?.en;

    if (nombre === undefined || lugar === undefined) {
      throw new Error("El contrato no declara los parámetros de la operación");
    }

    // Los parámetros se muestran dentro de la ruta que los declara.
    const plantilla = await screen.findByText("/lugares/cerca");
    const bloque = within(plantilla.closest("li") as HTMLElement);

    expect(bloque.getByText(nombre)).toBeInTheDocument();
    expect(bloque.getAllByText(lugar).length).toBeGreaterThan(0);
    expect(bloque.getAllByText("requerido").length).toBeGreaterThan(0);
  });

  it("muestra el método y el resumen de una operación como los declara el documento", async () => {
    vi.stubGlobal("fetch", fetchCon(openapi));

    renderPantalla();

    const resumen = operacionDe("/usuarios", "get")?.summary;

    if (resumen === undefined) {
      throw new Error("El contrato no declara la operación de listado de usuarios");
    }

    expect(await screen.findByText(resumen)).toBeInTheDocument();
    expect(screen.getAllByText("GET").length).toBeGreaterThan(0);
  });
});

describe("pantalla del contrato con una respuesta falsa", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra el documento que le llega", async () => {
    vi.stubGlobal("fetch", fetchCon(CONTRATO_FALSO));

    renderPantalla();

    expect(await screen.findByText("API de prueba")).toBeInTheDocument();
    expect(screen.getByText("/saludo")).toBeInTheDocument();
    expect(screen.getByText("Saluda a quien pregunte")).toBeInTheDocument();
  });

  it("muestra el error del contrato con su mensaje y su identificador de petición", async () => {
    vi.stubGlobal("fetch", fetchCon(ERROR_FALSO, 500));

    renderPantalla();

    expect(await screen.findByText("El contrato no se pudo leer")).toBeInTheDocument();
    expect(screen.getByText("req-contrato-1")).toBeInTheDocument();
  });
});
