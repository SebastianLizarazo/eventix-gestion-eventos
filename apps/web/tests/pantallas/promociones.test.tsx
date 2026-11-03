import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TipoTicket } from "@/api/tipos";
import { PanelPromociones } from "@/pantallas/promociones";

/**
 * Pruebas del panel de promociones de un evento.
 *
 * La red es falsa, pero no es una maqueta: el `fetch` global responde con la
 * forma real del contrato y **anota método, URL y cuerpo** de cada petición.
 * Así se prueba la cadena completa —el cliente, los hooks y el panel— y además
 * se puede afirmar *qué* se le pidió a la API, que es la mitad del trabajo de
 * este panel: las vigencias viajan en ISO UTC y la edición va por el código
 * viejo.
 */

/** Identificador del evento de la prueba. */
const ID_EVENTO = "65a0000000000000000000a1";

/** Identificadores de los tipos de ticket del evento. */
const ID_GENERAL = "65a0000000000000000000d1";
const ID_VIP = "65a0000000000000000000d2";

/** Tipos de ticket del evento: son los que una promoción puede aplicar. */
const TIPOS_TICKET: TipoTicket[] = [
  {
    _id: ID_GENERAL,
    nombre: "General",
    precio_cop: 120000,
    aforo_total: 200,
    aforo_vendido: 150,
    restricciones: {},
  },
  {
    _id: ID_VIP,
    nombre: "VIP",
    precio_cop: 250000,
    aforo_total: 50,
    aforo_vendido: 48,
    restricciones: {},
  },
];

/** Una promoción con tope de usos: es la que tiene usos realizados y tope. */
const PROMOCION_VERANO = {
  codigo: "VERANO10",
  tipo: "porcentaje",
  valor: 10,
  aplica_a_tipo_ticket_ids: [ID_GENERAL],
  vigencia_inicio: "2026-03-01T00:00:00.000Z",
  vigencia_fin: "2026-03-31T23:59:00.000Z",
  usos_maximos: 100,
  usos_realizados: 12,
  activo: true,
};

/** Una promoción sin tope de usos: los usos se muestran con "—". */
const PROMOCION_DOBLE = {
  codigo: "DOBLE",
  tipo: "2x1",
  valor: 2,
  aplica_a_tipo_ticket_ids: [ID_VIP],
  vigencia_inicio: "2026-04-01T00:00:00.000Z",
  vigencia_fin: "2026-04-30T23:59:00.000Z",
  usos_realizados: 5,
  activo: false,
};

/** Las promociones que la API devuelve para el evento. */
const PROMOCIONES = [PROMOCION_VERANO, PROMOCION_DOBLE];

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

    if (metodo === "GET") {
      return respuesta(PROMOCIONES, 200);
    }

    return respuesta(PROMOCION_VERANO, metodo === "POST" ? 201 : 200);
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
function renderPanel() {
  return render(
    <QueryClientProvider client={clienteDePrueba()}>
      <PanelPromociones eventoId={ID_EVENTO} tiposTicket={TIPOS_TICKET} />
    </QueryClientProvider>,
  );
}

