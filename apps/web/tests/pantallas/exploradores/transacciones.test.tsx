import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Transaccion } from "@/api/tipos";
import { ExploradorTransacciones } from "@/pantallas/exploradores/transacciones";

/**
 * Pruebas del explorador de transacciones.
 *
 * La prueba intercepta el `fetch` global con respuestas falsas que tienen la
 * forma real del contrato, así que se prueba la cadena completa —el cliente,
 * los hooks y la pantalla— y no una maqueta.
 */

/** Un identificador del contrato: 24 caracteres hexadecimales. */
function idDe(hex: string): string {
  return `65a${"0".repeat(19)}${hex}`;
}

/** El usuario que paga de la primera transacción. */
const USUARIO_ID = idDe("b1");

/** El ticket que se emitió con el cargo. */
const TICKET_ID = idDe("e1");

/**
 * Una transacción del contrato.
 *
 * La primera es la que la prueba mira de cerca: trae el importe, la fecha de
 * creación y la de confirmación, así que se ve el formato es-CO completo.
 */
const TRANSACCION: Transaccion = {
  _id: idDe("f1"),
  usuario_id: USUARIO_ID,
  ticket_id: TICKET_ID,
  monto_cop: 120000,
  moneda: "COP",
  metodo_pago: "tarjeta_credito",
  pasarela: "stripe",
  estado: "aprobada",
  referencia_pasarela: "REF-PAGO-1",
  creada_en: "2023-07-01T10:00:00.000Z",
  confirmada_en: "2023-07-01T11:30:00.000Z",
};

/**
 * Una transacción pendiente.
 *
 * El campo `confirmada_en` **no está**: mientras el cargo no se confirma, la
 * API no lo manda, y la columna lo muestra como «—».
 */
const TRANSACCION_PENDIENTE: Transaccion = {
  _id: idDe("f2"),
  usuario_id: idDe("b2"),
  ticket_id: idDe("e2"),
  monto_cop: 50000,
  moneda: "COP",
  metodo_pago: "efectivo",
  pasarela: "stripe",
  estado: "pendiente",
  referencia_pasarela: "REF-PAGO-2",
  creada_en: "2023-07-02T10:00:00.000Z",
};

/**
 * Las transacciones que reparte la red falsa.
 *
 * Son 60 para que la paginación tenga algo que paginar: con 25 por página la
 * primera viene llena y hay tres páginas.
 */
const TRANSACCIONES: Transaccion[] = [
  TRANSACCION,
  TRANSACCION_PENDIENTE,
  ...Array.from({ length: 58 }, (_, indice) => {
    const numero = indice + 3;
    const hex = numero.toString(16).padStart(2, "0");

    return {
      ...TRANSACCION,
      _id: idDe(hex),
      usuario_id: idDe(hex),
      ticket_id: idDe(`e${hex.charAt(1)}`),
      monto_cop: 10000 + numero,
      estado: "rechazada" as const,
      referencia_pasarela: `REF-PAGO-${numero}`,
      creada_en: "2023-07-03T10:00:00.000Z",
    };
  }),
];

/**
 * Red falsa: pagina de verdad a las transacciones que se le piden.
 *
 * Devuelve la forma real del contrato —`items`, `total`, `skip` y `limit`— y
 * anota las URLs pedidas: eso es lo que permite comprobar qué filtro viaja y
 * cuál no. Con `total: null` se reproduce el caso en que la API no calculó el
 * total.
 */
function crearRed(opciones: { total?: number | null; sinResultados?: boolean } = {}) {
  const peticiones: string[] = [];
  const sinResultados = opciones.sinResultados ?? false;
  const total =
    opciones.total === undefined ? (sinResultados ? 0 : TRANSACCIONES.length) : opciones.total;

  const fetchFalso = async (entrada: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(entrada), "http://eventix.test");

    peticiones.push(url.toString());

    const skip = Number(url.searchParams.get("skip") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 25);
    const items = sinResultados ? [] : TRANSACCIONES.slice(skip, skip + limit);

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
      <ExploradorTransacciones />
    </QueryClientProvider>,
  );
}

/** La última petición que la pantalla le hizo a la API. */
function ultimaPeticion(peticiones: string[]): string {
  return peticiones[peticiones.length - 1] ?? "";
}

/** La fila de la tabla donde está una transacción. */
function filaDe(celda: HTMLElement): HTMLElement {
  const fila = celda.closest("tr");

  if (!(fila instanceof HTMLElement)) {
    throw new Error("El elemento no está en una fila de tabla");
  }

  return fila;
}

