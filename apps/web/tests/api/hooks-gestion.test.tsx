import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useBorrarEvento,
  useBorrarPromocion,
  useBorrarTipoTicket,
  useContrato,
  useCrearEvento,
  useCrearTipoTicket,
  useEditarEvento,
} from "@/api/hooks";
import type { CambiosEvento, EntradaEvento, EntradaTipoTicket } from "@/api/tipos";

/**
 * Pruebas de las mutaciones de la gestión de eventos.
 *
 * La red es falsa, pero no es una maqueta: el `fetch` global responde con la
 * forma real del contrato y **anota método, URL y cuerpo** de cada petición.
 * Lo que se comprueba aquí es lo que la gestión depende de verdad:
 *
 * - el alta y la edición van a las rutas que el contrato declara;
 * - la edición **manda la versión que se leyó**, que es lo que hace que el
 *   servidor pueda responder `409` cuando el documento cambió;
 * - los tipos de ticket y las promociones van contra el sub-recurso del
 *   evento, no contra una colección aparte.
 */

/** Identificador del evento de la prueba. */
const ID_EVENTO = "65a0000000000000000000a1";

/** Identificador del tipo de ticket de la prueba. */
const ID_TIPO = "65a0000000000000000000d1";

/** El evento que la API devuelve. */
const EVENTO = {
  _id: ID_EVENTO,
  slug: "concierto-de-rock",
  nombre: "Concierto de rock",
  tipo_evento: "masivo",
  fecha_inicio: "2026-03-15T00:00:00.000Z",
  fecha_fin: "2026-03-15T23:00:00.000Z",
  estado: "borrador",
  visibilidad: "publico",
  organizador_id: "65a0000000000000000000b1",
  lugar_id: "65a0000000000000000000c1",
  categorias: [],
  configuracion_evento: {},
  tipos_ticket: [],
  promociones: [],
  tags: [],
  creado_en: "2026-03-01T00:00:00.000Z",
  actualizado_en: "2026-03-01T00:00:00.000Z",
  _v: 7,
};

/** Una petición anotada: método, URL y cuerpo. */
type Peticion = {
  metodo: string;
  url: string;
  cuerpo: Record<string, unknown> | undefined;
};

/** Respuesta JSON con la cabecera que el cliente HTTP espera. */
function respuesta(cuerpo: unknown, estado: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "content-type": "application/json" },
  });
}

/** Red falsa: responde con la forma real del contrato y anota lo que se pidió. */
function crearRed() {
  const peticiones: Peticion[] = [];

  const fetchFalso = async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(entrada);
    const metodo = init?.method ?? "GET";
    const cuerpo =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;

    peticiones.push({ metodo, url, cuerpo });

    if (metodo === "DELETE") {
      return new Response(null, { status: 204 });
    }

    if (url.endsWith("/api/openapi.json")) {
      return respuesta(
        {
          openapi: "3.1.0",
          info: { title: "Eventix API", version: "0.1.0" },
          paths: {},
          components: { schemas: {} },
        },
        200,
      );
    }

    return respuesta(EVENTO, metodo === "POST" ? 201 : 200);
  };

  return { peticiones, fetchFalso };
}

