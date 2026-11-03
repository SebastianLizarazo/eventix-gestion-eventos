import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCrearPromocion, useEvento, useEventos, usePromociones } from "@/api/hooks";

/**
 * Pruebas de los hooks de eventos.
 *
 * Se intercepta el `fetch` global con respuestas falsas que tienen la forma real
 * del contrato: así se prueba la cadena completa —el cliente, los hooks y la
 * caché— y no una maqueta del hook.
 */

/** Identificador del evento de la prueba. */
const ID_EVENTO = "65a0000000000000000000a1";

/** Un evento del contrato. */
const EVENTO = {
  _id: ID_EVENTO,
  slug: "concierto-de-rock",
  nombre: "Concierto de rock",
  tipo_evento: "masivo",
  fecha_inicio: "2023-07-01T09:12:00.000Z",
  fecha_fin: "2023-07-01T12:00:00.000Z",
  estado: "publicado",
  visibilidad: "publico",
  organizador_id: "65a0000000000000000000b1",
  lugar_id: "65a0000000000000000000c1",
  categorias: ["musica"],
  configuracion_evento: {},
  tipos_ticket: [],
  promociones: [],
  tags: [],
  creado_en: "2023-01-01T00:00:00.000Z",
  actualizado_en: "2023-01-01T00:00:00.000Z",
  _v: 0,
};

/** Una promoción del contrato. */
const PROMOCION = {
  codigo: "VERANO10",
  tipo: "porcentaje",
  valor: 10,
  aplica_a_tipo_ticket_ids: ["65a0000000000000000000d1"],
  vigencia_inicio: "2023-06-01T00:00:00.000Z",
  vigencia_fin: "2023-07-01T00:00:00.000Z",
  usos_maximos: 100,
  usos_realizados: 12,
  activo: true,
};

/** Red falsa: responde con la forma real del contrato y anota lo que se pidió. */
function crearRed() {
  const peticiones: string[] = [];

  const cuerpoDe = (url: string, metodo: string): unknown => {
    if (metodo === "POST") {
      return PROMOCION;
    }

    if (url.endsWith("/promociones")) {
      return [PROMOCION];
    }

    if (url.includes(`/eventos/${ID_EVENTO}`)) {
      return EVENTO;
    }

    if (url.includes("/eventos")) {
      return { items: [EVENTO], total: 1, skip: 0, limit: 12 };
    }

    return {
      error: { codigo: "no_encontrado", mensaje: "Ruta sin respuesta", request_id: "req-1" },
    };
  };

  const fetchFalso = async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(entrada);
    const metodo = init?.method ?? "GET";

    peticiones.push(`${metodo} ${url}`);

    return new Response(JSON.stringify(cuerpoDe(url, metodo)), {
      status: metodo === "POST" ? 201 : 200,
      headers: { "content-type": "application/json" },
    });
  };

  return { peticiones, fetchFalso };
}

/** Cliente de React Query sin reintentos: una prueba no espera tres intentos. */
function clienteDePrueba(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

/** Envoltura de las pruebas: el proveedor con un cliente propio de cada prueba. */
function envoltorio(cliente: QueryClient) {
  return function Envoltura({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
  };
}

describe("hooks de eventos", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("manda los filtros del catálogo en la query de la lista", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    const { result } = renderHook(
      () => useEventos({ tipo_evento: "masivo", estado: "publicado", limit: 12, skip: 24 }),
      { wrapper: envoltorio(clienteDePrueba()) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const peticion = peticiones.find((url) => url.includes("/api/eventos"));

    expect(peticion).toBeDefined();
    expect(peticion).toContain("tipo_evento=masivo");
    expect(peticion).toContain("estado=publicado");
    expect(peticion).toContain("limit=12");
    expect(peticion).toContain("skip=24");
  });

  it("pide el evento por su identificador", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    const { result } = renderHook(() => useEvento(ID_EVENTO), {
      wrapper: envoltorio(clienteDePrueba()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.nombre).toBe("Concierto de rock");
    expect(peticiones.some((url) => url.includes(`/api/eventos/${ID_EVENTO}`))).toBe(true);
  });

  it("pide las promociones del evento", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    const { result } = renderHook(() => usePromociones(ID_EVENTO), {
      wrapper: envoltorio(clienteDePrueba()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0]?.codigo).toBe("VERANO10");
    expect(peticiones.some((url) => url.endsWith(`/api/eventos/${ID_EVENTO}/promociones`))).toBe(true);
  });

  it("invalida la caché del evento cuando se crea una promoción", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    const cliente = clienteDePrueba();
    const { result } = renderHook(
      () => ({ evento: useEvento(ID_EVENTO), crear: useCrearPromocion(ID_EVENTO) }),
      { wrapper: envoltorio(cliente) },
    );

    await waitFor(() => expect(result.current.evento.isSuccess).toBe(true));

    const lecturasAntes = peticiones.filter((url) =>
      url.includes(`/api/eventos/${ID_EVENTO}`),
    ).length;

    await result.current.crear.mutateAsync({
      codigo: "VERANO10",
      tipo: "porcentaje",
      valor: 10,
      aplica_a_tipo_ticket_ids: [],
      vigencia_inicio: "2023-06-01T00:00:00.000Z",
      vigencia_fin: "2023-07-01T00:00:00.000Z",
      activo: true,
    });

    await waitFor(() =>
      expect(
        peticiones.filter((url) => url.includes(`/api/eventos/${ID_EVENTO}`)).length,
      ).toBeGreaterThan(lecturasAntes),
    );
  });
});