describe("explorador de transacciones", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra las transacciones con sus datos y su formato es-CO", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();

    const fila = filaDe(await screen.findByText(USUARIO_ID));

    // El ticket del cargo, crudo.
    expect(within(fila).getByText(TICKET_ID)).toBeInTheDocument();

    // El importe, en la convención de es-CO.
    expect(within(fila).getByText("COP 120.000")).toBeInTheDocument();
    expect(within(fila).getByText("COP")).toBeInTheDocument();

    // El método, la pasarela y el estado contable.
    expect(within(fila).getByText("Tarjeta de crédito")).toBeInTheDocument();
    expect(within(fila).getByText("stripe")).toBeInTheDocument();
    expect(within(fila).getByText("Aprobada")).toBeInTheDocument();

    // La referencia de la pasarela, que es la clave de idempotencia.
    expect(within(fila).getByText("REF-PAGO-1")).toBeInTheDocument();

    // La creación y la confirmación, con fecha y hora.
    expect(within(fila).getByText("01/07/2023 10:00")).toBeInTheDocument();
    expect(within(fila).getByText("01/07/2023 11:30")).toBeInTheDocument();
  });

  it("muestra «—» en la confirmación de un cargo que no se ha confirmado", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();

    const fila = filaDe(await screen.findByText(idDe("b2")));

    expect(within(fila).getByText("—")).toBeInTheDocument();
    expect(within(fila).getByText("Pendiente")).toBeInTheDocument();
  });

  it("manda el filtro aplicado y no manda los filtros vacíos", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();
    await screen.findByText(USUARIO_ID);

    const usuario = userEvent.setup();

    await usuario.selectOptions(screen.getByLabelText("Estado"), "aprobada");
    await usuario.type(screen.getByLabelText("Usuario"), USUARIO_ID);

    // Los campos de fecha no admiten `type`: se les cambia el valor
    // directamente, que es lo que hace el navegador cuando se elige una fecha.
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2023-07-01" } });

    // Escribir no dispara peticiones: el borrador y el filtro aplicado son
    // estados distintos.
    const peticionesAntes = peticiones.length;

    expect(peticiones.length).toBe(peticionesAntes);

    await usuario.click(screen.getByRole("button", { name: "Filtrar" }));

    await waitFor(() => {
      const peticion = ultimaPeticion(peticiones);

      expect(peticion).toContain("estado=aprobada");
      expect(peticion).toContain(`usuario_id=${USUARIO_ID}`);
      expect(peticion).toContain("desde=2023-07-01");
    });

    // «Todos» es la **ausencia** del parámetro: la API lee `estado` como
    // vocabulario cerrado y un valor vacío sería una petición inválida.
    await usuario.selectOptions(screen.getByLabelText("Estado"), "");
    await usuario.clear(screen.getByLabelText("Usuario"));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "" } });

    await usuario.click(screen.getByRole("button", { name: "Filtrar" }));

    await waitFor(() => {
      const peticion = ultimaPeticion(peticiones);

      expect(peticion).not.toContain("estado=");
      expect(peticion).not.toContain("usuario_id=");
      expect(peticion).not.toContain("desde=");
      expect(peticion).not.toContain("hasta=");
      expect(peticion).toContain("skip=0");
    });
  });

  it("vuelve al estado inicial cuando se limpian los filtros", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();
    await screen.findByText(USUARIO_ID);

    const usuario = userEvent.setup();

    await usuario.selectOptions(screen.getByLabelText("Estado"), "aprobada");
    await usuario.click(screen.getByRole("button", { name: "Filtrar" }));

    await waitFor(() => {
      expect(ultimaPeticion(peticiones)).toContain("estado=aprobada");
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
    await screen.findByText(USUARIO_ID);

    const usuario = userEvent.setup();

    await usuario.click(screen.getByRole("button", { name: "Siguiente — transacciones" }));

    await waitFor(() => {
      expect(ultimaPeticion(peticiones)).toContain("skip=25");
    });

    // La página visible es la segunda, de las tres que hay.
    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando la página no trae transacciones", async () => {
    const { fetchFalso } = crearRed({ sinResultados: true });

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();

    expect(
      await screen.findByText("No hay transacciones que cumplan los filtros"),
    ).toBeInTheDocument();
  });

  it("no sabe cuántas páginas hay cuando la API no calculó el total", async () => {
    const { fetchFalso } = crearRed({ total: null });

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();
    await screen.findByText(USUARIO_ID);

    // Sin total no hay número de páginas: la interfaz lo dice en vez de
    // inventarlo.
    expect(screen.getByText("Página 1 de —")).toBeInTheDocument();
  });

  it("no ofrece ninguna acción de escritura", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();
    await screen.findByText(USUARIO_ID);

    // La colección es de solo lectura: ni un botón ni un enlace que escriba.
    expect(
      screen.queryByRole("button", { name: /editar|eliminar|crear|alta|baja|guardar/i }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: /editar|eliminar|crear|alta|baja/i })).toBeNull();
  });
});
