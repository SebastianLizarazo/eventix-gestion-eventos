import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PanelAsistentes } from "@/pantallas/reportes/asistentes";

/**
 * Pruebas del panel de asistentes de un evento.
 *
 * La prueba intercepta el `fetch` global con respuestas falsas que tienen la
 * forma real del contrato, así que se prueba la cadena completa —el cliente,
 * los hooks y la pantalla— y no una maqueta.
 */

/** Identificador del evento de la prueba. */
const ID_EVENTO = "65a0000000000000000000a1";

/**
 * Un asistente del contrato.
 *
 * Es el **snapshot** que guarda el ticket: la exportación no une `usuarios`
 * ni `eventos`, así que esto —y solo esto— es lo que se puede mostrar.
 */
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

/** Un identificador del contrato: 24 caracteres hexadecimales. */
function idDe(hex: string): string {
  return `65a${"0".repeat(19)}${hex}`;
}

/**
 * Los asistentes que reparte la red falsa.
 *
 * Son 60 para que la paginación tenga algo que paginar: con 25 por página la
 * primera viene llena y hay tres páginas.
 */
const ASISTENTES = [
  ASISTENTE,
  ...Array.from({ length: 59 }, (_, indice) => {
    const numero = indice + 2;
    const hex = numero.toString(16).padStart(2, "0");

    return {
      ...ASISTENTE,
      ticket_id: idDe(hex),
      codigo_qr: `QR-EMITIDO-${numero}`,
      asistente: {
        ...ASISTENTE.asistente,
        usuario_id: idDe(hex),
        nombre: `Asistente ${numero}`,
        documento_identidad: `CC-${1000000 + numero}`,
        email: `asistente${numero}@eventix.test`,
      },
    };
  }),
];

/**
 * Red falsa: pagina de verdad a los asistentes que se le piden.
 *
 * Devuelve la forma real del contrato —`items`, `total`, `skip` y `limit`— y
 * anota las URLs pedidas: eso es lo que permite comprobar qué filtro viaja y
 * cuál no. Con `total: null` se reproduce el caso en que la API no calculó
 * el total.
 */
function crearRed(opciones: { total?: number | null; sinResultados?: boolean } = {}) {
  const peticiones: string[] = [];
  const sinResultados = opciones.sinResultados ?? false;
  const total =
    opciones.total === undefined ? (sinResultados ? 0 : ASISTENTES.length) : opciones.total;

  const fetchFalso = async (entrada: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(entrada), "http://eventix.test");

    peticiones.push(url.toString());

    const skip = Number(url.searchParams.get("skip") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 25);
    const items = sinResultados ? [] : ASISTENTES.slice(skip, skip + limit);

    return new Response(JSON.stringify({ items, total, skip, limit }), {
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

/** Renderiza el panel con su proveedor de consultas. */
function renderPanel(eventoId: string | null = ID_EVENTO) {
  return render(
    <QueryClientProvider client={clienteDePrueba()}>
      <PanelAsistentes eventoId={eventoId} />
    </QueryClientProvider>,
  );
}

/** La última petición que la pantalla le hizo a la API. */
function ultimaPeticion(peticiones: string[]): string {
  return peticiones[peticiones.length - 1] ?? "";
}

/**
 * La fila de la tabla donde está un asistente.
 *
 * Se busca **dentro** de la fila porque el estado del ticket se repite: el
 * desplegable de filtro ofrece los mismos estados que muestra la tabla.
 */
function filaDe(celda: HTMLElement): HTMLElement {
  const fila = celda.closest("tr");

  if (!(fila instanceof HTMLElement)) {
    throw new Error("El elemento no está en una fila de tabla");
  }

  return fila;
}

describe("panel de asistentes", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra los asistentes con sus datos y su estado", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel();

    const fila = filaDe(await screen.findByText("Ana Asistente"));

    // El código QR y el asistente, con su documento de identidad.
    expect(within(fila).getByText("QR-EMITIDO-1")).toBeInTheDocument();
    expect(within(fila).getByText("CC-1000001")).toBeInTheDocument();

    // El tipo de ticket y lo que se pagó, en la convención de es-CO.
    expect(within(fila).getByText("General")).toBeInTheDocument();
    expect(within(fila).getByText("COP 120.000")).toBeInTheDocument();

    // El estado del ticket, con su distintivo.
    expect(within(fila).getByText("Emitido")).toBeInTheDocument();

    // La emisión, con fecha y hora.
    expect(within(fila).getByText("01/07/2023 10:00")).toBeInTheDocument();

    // Sin promoción y sin validar: los dos datos ausentes son «—».
    expect(within(fila).getAllByText("—")).toHaveLength(2);
  });

  it("filtra por estado y lo manda en la query", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel();
    await screen.findByText("Ana Asistente");

    const usuario = userEvent.setup();

    // Escribir no dispara peticiones: el borrador y el filtro aplicado son
    // estados distintos.
    const peticionesAntes = peticiones.length;

    await usuario.selectOptions(screen.getByLabelText("Estado"), "usado");

    expect(peticiones.length).toBe(peticionesAntes);

    await usuario.click(screen.getByRole("button", { name: "Filtrar" }));

    await waitFor(() => {
      expect(ultimaPeticion(peticiones)).toContain("estado=usado");
    });

    // «Todos» es la **ausencia** del parámetro: la API lee `estado` como
    // vocabulario cerrado y un valor vacío sería una petición inválida.
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "" } });

    await usuario.click(screen.getByRole("button", { name: "Filtrar" }));

    await waitFor(() => {
      const peticion = ultimaPeticion(peticiones);

      expect(peticion).not.toContain("estado=");
      expect(peticion).toContain("skip=0");
    });
  });

  it("pide la página siguiente con su skip", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel();
    await screen.findByText("Ana Asistente");

    const usuario = userEvent.setup();

    await usuario.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => {
      expect(ultimaPeticion(peticiones)).toContain("skip=25");
    });

    // La página visible es la segunda, de las tres que hay.
    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando la página no trae asistentes", async () => {
    const { fetchFalso } = crearRed({ sinResultados: true });

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel();

    expect(
      await screen.findByText("No hay asistentes que cumplan los filtros"),
    ).toBeInTheDocument();
  });

  it("no sabe cuántas filas hay cuando la API no calculó el total", async () => {
    const { fetchFalso } = crearRed({ total: null });

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel();
    await screen.findByText("Ana Asistente");

    // Sin total no hay número de páginas: la interfaz lo dice en vez de
    // inventarlo.
    expect(screen.getByText("Página 1 de —")).toBeInTheDocument();
    expect(screen.getByText("— asistentes")).toBeInTheDocument();

    // Pero la página vino llena, así que puede haber otra.
    const usuario = userEvent.setup();

    expect(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled();

    await usuario.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => {
      expect(screen.getByText("Página 2 de —")).toBeInTheDocument();
    });
  });

  it("pide elegir un evento y no consulta nada", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderPanel(null);

    expect(
      await screen.findByText("Elige un evento para ver sus asistentes."),
    ).toBeInTheDocument();

    expect(peticiones).toHaveLength(0);
  });
});
