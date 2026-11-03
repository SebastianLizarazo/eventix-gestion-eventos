import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Inicio } from "@/pantallas/inicio";

/**
 * Pruebas de la pantalla de inicio.
 *
 * La prueba no simula la API con un módulo mockeado: ** Intercepta el `fetch`
 * global con respuestas falsas que tienen la forma real del contrato. Así se
 * prueba la cadena completa —el cliente, los hooks y la pantalla— y no una
 * maqueta de la pantalla.
 */

/** Un evento del contrato, con sus tipos de ticket embebidos. */
const EVENTO = {
  _id: "65a0000000000000000000a1",
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
  tipos_ticket: [
    {
      _id: "65a0000000000000000000d1",
      nombre: "General",
      precio_cop: 120000,
      aforo_total: 200,
      aforo_vendido: 150,
      restricciones: {},
    },
  ],
  promociones: [],
  metricas_evento: { tickets_vendidos_total: 150, ingresos_cop: 18000000 },
  tags: [],
  creado_en: "2023-01-01T00:00:00.000Z",
  actualizado_en: "2023-01-01T00:00:00.000Z",
  _v: 0,
};

/** Cuerpo de la respuesta según la ruta que se pide. */
function cuerpoDe(url: string): unknown {
  if (url.includes("/health")) {
    return { status: "ok", mongo: "up", version: "0.1.0", uptimeSeconds: 125 };
  }

  if (url.includes("/tickets")) {
    return { items: [], total: 5200, skip: 0, limit: 1 };
  }

  if (url.includes("/usuarios")) {
    return { items: [], total: 1800, skip: 0, limit: 1 };
  }

  if (url.includes("/transacciones")) {
    return { items: [], total: 5200, skip: 0, limit: 1 };
  }

  if (url.includes("estado=publicado")) {
    return { items: [EVENTO], total: 157, skip: 0, limit: 5 };
  }

  if (url.includes("/eventos")) {
    return { items: [], total: 340, skip: 0, limit: 1 };
  }

  return { error: { codigo: "no_encontrado", mensaje: "Ruta sin respuesta", request_id: "req-1" } };
}

/** `fetch` falso: responde con el contrato real de la API, sin red. */
function fetchFalso(): typeof fetch {
  return async (entrada: RequestInfo | URL) =>
    new Response(JSON.stringify(cuerpoDe(String(entrada))), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
}

/** Cliente de React Query sin reintentos: una prueba no espera tres intentos. */
function clienteDePrueba(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

/** Renderiza la pantalla de inicio con su proveedor de consultas. */
function renderInicio() {
  return render(
    <QueryClientProvider client={clienteDePrueba()}>
      <Inicio />
    </QueryClientProvider>,
  );
}

describe("pantalla de inicio", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra el estado de la API, los conteos y los próximos eventos", async () => {
    vi.stubGlobal("fetch", fetchFalso());

    renderInicio();

    // La salud de la API.
    expect(await screen.findByText("Operativa")).toBeInTheDocument();
    expect(await screen.findByText("Conectado")).toBeInTheDocument();

    // Los conteos de las colecciones, con el formato local. Tickets y
    // transacciones tienen la misma cantidad, así que aparecen dos veces.
    expect(await screen.findByText("340")).toBeInTheDocument();
    expect(await screen.findByText("1.800")).toBeInTheDocument();
    expect(await screen.findAllByText("5.200")).toHaveLength(2);

    // El próximo evento, con su fecha en formato es-CO y su ocupación.
    expect(await screen.findByText("Concierto de rock")).toBeInTheDocument();
    expect(await screen.findByText("01/07/2023")).toBeInTheDocument();
    expect(await screen.findByText("150 / 200")).toBeInTheDocument();
  });
});
