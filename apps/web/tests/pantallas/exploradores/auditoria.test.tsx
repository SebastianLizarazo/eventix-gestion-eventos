import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Auditoria } from "@/api/tipos";
import { ExploradorAuditoria } from "@/pantallas/exploradores/auditoria";

/**
 * Pruebas del explorador de auditoría.
 *
 * La prueba intercepta el `fetch` global con respuestas falsas que tienen la
 * forma real del contrato, así que se prueba la cadena completa —el cliente,
 * los hooks y la pantalla— y no una maqueta.
 */

/** Un identificador del contrato: 24 caracteres hexadecimales. */
function idDe(hex: string): string {
  return `65a${"0".repeat(19)}${hex}`;
}

/** El actor del primer registro: el sistema. */
const ACTOR_ID = idDe("b1");

/** El sujeto del primer registro: la transacción del cargo. */
const SUJETO_ID = idDe("f1");

/**
 * Un registro de auditoría del contrato.
 *
 * El actor es el sistema —no una persona— porque el rastro lo escribe la
 * compra cuando emite el ticket.
 */
const REGISTRO: Auditoria = {
  _id: idDe("a1"),
  actor_id: ACTOR_ID,
  actor_rol: "sistema",
  accion: "compra.registrada",
  sujeto_tipo: "transaccion",
  sujeto_id: SUJETO_ID,
  metadata: { codigo: "COMPRA-1", motivo: "venta" },
  ocurrido_en: "2023-07-01T10:00:00.000Z",
};

/**
 * Un registro sin detalle.
 *
 * El `metadata` llega vacío: la tabla lo dice con «—», no con una celda
 * en blanco que parece un dato que no se cargó.
 */
const REGISTRO_SIN_DETALLE: Auditoria = {
  _id: idDe("a2"),
  actor_id: idDe("b2"),
  actor_rol: "organizador",
  accion: "evento.actualizado",
  sujeto_tipo: "evento",
  sujeto_id: idDe("c2"),
  metadata: {},
  ocurrido_en: "2023-07-02T10:00:00.000Z",
};

/**
 * Los registros que reparte la red falsa.
 *
 * Son 60 para que la paginación tenga algo que paginar: con 25 por página la
 * primera viene llena y hay tres páginas.
 */
const REGISTROS: Auditoria[] = [
  REGISTRO,
  REGISTRO_SIN_DETALLE,
  ...Array.from({ length: 58 }, (_, indice) => {
    const numero = indice + 3;
    const hex = numero.toString(16).padStart(2, "0");

    return {
      ...REGISTRO,
      _id: idDe(hex),
      actor_id: idDe(hex),
      actor_rol: "asistente" as const,
      accion: "ticket.emitido",
      sujeto_tipo: "ticket" as const,
      sujeto_id: idDe(`e${hex.charAt(1)}`),
      metadata: { tipo_ticket_id: idDe(`d${hex.charAt(1)}`) },
      ocurrido_en: "2023-07-03T10:00:00.000Z",
    };
  }),
];

/**
 * Red falsa: pagina de verdad a los registros que se le piden.
 *
 * Devuelve la forma real del contrato —`items`, `total`, `skip` y `limit`— y
 * anota las URLs pedidas: eso es lo que permite comprobar qué filtro viaja y
 * cuál no.
 */
function crearRed(opciones: { total?: number | null; sinResultados?: boolean } = {}) {
  const peticiones: string[] = [];
  const sinResultados = opciones.sinResultados ?? false;
  const total =
    opciones.total === undefined ? (sinResultados ? 0 : REGISTROS.length) : opciones.total;

  const fetchFalso = async (entrada: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(entrada), "http://eventix.test");

    peticiones.push(url.toString());

    const skip = Number(url.searchParams.get("skip") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 25);
    const items = sinResultados ? [] : REGISTROS.slice(skip, skip + limit);

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
      <ExploradorAuditoria />
    </QueryClientProvider>,
  );
}

/** La última petición que la pantalla le hizo a la API. */
function ultimaPeticion(peticiones: string[]): string {
  return peticiones[peticiones.length - 1] ?? "";
}

/** La fila de la tabla donde está un registro. */
function filaDe(celda: HTMLElement): HTMLElement {
  const fila = celda.closest("tr");

  if (!(fila instanceof HTMLElement)) {
    throw new Error("El elemento no está en una fila de tabla");
  }

  return fila;
}

