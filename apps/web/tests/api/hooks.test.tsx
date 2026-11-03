import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAsistentes, useCierreContable, useCrearPromocion, useDashboardEvento, useEvento, useEventos, usePromociones, useRankingVendidos } from "@/api/hooks";

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

/**
 * El dashboard live del evento, con la forma real del contrato.
 *
 * La ocupación viene con dos decimales (75 no, 26.67 sí): es un porcentaje
 * calculado, no un entero.
 */
const DASHBOARD = {
  evento_id: ID_EVENTO,
  nombre: "Concierto de rock",
  slug: "concierto-de-rock",
  estado: "publicado",
  fecha_inicio: "2023-07-01T09:12:00.000Z",
  fecha_fin: "2023-07-01T12:00:00.000Z",
  metricas: {
    tickets_vendidos_total: 150,
    ingresos_cop: 18000000,
    ultima_actualizacion: null,
  },
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

/** El cierre contable de un día, con los cinco estados siempre presentes. */
const CIERRE = {
  desde: null,
  hasta: null,
  dias: [
    {
      dia: "2023-07-01",
      por_estado: {
        pendiente: { cantidad: 0, monto_cop: 0 },
        aprobada: { cantidad: 2, monto_cop: 150000 },
        rechazada: { cantidad: 1, monto_cop: 0 },
        anulada: { cantidad: 0, monto_cop: 0 },
        reembolsada: { cantidad: 0, monto_cop: 0 },
      },
      neto_cop: 150000,
    },
  ],
  pendientes_sin_confirmar: { cantidad: 1, monto_cop: 10000 },
  totales: { cantidad: 3, monto_cop: 150000, neto_cop: 150000 },
};

/** El ranking de más vendidos. */
const RANKING = {
  items: [
    {
      evento_id: ID_EVENTO,
      nombre: "Concierto de rock",
      slug: "concierto-de-rock",
      estado: "publicado",
      fecha_inicio: "2023-07-01T09:12:00.000Z",
      tickets_vendidos_total: 150,
      ingresos_cop: 18000000,
      aforo_total: 200,
      aforo_vendido: 150,
      ocupacion_pct: 75,
      tipos_ticket: DASHBOARD.tipos_ticket,
    },
  ],
  limite: 10,
};

/** Un asistente en la exportación, con los snapshots que guarda el ticket. */
const ASISTENTE = {
  ticket_id: "65a0000000000000000000e1",
  codigo_qr: "QR-EMITIDO-1",
  estado: "emitido",
  tipo_ticket: {
    tipo_ticket_id: "65a0000000000000000000d1",
    nombre: "General",
    precio_cop: 120000,
  },
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

  const cuerpoDe = (url: string, metodo: string): unknown => {
    if (metodo === "POST") {
      return PROMOCION;
    }

    if (url.endsWith("/promociones")) {
      return [PROMOCION];
    }

    // Los reportes van **antes** que los eventos: la ruta del dashboard
    // contiene `/eventos`, y sin este orden la devolvería el evento.
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
      return { items: [ASISTENTE], total: 1, skip: 0, limit: 50 };
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

describe("hooks de reportes", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("pide el dashboard live del evento que se le indica", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    const { result } = renderHook(() => useDashboardEvento(ID_EVENTO), {
      wrapper: envoltorio(clienteDePrueba()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.nombre).toBe("Concierto de rock");
    expect(result.current.data?.ocupacion_pct).toBe(75);
    expect(
      peticiones.some((url) => url.endsWith(`/api/reportes/eventos/${ID_EVENTO}/dashboard`)),
    ).toBe(true);
  });

  it("pide el cierre contable con el rango que se le indica", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    const { result } = renderHook(
      () => useCierreContable({ desde: "2023-07-01", hasta: "2023-07-31" }),
      { wrapper: envoltorio(clienteDePrueba()) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const peticion = peticiones.find((url) => url.includes("/api/reportes/cierre-contable"));

    expect(peticion).toBeDefined();
    expect(peticion).toContain("desde=2023-07-01");
    expect(peticion).toContain("hasta=2023-07-31");
  });

  it("no manda rango al cierre contable cuando no se filtra", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    const { result } = renderHook(() => useCierreContable(), {
      wrapper: envoltorio(clienteDePrueba()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const peticion = peticiones.find((url) => url.includes("/api/reportes/cierre-contable"));

    expect(peticion).toBeDefined();
    expect(peticion).not.toContain("desde=");
    expect(peticion).not.toContain("hasta=");
  });

  it("pide el ranking con el límite que se le indica", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    const { result } = renderHook(() => useRankingVendidos(5), {
      wrapper: envoltorio(clienteDePrueba()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const peticion = peticiones.find((url) => url.includes("/api/reportes/mas-vendidos"));

    expect(peticion).toBeDefined();
    expect(peticion).toContain("limite=5");
    expect(result.current.data?.items[0]?.nombre).toBe("Concierto de rock");
  });

  it("pide los asistentes con su filtro y su paginación", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    const { result } = renderHook(
      () => useAsistentes(ID_EVENTO, { estado: "usado", skip: 20, limit: 10 }),
      { wrapper: envoltorio(clienteDePrueba()) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const peticion = peticiones.find((url) => url.includes("/api/reportes/asistentes/"));

    expect(peticion).toBeDefined();
    expect(peticion).toContain("estado=usado");
    expect(peticion).toContain("skip=20");
    expect(peticion).toContain("limit=10");
    expect(result.current.data?.items[0]?.codigo_qr).toBe("QR-EMITIDO-1");
  });

  it("no pide asistentes cuando todavía no hay evento", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    const { result } = renderHook(() => useAsistentes(null), {
      wrapper: envoltorio(clienteDePrueba()),
    });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));

    expect(peticiones.some((url) => url.includes("/api/reportes/asistentes"))).toBe(false);
  });
});
