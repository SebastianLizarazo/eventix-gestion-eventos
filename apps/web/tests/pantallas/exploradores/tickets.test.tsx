import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Ticket } from "@/api/tipos";
import { ExploradorTickets } from "@/pantallas/exploradores/tickets";

/**
 * Pruebas del explorador de tickets.
 *
 * La prueba intercepta el `fetch` global con respuestas falsas que tienen la
 * forma real del contrato, así que se prueba la cadena completa —el cliente,
 * los hooks y la pantalla— y no una maqueta.
 */

/**
 * Un ticket del contrato.
 *
 * Guarda **snapshots** del tipo de ticket y del asistente: son los datos que
 * el ticket copió al emitirse, no referencias.
 */
const TICKET: Ticket = {
  _id: "65a0000000000000000000e1",
  codigo_qr: "QR-EMITIDO-1",
  estado: "emitido",
  evento_id: "65a0000000000000000000a1",
  comprado_por_usuario_id: "65a0000000000000000000b1",
  snapshot_tipo_ticket: {
    tipo_ticket_id: "65a0000000000000000000d1",
    nombre: "General",
    precio_cop: 120000,
  },
  asistente_snapshot: {
    usuario_id: "65a0000000000000000000b2",
    nombre: "Ana Asistente",
    documento_identidad: "CC-1000001",
    email: "asistente@eventix.test",
  },
  precio_pagado_cop: 120000,
  promocion_aplicada_codigo: "PROMO-VERANO",
  transaccion_id: "65a0000000000000000000c1",
  emitido_en: "2023-07-01T10:00:00.000Z",
  validado_en: null,
  revalidaciones: [],
  _v: 0,
};

/** Un identificador del contrato: 24 caracteres hexadecimales. */
function idDe(numero: number): string {
  return `65a${"0".repeat(19)}${numero.toString(16).padStart(2, "0")}`;
}

/**
 * Los tickets que reparte la red falsa.
 *
 * Son 60 para que la paginación tenga algo que paginar: con 25 por página la
 * primera viene llena y hay tres páginas. Solo el primero lleva promoción, así
 * que el «—» de los demás se puede comprobar en su fila.
 */
const TICKETS: Ticket[] = [
  TICKET,
  ...Array.from({ length: 59 }, (_, indice) => {
    const numero = indice + 2;

    return {
      ...TICKET,
      _id: idDe(numero),
      codigo_qr: `QR-EMITIDO-${numero}`,
      snapshot_tipo_ticket: {
        ...TICKET.snapshot_tipo_ticket,
        tipo_ticket_id: idDe(numero),
      },
      asistente_snapshot: {
        ...TICKET.asistente_snapshot,
        usuario_id: idDe(numero),
        nombre: `Asistente ${numero}`,
        documento_identidad: `CC-${1000000 + numero}`,
        email: `asistente${numero}@eventix.test`,
      },
      promocion_aplicada_codigo: undefined,
      emitido_en: "2023-07-02T10:00:00.000Z",
    };
  }),
];

/**
 * Red falsa: pagina de verdad a los tickets que se le piden.
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
    opciones.total === undefined ? (sinResultados ? 0 : TICKETS.length) : opciones.total;

  const fetchFalso = async (entrada: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(entrada), "http://eventix.test");

    peticiones.push(url.toString());

    const skip = Number(url.searchParams.get("skip") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 25);
    const items = sinResultados ? [] : TICKETS.slice(skip, skip + limit);

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

/** Renderiza el explorador con su proveedor de consultas. */
function renderExplorador() {
  return render(
    <QueryClientProvider client={clienteDePrueba()}>
      <ExploradorTickets />
    </QueryClientProvider>,
  );
}

/** La última petición que la pantalla le hizo a la API. */
function ultimaPeticion(peticiones: string[]): string {
  return peticiones[peticiones.length - 1] ?? "";
}

/** La fila de la tabla donde está un ticket. */
function filaDe(celda: HTMLElement): HTMLElement {
  const fila = celda.closest("tr");

  if (!(fila instanceof HTMLElement)) {
    throw new Error("El elemento no está en una fila de tabla");
  }

  return fila;
}