describe("panel de promociones", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra las promociones con su vigencia y sus usos", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel();

    // La primera promoción: código, tipo, valor, vigencia, usos y estado.
    expect(await screen.findByText("VERANO10")).toBeInTheDocument();
    expect(screen.getByText("Porcentaje")).toBeInTheDocument();
    expect(screen.getByText("10 %")).toBeInTheDocument();
    expect(screen.getByText(/01\/03\/2026 00:00/)).toBeInTheDocument();
    expect(screen.getByText(/31\/03\/2026 23:59/)).toBeInTheDocument();
    expect(screen.getByText("12 / 100")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();

    // La segunda: sin tope de usos y sin tope en la columna de usos.
    expect(screen.getByText("DOBLE")).toBeInTheDocument();
    expect(screen.getAllByText("2x1")).toHaveLength(2);
    expect(screen.getByText("5 / —")).toBeInTheDocument();
    expect(screen.getByText("Inactiva")).toBeInTheDocument();
  });

  it("guarda una promoción nueva con las vigencias en ISO UTC", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    const usuario = userEvent.setup();

    renderPanel();

    await screen.findByText("VERANO10");

    await usuario.click(screen.getByRole("button", { name: "Nueva promoción" }));

    await usuario.type(screen.getByLabelText("Código"), "OTOÑO20");
    await usuario.selectOptions(screen.getByLabelText("Tipo"), "porcentaje");
    await usuario.type(screen.getByLabelText("Valor"), "20");
    await usuario.type(screen.getByLabelText("Usos máximos"), "50");
    await usuario.click(screen.getByLabelText(/General/));

    // Los campos de fecha y hora no admiten `type`: se les cambia el valor
    // directamente, que es lo que hace el navegador cuando eligen una fecha.
    fireEvent.change(screen.getByLabelText("Vigencia desde"), {
      target: { value: "2026-03-15T14:30" },
    });
    fireEvent.change(screen.getByLabelText("Vigencia hasta"), {
      target: { value: "2026-04-15T14:30" },
    });

    await usuario.click(screen.getByRole("button", { name: "Guardar promoción" }));

    await waitFor(() => {
      const alta = peticiones.find((peticion) => peticion.metodo === "POST");

      expect(alta).toBeDefined();
      expect(alta?.url).toBe(`/api/eventos/${ID_EVENTO}/promociones`);
      expect(alta?.cuerpo).toMatchObject({
        codigo: "OTOÑO20",
        tipo: "porcentaje",
        valor: 20,
        aplica_a_tipo_ticket_ids: [ID_GENERAL],
        vigencia_inicio: "2026-03-15T14:30:00.000Z",
        vigencia_fin: "2026-04-15T14:30:00.000Z",
        usos_maximos: 50,
        activo: true,
      });
    });

    // Tras el alta el formulario queda limpio, listo para la siguiente.
    expect(screen.getByLabelText("Código")).toHaveValue("");
  });

  it("edita una promoción existente por su código viejo", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    const usuario = userEvent.setup();

    renderPanel();

    await screen.findByText("VERANO10");

    await usuario.click(
      within(screen.getByRole("row", { name: /VERANO10/ })).getByRole("button", {
        name: "Editar",
      }),
    );

    // El formulario se carga con la promoción que se está editando.
    expect(screen.getByLabelText("Código")).toHaveValue("VERANO10");
    expect(screen.getByLabelText("Valor")).toHaveValue(10);
    expect(screen.getByLabelText("Vigencia desde")).toHaveValue("2026-03-01T00:00");
    expect(screen.getByLabelText("Vigencia hasta")).toHaveValue("2026-03-31T23:59");

    await usuario.clear(screen.getByLabelText("Código"));
    await usuario.type(screen.getByLabelText("Código"), "VERANO15");

    await usuario.click(screen.getByRole("button", { name: "Guardar promoción" }));

    await waitFor(() => {
      const edicion = peticiones.find((peticion) => peticion.metodo === "PATCH");

      expect(edicion).toBeDefined();
      expect(edicion?.url).toBe(`/api/eventos/${ID_EVENTO}/promociones/VERANO10`);
      expect(edicion?.cuerpo).toMatchObject({
        codigo: "VERANO15",
        tipo: "porcentaje",
        valor: 10,
        vigencia_inicio: "2026-03-01T00:00:00.000Z",
        vigencia_fin: "2026-03-31T23:59:00.000Z",
        usos_maximos: 100,
        activo: true,
      });
    });

    // Tras la edición el panel vuelve al modo lista.
    await waitFor(() => expect(screen.queryByLabelText("Código")).not.toBeInTheDocument());
    expect(screen.getByText("VERANO10")).toBeInTheDocument();
  });
});