describe("explorador de auditoría", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra los registros con su actor, su rol, su acción y su sujeto", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();

    const fila = filaDe(await screen.findByText(ACTOR_ID));

    // El rol del actor, con su etiqueta en español.
    expect(within(fila).getByText("Sistema")).toBeInTheDocument();

    // La acción, tal como la nombra el dominio.
    expect(within(fila).getByText("compra.registrada")).toBeInTheDocument();

    // El sujeto: el tipo con su etiqueta y el documento crudo.
    expect(within(fila).getByText("Transacción")).toBeInTheDocument();
    expect(within(fila).getByText(SUJETO_ID)).toBeInTheDocument();

    // El detalle: las claves que trae el `metadata`.
    expect(within(fila).getByText("codigo, motivo")).toBeInTheDocument();

    // Cuándo ocurrió, con fecha y hora.
    expect(within(fila).getByText("01/07/2023 10:00")).toBeInTheDocument();
  });

  it("muestra «—» en el detalle de un registro que no trae metadata", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();

    const fila = filaDe(await screen.findByText(idDe("b2")));

    expect(within(fila).getByText("—")).toBeInTheDocument();
    expect(within(fila).getByText("Organizador")).toBeInTheDocument();
  });

  it("manda el filtro de rol y de tipo de sujeto y no manda los vacíos", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();
    await screen.findByText(ACTOR_ID);

    const usuario = userEvent.setup();

    await usuario.selectOptions(screen.getByLabelText("Rol del actor"), "sistema");
    await usuario.selectOptions(screen.getByLabelText("Tipo de sujeto"), "transaccion");
    await usuario.type(screen.getByLabelText("Actor"), ACTOR_ID);
    await usuario.type(screen.getByLabelText("Sujeto"), SUJETO_ID);

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

      expect(peticion).toContain("actor_rol=sistema");
      expect(peticion).toContain("sujeto_tipo=transaccion");
      expect(peticion).toContain(`actor_id=${ACTOR_ID}`);
      expect(peticion).toContain(`sujeto_id=${SUJETO_ID}`);
      expect(peticion).toContain("desde=2023-07-01");
    });

    // «Todos» es la **ausencia** del parámetro: la API lee `actor_rol` y
    // `sujeto_tipo` como vocabularios cerrados y un valor vacío sería una
    // petición inválida.
    await usuario.selectOptions(screen.getByLabelText("Rol del actor"), "");
    await usuario.selectOptions(screen.getByLabelText("Tipo de sujeto"), "");
    await usuario.clear(screen.getByLabelText("Actor"));
    await usuario.clear(screen.getByLabelText("Sujeto"));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "" } });

    await usuario.click(screen.getByRole("button", { name: "Filtrar" }));

    await waitFor(() => {
      const peticion = ultimaPeticion(peticiones);

      expect(peticion).not.toContain("actor_rol=");
      expect(peticion).not.toContain("sujeto_tipo=");
      expect(peticion).not.toContain("actor_id=");
      expect(peticion).not.toContain("sujeto_id=");
      expect(peticion).not.toContain("desde=");
      expect(peticion).toContain("skip=0");
    });
  });

  it("explica que el rastro es de solo adición y no ofrece ninguna escritura", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();
    await screen.findByText(ACTOR_ID);

    // La pantalla dice por qué no hay nada que escribir: el rastro se lee y se
    // añade, pero no se puede modificar ni borrar.
    expect(screen.getByText(/no se puede modificar ni borrar/)).toBeInTheDocument();

    // Y no ofrece ninguna acción de escritura: ni un botón ni un enlace.
    expect(
      screen.queryByRole("button", { name: /editar|eliminar|crear|alta|baja|guardar/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: /editar|eliminar|crear|alta|baja|guardar/i }),
    ).toBeNull();
  });

  it("pide la página siguiente con su skip", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();
    await screen.findByText(ACTOR_ID);

    const usuario = userEvent.setup();

    await usuario.click(screen.getByRole("button", { name: "Siguiente — auditoría" }));

    await waitFor(() => {
      expect(ultimaPeticion(peticiones)).toContain("skip=25");
    });

    // La página visible es la segunda, de las tres que hay.
    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
  });

  it("muestra el 405 de la auditoría como lo que es", async () => {
    const fetchFalso = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          error: {
            codigo: "metodo_no_permitido",
            mensaje: "El registro de auditoría no se puede modificar ni borrar",
            request_id: "req-405-auditoria",
          },
        }),
        {
          status: 405,
          headers: { "content-type": "application/json" },
        },
      );

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();

    // El mensaje de la API y el `request_id`: la respuesta de la API, no un
    // fallo de transporte.
    expect(
      await screen.findByText("El registro de auditoría no se puede modificar ni borrar"),
    ).toBeInTheDocument();
    expect(screen.getByText("req-405-auditoria")).toBeInTheDocument();
    expect(screen.queryByText("No se pudo hablar con la API")).toBeNull();
  });
});
