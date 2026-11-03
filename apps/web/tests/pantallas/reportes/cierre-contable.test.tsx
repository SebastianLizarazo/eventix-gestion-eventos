import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PanelCierreContable } from "@/pantallas/reportes/cierre-contable";

/**
 * Pruebas del panel de cierre contable.
 *
 * Se intercepta el `fetch` global con respuestas falsas que tienen la forma
 * real del contrato —el mismo patrón del catálogo—, así que se prueba la
 * cadena completa: el cliente, el hook y la pantalla.
 */

/** Identificador de la petición, como el que la API devuelve en el error. */
const ID_PETICION = "65a0000000000000000000f1";

/**
 * El cierre contable de dos días, con la forma real del contrato.
 *
 * Los cinco estados están siempre presentes, aunque valgan cero, y el segundo
 * día cierra en negativo: más devoluciones que cobros.
 */
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
    {
      dia: "2023-07-02",
      por_estado: {
        pendiente: { cantidad: 0, monto_cop: 0 },
        aprobada: { cantidad: 1, monto_cop: 50000 },
        rechazada: { cantidad: 0, monto_cop: 0 },
        anulada: { cantidad: 0, monto_cop: 0 },
        reembolsada: { cantidad: 1, monto_cop: 80000 },
      },
      neto_cop: -30000,
    },
  ],
  pendientes_sin_confirmar: { cantidad: 1, monto_cop: 10000 },
  totales: { cantidad: 5, monto_cop: 200000, neto_cop: 120000 },
};

/**
 * Red falsa: responde con la forma real del contrato y anota lo que se pidió.
 *
 * La API rechaza el rango invertido con un 400 de `peticion_invalida`, así que
 * la red falsa hace lo mismo: la prueba del error no fabrica el error, ejerce
 * la ruta de error del cliente y de la pantalla.
 */
function crearRed(cierre: Record<string, unknown> = CIERRE) {
  const peticiones: string[] = [];

  const fetchFalso = async (entrada: RequestInfo | URL): Promise<Response> => {
    const url = String(entrada);

    peticiones.push(url);

    const parametros = new URL(url, "http://localhost").searchParams;
    const desde = parametros.get("desde");
    const hasta = parametros.get("hasta");

    if (desde !== null && hasta !== null && desde > hasta) {
      return new Response(
        JSON.stringify({
          error: {
            codigo: "peticion_invalida",
            mensaje: "El parámetro 'hasta' no puede ser anterior a 'desde'",
            request_id: ID_PETICION,
          },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }

    // La API devuelve los límites ya normalizados, en ISO 8601.
    return new Response(
      JSON.stringify({
        ...cierre,
        desde: desde === null ? null : `${desde}T00:00:00.000Z`,
        hasta: hasta === null ? null : `${hasta}T00:00:00.000Z`,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
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
      <PanelCierreContable />
    </QueryClientProvider>,
  );
}

/** La última petición que la pantalla le hizo al cierre contable. */
function ultimaPeticion(peticiones: string[]): string {
  const deCierre = peticiones.filter((url) => url.includes("/api/reportes/cierre-contable"));

  return deCierre[deCierre.length - 1] ?? "";
}

/** La fila de la tabla que corresponde a un día. */
function filaDe(dia: string): HTMLElement {
  const celda = screen.getByText(dia);
  const fila = celda.closest("tr");

  if (fila === null) {
    throw new Error(`No se encontró la fila del día ${dia}`);
  }

  return fila as HTMLElement;
}

describe("panel de cierre contable", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra una fila por día con los cinco estados y el neto", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel();

    // Las columnas son las del contrato, con las etiquetas del vocabulario.
    expect(await screen.findByRole("columnheader", { name: "Pendiente" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Aprobada" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Rechazada" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Anulada" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Reembolsada" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Neto" })).toBeInTheDocument();

    // Una fila por día, con la fecha en formato es-CO.
    await screen.findByText("01/07/2023");
    expect(screen.getByText("02/07/2023")).toBeInTheDocument();

    const primera = within(filaDe("01/07/2023")).getAllByRole("cell");

    // Cada celda de estado lleva su cantidad y su monto.
    expect(primera[0]).toHaveTextContent("0 COP 0");
    expect(primera[1]).toHaveTextContent("2 COP 150.000");
    expect(primera[2]).toHaveTextContent("1 COP 0");
    expect(primera[3]).toHaveTextContent("0 COP 0");
    expect(primera[4]).toHaveTextContent("0 COP 0");

    // El neto del día, en la última columna.
    expect(primera[5]).toHaveTextContent("COP 150.000");

    // El segundo día cierra en negativo: el signo no se esconde.
    const segunda = within(filaDe("02/07/2023")).getAllByRole("cell");

    expect(segunda[1]).toHaveTextContent("1 COP 50.000");
    expect(segunda[4]).toHaveTextContent("1 COP 80.000");
    expect(segunda[5]).toHaveTextContent("COP -30.000");
  });

  it("aplica el rango y lo manda en la query", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel();
    await screen.findByText("01/07/2023");

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2023-07-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2023-07-31" } });

    // Escribir no dispara peticiones: el borrador y el rango aplicado son
    // estados distintos.
    const peticionesAntes = peticiones.length;

    expect(peticiones.length).toBe(peticionesAntes);

    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => {
      const peticion = ultimaPeticion(peticiones);

      expect(peticion).toContain("desde=2023-07-01");
      expect(peticion).toContain("hasta=2023-07-31");
    });

    // El rango aplicado se ve en pantalla, con los límites normalizados que
    // devolvió la API.
    expect(await screen.findByText("Del 01/07/2023 al 31/07/2023")).toBeInTheDocument();
  });

  it("muestra el error de la API cuando el rango está al revés", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel();
    await screen.findByText("01/07/2023");

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2023-07-31" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2023-07-01" } });

    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    // El error lo decide el cliente por el código del contrato, no por el
    // texto del mensaje: lo que se muestra es lo que dijo la API.
    const aviso = await screen.findByRole("alert");

    expect(aviso).toHaveTextContent("El parámetro 'hasta' no puede ser anterior a 'desde'");
    expect(aviso).toHaveTextContent(ID_PETICION);
  });

  it("muestra los totales y las pendientes sin confirmar aparte", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel();
    await screen.findByText("01/07/2023");

    expect(screen.getByText("Totales del rango")).toBeInTheDocument();
    expect(screen.getByText("Pendientes sin confirmar")).toBeInTheDocument();

    // Los totales del rango.
    expect(screen.getByText("COP 200.000")).toBeInTheDocument();
    expect(screen.getByText("COP 120.000")).toBeInTheDocument();

    // Las pendientes van aparte: no pertenecen a ningún día.
    expect(screen.getByText("COP 10.000")).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando no hay días confirmados en el rango", async () => {
    const { fetchFalso } = crearRed({ ...CIERRE, dias: [] });

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel();

    expect(
      await screen.findByText("No hay transacciones confirmadas en el rango"),
    ).toBeInTheDocument();
  });
});
