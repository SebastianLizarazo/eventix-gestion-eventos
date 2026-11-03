import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PanelDashboard } from "@/pantallas/reportes/dashboard";

/**
 * Pruebas del panel del dashboard en vivo de un evento.
 *
 * La red es falsa, pero no es una maqueta: el `fetch` global responde con la
 * forma real del contrato y **anota la URL de cada petición**. Así se prueba
 * la cadena completa —el cliente, los hooks y el panel— y además se puede
 * afirmar que sin evento elegido no sale ninguna petición.
 */

/** Identificador del evento de la prueba. */
const ID_EVENTO = "65a0000000000000000000a1";

/**
 * El dashboard que devuelve la API: la forma real del contrato.
 *
 * Los números cuadran entre sí: el aforo del evento es la suma de los aforos
 * de sus tipos, la ocupación es la de la API (con dos decimales) y los ingresos
 * son lo que se vendió a cada precio. El tipo "Campo" venden 80 de 300, que es
 * 26,67 %, y es el caso que obliga a que la interfaz use el formateador del
 * locale en vez de escribir el número a mano.
 */
const DASHBOARD = {
  evento_id: ID_EVENTO,
  nombre: "Concierto de rock",
  slug: "concierto-de-rock",
  estado: "publicado",
  fecha_inicio: "2023-07-01T09:12:00.000Z",
  fecha_fin: "2023-07-01T12:00:00.000Z",
  metricas: {
    tickets_vendidos_total: 240,
    ingresos_cop: 25300000,
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
    {
      tipo_ticket_id: "65a0000000000000000000d2",
      nombre: "VIP",
      precio_cop: 250000,
      aforo_total: 50,
      aforo_vendido: 10,
      ocupacion_pct: 20,
    },
    {
      tipo_ticket_id: "65a0000000000000000000d3",
      nombre: "Campo",
      precio_cop: 60000,
      aforo_total: 300,
      aforo_vendido: 80,
      ocupacion_pct: 26.67,
    },
  ],
  aforo_total: 550,
  aforo_vendido: 240,
  ocupacion_pct: 43.64,
};

/** El error que devuelve la API cuando el evento no existe. */
const ERROR_API = {
  error: {
    codigo: "no_encontrado",
    mensaje: "No se encontró el evento solicitado",
    request_id: "req-dashboard-1",
  },
};

/** Red falsa: responde con la forma real del contrato y anota lo que se pidió. */
function crearRed(cuerpo: unknown, estado = 200) {
  const peticiones: string[] = [];

  const fetchFalso = async (entrada: RequestInfo | URL): Promise<Response> => {
    peticiones.push(String(entrada));

    return new Response(JSON.stringify(cuerpo), {
      status: estado,
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

/** Renderiza el panel con su proveedor de consultas. */
function renderPanel(eventoId: string | null) {
  return render(
    <QueryClientProvider client={clienteDePrueba()}>
      <PanelDashboard eventoId={eventoId} />
    </QueryClientProvider>,
  );
}

describe("panel del dashboard en vivo", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra las métricas del evento y la ocupación de cada tipo de ticket", async () => {
    const { peticiones, fetchFalso } = crearRed(DASHBOARD);

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel(ID_EVENTO);

    // El evento y su estado, con el vocabulario del dominio en español.
    expect(await screen.findByText("Concierto de rock")).toBeInTheDocument();
    expect(screen.getByText("Publicado")).toBeInTheDocument();

    // Las métricas del evento.
    expect(screen.getByText("Tickets vendidos")).toBeInTheDocument();
    expect(screen.getByText("240")).toBeInTheDocument();
    expect(screen.getByText("Ingresos")).toBeInTheDocument();
    expect(screen.getByText("COP 25.300.000")).toBeInTheDocument();
    expect(screen.getByText("Ocupación total")).toBeInTheDocument();
    expect(screen.getByText("43,64 %")).toBeInTheDocument();
    expect(screen.getByText("Aforo")).toBeInTheDocument();
    expect(screen.getByText("240 / 550")).toBeInTheDocument();

    // Las fechas del evento, con su hora.
    expect(screen.getByText("Comienza")).toBeInTheDocument();
    expect(screen.getByText("01/07/2023 09:12")).toBeInTheDocument();
    expect(screen.getByText("Termina")).toBeInTheDocument();
    expect(screen.getByText("01/07/2023 12:00")).toBeInTheDocument();

    // Sin métricas calculadas no hay última actualización: es un dato ausente,
    // no un error.
    const filaActualizacion = screen.getByText("Última actualización").parentElement;

    expect(filaActualizacion).toHaveTextContent("—");

    // La ocupación de cada tipo de ticket, con su precio y su aforo.
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("COP 120.000")).toBeInTheDocument();
    expect(screen.getByText("150 / 200")).toBeInTheDocument();
    expect(screen.getByText("75 %")).toBeInTheDocument();

    expect(screen.getByText("VIP")).toBeInTheDocument();
    expect(screen.getByText("COP 250.000")).toBeInTheDocument();
    expect(screen.getByText("10 / 50")).toBeInTheDocument();
    expect(screen.getByText("20 %")).toBeInTheDocument();

    // El decimal es del locale `es-CO`: la coma, no el punto.
    expect(screen.getByText("Campo")).toBeInTheDocument();
    expect(screen.getByText("COP 60.000")).toBeInTheDocument();
    expect(screen.getByText("80 / 300")).toBeInTheDocument();
    expect(screen.getByText("26,67 %")).toBeInTheDocument();

    // La consulta va al endpoint del dashboard, y solo a ese.
    expect(peticiones).toEqual([`/api/reportes/eventos/${ID_EVENTO}/dashboard`]);
  });

  it("sin evento elegido no pide nada y pide un evento", async () => {
    const { peticiones, fetchFalso } = crearRed(DASHBOARD);

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel(null);

    expect(await screen.findByText(/elige un evento/i)).toBeInTheDocument();

    // Se deja pasar un turno completo: si la consulta se disparara, la
    // petición ya habría salido.
    await act(async () => {
      await new Promise((resolver) => setTimeout(resolver, 0));
    });

    expect(peticiones).toHaveLength(0);
  });

  it("cuando la API falla muestra el aviso de error con el mensaje de la API", async () => {
    const { fetchFalso } = crearRed(ERROR_API, 404);

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel(ID_EVENTO);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("No se encontró el evento solicitado")).toBeInTheDocument();

    // El identificador de la petición: es la llave para encontrar el fallo en
    // el log del servidor.
    expect(screen.getByText("req-dashboard-1")).toBeInTheDocument();
  });

  it("sin tipos de ticket muestra el estado vacío en la tabla", async () => {
    const { fetchFalso } = crearRed({ ...DASHBOARD, tipos_ticket: [] });

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel(ID_EVENTO);

    expect(await screen.findByText("Ocupación por tipo de ticket")).toBeInTheDocument();
    expect(screen.getByText(/no tiene tipos de ticket/i)).toBeInTheDocument();
  });
});