/** Cliente de React Query sin reintentos: una prueba no espera tres intentos. */
function clienteDePrueba(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

/** Renderiza un hook con su proveedor de consultas. */
function renderConCliente<T>(callback: () => T) {
  const cliente = clienteDePrueba();

  function envoltorio({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
  }

  return renderHook(callback, { wrapper: envoltorio });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Mutaciones de la gestión de eventos", () => {
  it("el alta de un evento manda el cuerpo a POST /api/eventos", async () => {
    const { peticiones, fetchFalso } = crearRed();
    vi.stubGlobal("fetch", fetchFalso);

    const entrada: EntradaEvento = {
      nombre: "Concierto de rock",
      tipo_evento: "masivo",
      fecha_inicio: "2026-03-15T00:00:00.000Z",
      fecha_fin: "2026-03-15T23:00:00.000Z",
      organizador_id: "65a0000000000000000000b1",
      lugar_id: "65a0000000000000000000c1",
    };

    const { result } = renderConCliente(() => useCrearEvento());

    await act(async () => {
      await result.current.mutateAsync(entrada);
    });

    const peticion = peticiones[0];

    expect(peticion?.metodo).toBe("POST");
    expect(peticion?.url).toBe("/api/eventos");
    expect(peticion?.cuerpo?.nombre).toBe("Concierto de rock");
    expect(peticion?.cuerpo?.tipo_evento).toBe("masivo");
  });

  it("la edición de un evento manda la versión que se leyó", async () => {
    const { peticiones, fetchFalso } = crearRed();
    vi.stubGlobal("fetch", fetchFalso);

    const cambios: CambiosEvento = {
      nombre: "Concierto de rock",
      tipo_evento: "masivo",
      fecha_inicio: "2026-03-15T00:00:00.000Z",
      fecha_fin: "2026-03-15T23:00:00.000Z",
      estado: "publicado",
      visibilidad: "publico",
      organizador_id: "65a0000000000000000000b1",
      lugar_id: "65a0000000000000000000c1",
      categorias: [],
      tags: [],
      configuracion_evento: {},
      _v: 7,
    };

    const { result } = renderConCliente(() => useEditarEvento());

    await act(async () => {
      await result.current.mutateAsync({ id: ID_EVENTO, cambios });
    });

    const peticion = peticiones[0];

    expect(peticion?.metodo).toBe("PATCH");
    expect(peticion?.url).toBe(`/api/eventos/${ID_EVENTO}`);
    expect(peticion?.cuerpo?._v).toBe(7);
    expect(peticion?.cuerpo?.estado).toBe("publicado");
  });

  it("la baja de un evento borra el documento del evento", async () => {
    const { peticiones, fetchFalso } = crearRed();
    vi.stubGlobal("fetch", fetchFalso);

    const { result } = renderConCliente(() => useBorrarEvento());

    await act(async () => {
      await result.current.mutateAsync(ID_EVENTO);
    });

    const peticion = peticiones[0];

    expect(peticion?.metodo).toBe("DELETE");
    expect(peticion?.url).toBe(`/api/eventos/${ID_EVENTO}`);
  });

  it("el alta de un tipo de ticket va contra el sub-recurso del evento", async () => {
    const { peticiones, fetchFalso } = crearRed();
    vi.stubGlobal("fetch", fetchFalso);

    const entrada: EntradaTipoTicket = {
      nombre: "General",
      precio_cop: 120000,
      aforo_total: 200,
      restricciones: {},
    };

    const { result } = renderConCliente(() => useCrearTipoTicket(ID_EVENTO));

    await act(async () => {
      await result.current.mutateAsync(entrada);
    });

    const peticion = peticiones[0];

    expect(peticion?.metodo).toBe("POST");
    expect(peticion?.url).toBe(`/api/eventos/${ID_EVENTO}/tipos-ticket`);
    expect(peticion?.cuerpo?.precio_cop).toBe(120000);
  });

  it("la baja de un tipo de ticket va contra el sub-recurso del evento", async () => {
    const { peticiones, fetchFalso } = crearRed();
    vi.stubGlobal("fetch", fetchFalso);

    const { result } = renderConCliente(() => useBorrarTipoTicket(ID_EVENTO));

    await act(async () => {
      await result.current.mutateAsync(ID_TIPO);
    });

    const peticion = peticiones[0];

    expect(peticion?.metodo).toBe("DELETE");
    expect(peticion?.url).toBe(`/api/eventos/${ID_EVENTO}/tipos-ticket/${ID_TIPO}`);
  });

  it("la baja de una promoción va contra el sub-recurso del evento", async () => {
    const { peticiones, fetchFalso } = crearRed();
    vi.stubGlobal("fetch", fetchFalso);

    const { result } = renderConCliente(() => useBorrarPromocion(ID_EVENTO));

    await act(async () => {
      await result.current.mutateAsync("VERANO10");
    });

    const peticion = peticiones[0];

    expect(peticion?.metodo).toBe("DELETE");
    expect(peticion?.url).toBe(`/api/eventos/${ID_EVENTO}/promociones/VERANO10`);
  });

  it("el contrato se pide en /api/openapi.json", async () => {
    const { peticiones, fetchFalso } = crearRed();
    vi.stubGlobal("fetch", fetchFalso);

    const { result } = renderConCliente(() => useContrato());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.openapi).toBe("3.1.0");
    expect(peticiones[0]?.url).toBe("/api/openapi.json");
  });
});
