import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Reportes } from "@/pantallas/reportes";

/**
 * Pruebas del tablero de reportes.
 *
 * Se intercepta el `fetch` global con respuestas falsas que tienen la forma
 * real del contrato, así que se prueba la cadena completa —el cliente, los
 * hooks y la pantalla— y no una maqueta.
 *
 * La prueba que importa aquí es la del **evento elegido**: el dashboard en vivo
 * y la exportación de asistentes son de un evento, y el tablero es el que
 * reparte ese identificador a los dos paneles.
 */

/** Identificador del evento de la prueba. */
const ID_EVENTO = "65a0000000000000000000a1";

/** Un evento del contrato: es lo que devuelve la búsqueda del selector. */
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
  categorias: [],
  configuracion_evento: {},
  tipos_ticket: [],
  promociones: [],
  tags: [],
  creado_en: "2023-01-01T00:00:00.000Z",
  actualizado_en: "2023-01-01T00:00:00.000Z",
  _v: 0,
};

/** El dashboard live del evento. */
const DASHBOARD = {
  evento_id: ID_EVENTO,
  nombre: "Concierto de rock",
  slug: "concierto-de-rock",
  estado: "publicado",
  fecha_inicio: "2023-07-01T09:12:00.000Z",
  fecha_fin: "2023-07-01T12:00:00.000Z",
  metricas: { tickets_vendidos_total: 150, ingresos_cop: 18000000, ultima_actualizacion: null },
  tipos_ticket: [
    {
      tipo_ticket_id: "65a0000000000000000000d1",
      nombre: "General",
      precio_cop: 120000,
      aforo_total: 200,
      aforo_vendido: 150,
      ocupacion_pct: 75,
    },
  ],
  aforo_total: 200,
  aforo_vendido: 150,
  ocupacion_pct: 75,
};

/** El cierre contable de un día. */
const CIERRE = {
  desde: null,
  hasta: null,
  dias: [
    {
      dia: "2023-07-01",
      por_estado: {
        pendiente: { cantidad: 0, monto_cop: 0 },
        aprobada: { cantidad: 2, monto_cop: 150000 },
        rechazada: { cantidad: 0, monto_cop: 0 },
        anulada: { cantidad: 0, monto_cop: 0 },
        reembolsada: { cantidad: 0, monto_cop: 0 },
      },
      neto_cop: 150000,
    },
  ],
  pendientes_sin_confirmar: { cantidad: 0, monto_cop: 0 },
  totales: { cantidad: 2, monto_cop: 150000, neto_cop: 150000 },
};

/** El ranking de más vendidos. */
const RANKING = {
  items: [
    {
      evento_id: ID_EVENTO,
      nombre: "Festival de verano",
      slug: "festival-de-verano",
      estado: "publicado",
      fecha_inicio: "2023-07-01T16:00:00.000Z",
      tickets_vendidos_total: 120,
      ingresos_cop: 9000000,
      aforo_total: 200,
      aforo_vendido: 120,
      ocupacion_pct: 60,
      tipos_ticket: [],
    },
  ],
  limite: 10,
};

/** Un asistente en la exportación. */
const ASISTENTE = {
  ticket_id: "65a0000000000000000000e1",
  codigo_qr: "QR-EMITIDO-1",
  estado: "emitido",
  tipo_ticket: { tipo_ticket_id: "65a0000000000000000000d1", nombre: "General", precio_cop: 120000 },
  asistente: {
    usuario_id: "65a0000000000000000000b2",
    nombre: "Ana Asistente",
    documento_identidad: "CC-1000001",
    email: "asistente@eventix.test",
  },
  precio_pagado_cop: 120000,
  promocion_aplicada_codigo: null,
  emitido_en: "2023-07-01T10:00:00.000Z",
  validado_en: null,
};

/** Red falsa: responde con la forma real del contrato y anota lo que se pidió. */
function crearRed() {
  const peticiones: string[] = [];

  const cuerpoDe = (url: string): unknown => {
    if (url.includes("/reportes/eventos/")) {
      return DASHBOARD;
    }

    if (url.includes("/reportes/cierre-contable")) {
      return CIERRE;
    }

    if (url.includes("/reportes/mas-vendidos")) {
      return RANKING;
    }

    if (url.includes("/reportes/asistentes/")) {
      return { items: [ASISTENTE], total: 1, skip: 0, limit: 25 };
    }

    if (url.includes("/api/eventos")) {
      return { items: [EVENTO], total: 1, skip: 0, limit: 20 };
    }

    return {
      error: { codigo: "no_encontrado", mensaje: "Ruta sin respuesta", request_id: "req-1" },
    };
  };

  const fetchFalso = async (entrada: RequestInfo | URL): Promise<Response> => {
    const url = String(entrada);

    peticiones.push(url);

    return new Response(JSON.stringify(cuerpoDe(url)), {
      status: 200,
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

/** Renderiza el tablero de reportes dentro del enrutador. */
function renderTablero() {
  const cliente = clienteDePrueba();

  function Envoltura({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
  }

  return render(
    <Envoltura>
      <MemoryRouter>
        <Reportes />
      </MemoryRouter>
    </Envoltura>,
  );
}

/**
 * Elige el evento en el selector.
 *
 * Primero hay que **esperar a que la lista exista**: el desplegable arranca con
 * la opción de «Elige un evento» y un `change` a un valor que el desplegable
 * todavía no tiene no cambia nada (y no dispara el `onChange`).
 */
async function elegirEvento() {
  await screen.findByRole("option", { name: /Concierto de rock/ });

  fireEvent.change(screen.getByLabelText("Evento"), { target: { value: ID_EVENTO } });
}

describe("tablero de reportes", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra los cuatro reportes del modelo", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderTablero();

    // El selector de evento: es el que reparte el evento a los dos paneles
    // que son de un evento.
    expect(screen.getByLabelText("Buscar evento")).toBeInTheDocument();
    expect(screen.getByLabelText("Evento")).toBeInTheDocument();

    await elegirEvento();

    expect(await screen.findByText("Dashboard en vivo")).toBeInTheDocument();
    expect(screen.getByText("Cierre por día")).toBeInTheDocument();
    expect(screen.getByText("Eventos más vendidos")).toBeInTheDocument();
    // La exportación de asistentes, con los datos del snapshot del ticket.
    expect(await screen.findByText("Ana Asistente")).toBeInTheDocument();
  });

  it("no consulta el dashboard ni los asistentes sin evento elegido", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderTablero();

    // Los dos reportes globales sí se piden: no dependen de ningún evento.
    await waitFor(() =>
      expect(peticiones.some((url) => url.includes("/api/reportes/cierre-contable"))).toBe(true),
    );

    expect(peticiones.some((url) => url.includes("/api/reportes/eventos/"))).toBe(false);
    expect(peticiones.some((url) => url.includes("/api/reportes/asistentes"))).toBe(false);
  });

  it("reparte el evento elegido al dashboard y a los asistentes", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderTablero();

    await elegirEvento();

    await waitFor(() =>
      expect(
        peticiones.some((url) => url.includes(`/api/reportes/eventos/${ID_EVENTO}/dashboard`)),
      ).toBe(true),
    );

    expect(
      peticiones.some((url) => url.includes(`/api/reportes/asistentes/${ID_EVENTO}`)),
    ).toBe(true);
  });
});