describe("explorador de tickets", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra los tickets con sus datos", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();

    const fila = filaDe(await screen.findByText("Ana Asistente"));

    // El código QR y el estado del ticket.
    expect(within(fila).getByText("QR-EMITIDO-1")).toBeInTheDocument();
    expect(within(fila).getByText("Emitido")).toBeInTheDocument();

    // El snapshot del tipo de ticket y el del asistente.
    expect(within(fila).getByText("General")).toBeInTheDocument();

    // Lo que se pagó, en la convención de es-CO.
    expect(within(fila).getByText("COP 120.000")).toBeInTheDocument();

    // La promoción aplicada.
    expect(within(fila).getByText("PROMO-VERANO")).toBeInTheDocument();

    // La emisión, con fecha y hora.
    expect(within(fila).getByText("01/07/2023 10:00")).toBeInTheDocument();

    // El evento, crudo.
    expect(within(fila).getByText(TICKET.evento_id)).toBeInTheDocument();

    // Un ticket sin promoción muestra «—» en vez de un hueco vacío.
    const otra = filaDe(await screen.findByText("Asistente 2"));

    expect(within(otra).getByText("—")).toBeInTheDocument();
  });

  it("manda el filtro aplicado y no manda los filtros vacíos", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();
    await screen.findByText("Ana Asistente");

    const usuario = userEvent.setup();

    // Escribir no dispara peticiones: el borrador y el filtro aplicado son
    // estados distintos.
    const peticionesAntes = peticiones.length;

    await usuario.selectOptions(screen.getByLabelText("Estado"), "usado");
    await usuario.type(screen.getByLabelText("Evento"), "65a0000000000000000000a1");
    await usuario.type(screen.getByLabelText("Comprador"), "65a0000000000000000000b1");

    expect(peticiones.length).toBe(peticionesAntes);

    await usuario.click(screen.getByRole("button", { name: "Filtrar" }));

    await waitFor(() => {
      const peticion = ultimaPeticion(peticiones);

      expect(peticion).toContain("estado=usado");
      expect(peticion).toContain("evento_id=65a0000000000000000000a1");
      expect(peticion).toContain("usuario_id=65a0000000000000000000b1");
    });

    // «Todos» es la **ausencia** del parámetro: la API lee `estado` como
    // vocabulario cerrado y un valor vacío sería una petición inválida.
    await usuario.selectOptions(screen.getByLabelText("Estado"), "");
    await usuario.clear(screen.getByLabelText("Evento"));
    await usuario.clear(screen.getByLabelText("Comprador"));

    await usuario.click(screen.getByRole("button", { name: "Filtrar" }));

    await waitFor(() => {
      const peticion = ultimaPeticion(peticiones);

      expect(peticion).not.toContain("estado=");
      expect(peticion).not.toContain("evento_id=");
      expect(peticion).not.toContain("usuario_id=");
      expect(peticion).toContain("skip=0");
    });
  });

  it("vuelve al estado inicial cuando se limpian los filtros", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();
    await screen.findByText("Ana Asistente");

    const usuario = userEvent.setup();

    await usuario.selectOptions(screen.getByLabelText("Estado"), "anulado");
    await usuario.click(screen.getByRole("button", { name: "Filtrar" }));

    await waitFor(() => {
      expect(ultimaPeticion(peticiones)).toContain("estado=anulado");
    });

    await usuario.click(screen.getByRole("button", { name: "Limpiar" }));

    await waitFor(() => {
      expect(ultimaPeticion(peticiones)).not.toContain("estado=");
    });

    // El control vuelve a «Todos» y el listado vuelve a la primera página.
    expect(screen.getByLabelText("Estado")).toHaveValue("");
    expect(screen.getByText("Página 1 de 3")).toBeInTheDocument();
  });

  it("pide la página siguiente con su skip", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();
    await screen.findByText("Ana Asistente");

    const usuario = userEvent.setup();

    await usuario.click(screen.getByRole("button", { name: "Siguiente — tickets" }));

    await waitFor(() => {
      expect(ultimaPeticion(peticiones)).toContain("skip=25");
    });

    // La página visible es la segunda, de las tres que hay.
    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando la página no trae tickets", async () => {
    const { fetchFalso } = crearRed({ sinResultados: true });

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();

    expect(await screen.findByText("No hay tickets que cumplan los filtros")).toBeInTheDocument();
  });

  it("no sabe cuántas páginas hay cuando la API no calculó el total", async () => {
    const { fetchFalso } = crearRed({ total: null });

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();
    await screen.findByText("Ana Asistente");

    // Sin total no hay número de páginas: la interfaz lo dice en vez de
    // inventarlo.
    expect(screen.getByText("Página 1 de —")).toBeInTheDocument();
  });

  it("no ofrece ninguna acción de escritura", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();
    await screen.findByText("Ana Asistente");

    // La colección es de solo lectura: ni un botón ni un enlace que escriba.
    expect(
      screen.queryByRole("button", { name: /editar|eliminar|crear|alta|baja|guardar/i }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: /editar|eliminar|crear|alta|baja/i })).toBeNull();
  });
});
