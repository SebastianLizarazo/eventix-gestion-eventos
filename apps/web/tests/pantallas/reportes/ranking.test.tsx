import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PanelRanking } from "@/pantallas/reportes/ranking";

/**
 * Pruebas del ranking de los eventos más vendidos.
 *
 * Igual que en el resto de pantallas, la API no se simula con un módulo
 * mockeado: **se intercepta el `fetch` global** con respuestas falsas que
 * tienen la forma real del contrato. Así se prueba la cadena completa —el
 * cliente, los hooks y la pantalla— y no una maqueta.
 *
 * La pantalla usa `Link`, así que se renderiza dentro de un `MemoryRouter`.
 */

/** Identificador del primer evento del ranking. */
const ID_EVENTO = "65a0000000000000000000a1";

/** Identificador del segundo evento del ranking. */
const ID_OTRO_EVENTO = "65a0000000000000000000a2";

/**
 * El ranking de la prueba: dos eventos operativos con sus ventas.
 *
 * El segundo evento trae `ocupacion_pct: 26.67`, que es el caso que separa a
 * la coma decimal de `es-CO` del punto decimal.
 */
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
      tipos_ticket: [
        {
          tipo_ticket_id: "65a0000000000000000000d1",
          nombre: "General",
          precio_cop: 75000,
          aforo_total: 200,
          aforo_vendido: 120,
          ocupacion_pct: 60,
        },
      ],
    },
    {
      evento_id: ID_OTRO_EVENTO,
      nombre: "Concierto de rock",
      slug: "concierto-de-rock",
      estado: "finalizado",
      fecha_inicio: "2023-06-01T16:00:00.000Z",
      tickets_vendidos_total: 40,
      ingresos_cop: 5000000,
      aforo_total: 150,
      aforo_vendido: 40,
      ocupacion_pct: 26.67,
      tipos_ticket: [
        {
          tipo_ticket_id: "65a0000000000000000000d2",
          nombre: "VIP",
          precio_cop: 250000,
          aforo_total: 50,
          aforo_vendido: 10,
          ocupacion_pct: 20,
        },
      ],
    },
  ],
  limite: 10,
};

/** Red falsa: responde con la forma real del contrato y anota lo que se pidió. */
function crearRed(cuerpo: unknown = RANKING) {
  const peticiones: string[] = [];

  const fetchFalso = async (entrada: RequestInfo | URL): Promise<Response> => {
    const url = String(entrada);

    peticiones.push(url);

    return new Response(JSON.stringify(cuerpo), {
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

/** Renderiza el panel del ranking con su proveedor de consultas y su router. */
function renderPanel() {
  return render(
    <QueryClientProvider client={clienteDePrueba()}>
      <MemoryRouter>
        <PanelRanking />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** La fila de la tabla donde está un evento, acotada a esa fila. */
function filaDe(nombre: string): HTMLElement {
  const enlace = screen.getByRole("link", { name: nombre });
  const fila = enlace.closest("tr");

  if (fila === null) {
    throw new Error(`El evento "${nombre}" no está en una fila de la tabla`);
  }

  return fila as HTMLElement;
}

describe("ranking de los eventos más vendidos", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra el ranking con sus ventas, sus ingresos y su ocupación por tipo", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel();

    // La primera fila: los tickets vendidos y los ingresos del evento.
    await screen.findByRole("link", { name: "Festival de verano" });

    const primera = within(filaDe("Festival de verano"));

    expect(primera.getByText("120")).toBeInTheDocument();
    expect(primera.getByText("COP 9.000.000")).toBeInTheDocument();

    // La ocupación por tipo de ticket: su nombre, sus vendidos sobre su aforo
    // y su porcentaje. Se acota a su línea porque el agregado del evento
    // puede traer los mismos números.
    const lineaGeneral = within(primera.getByText("General").closest("li") as HTMLElement);

    expect(lineaGeneral.getByText("120 / 200")).toBeInTheDocument();
    expect(lineaGeneral.getByText("60 %")).toBeInTheDocument();

    // La segunda fila: la ocupación del evento, con sus dos formas.
    const segunda = within(filaDe("Concierto de rock"));

    expect(segunda.getByText("40")).toBeInTheDocument();
    expect(segunda.getByText("COP 5.000.000")).toBeInTheDocument();
    expect(segunda.getByText("40 / 150")).toBeInTheDocument();

    // Y su tipo de ticket.
    const lineaVip = within(segunda.getByText("VIP").closest("li") as HTMLElement);

    expect(lineaVip.getByText("10 / 50")).toBeInTheDocument();
    expect(lineaVip.getByText("20 %")).toBeInTheDocument();
  });

  it("muestra la ocupación con la coma decimal de es-CO", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel();

    // `26.67` del contrato se muestra "26,67 %": el decimal de es-CO es la coma.
    expect(await screen.findByText("26,67 %")).toBeInTheDocument();
  });

  it("cambia el límite y lo manda en la consulta", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel();

    await screen.findByRole("link", { name: "Festival de verano" });

    const usuario = userEvent.setup();

    await usuario.selectOptions(screen.getByLabelText("Límite"), "20");

    // El límite viaja como parámetro de la consulta del ranking.
    await waitFor(() => {
      expect(peticiones.some((url) => url.includes("limite=20"))).toBe(true);
    });
  });

  it("muestra el estado del evento con su distintivo y el nombre enlazado a su ficha", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel();

    const enlace = await screen.findByRole("link", { name: "Festival de verano" });

    // El identificador del ranking es el del evento: el enlace va a su ficha.
    expect(enlace).toHaveAttribute("href", `/eventos/${ID_EVENTO}`);

    // El estado, con el distintivo del vocabulario.
    expect(screen.getByText("Publicado")).toBeInTheDocument();
    expect(screen.getByText("Finalizado")).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando el ranking no trae eventos", async () => {
    const { fetchFalso } = crearRed({ items: [], limite: 10 });

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel();

    expect(await screen.findByText(/No hay eventos/)).toBeInTheDocument();
  });
});
