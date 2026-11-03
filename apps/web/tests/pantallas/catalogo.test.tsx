import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Catalogo } from "@/pantallas/catalogo";

/**
 * Pruebas de la pantalla de catálogo.
 *
 * Igual que en la pantalla de inicio, la API no se simula con un módulo
 * mockeado: **se intercepta el `fetch` global** con respuestas falsas que tienen
 * la forma real del contrato. Así se prueba la cadena completa —el cliente, los
 * hooks y la pantalla— y no una maqueta.
 *
 * La pantalla usa `Link`, así que se renderiza dentro de un `MemoryRouter`.
 */

/** Identificador del evento de la prueba. */
const ID_EVENTO = "65a0000000000000000000a1";

/** Identificador del lugar de la prueba. */
const ID_LUGAR = "65a0000000000000000000c1";

/** Un evento del contrato, con sus tipos de ticket embebidos. */
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
  lugar_id: ID_LUGAR,
  categorias: ["musica"],
  configuracion_evento: {},
  tipos_ticket: [
    {
      _id: "65a0000000000000000000d1",
      nombre: "General",
      precio_cop: 120000,
      aforo_total: 200,
      aforo_vendido: 150,
      restricciones: {},
    },
  ],
  promociones: [],
  metricas_evento: { tickets_vendidos_total: 150, ingresos_cop: 18000000 },
  tags: [],
  creado_en: "2023-01-01T00:00:00.000Z",
  actualizado_en: "2023-01-01T00:00:00.000Z",
  _v: 0,
};

/** Un lugar del contrato: el sitio donde se hace el evento. */
const LUGAR = {
  _id: ID_LUGAR,
  nombre: "Coliseo MedPlus",
  direccion: "Carrera 50 # 8-60",
  ciudad: "Medellín",
  pais: "CO",
  capacidad_total: 12000,
  geometria: { type: "Point", coordinates: [-75.5636, 6.2519] },
  salas: [],
  activo: true,
  creado_en: "2023-01-01T00:00:00.000Z",
};

/** Red falsa: responde con la forma real del contrato y anota lo que se pidió. */
function crearRed() {
  const peticiones: string[] = [];

  const cuerpoDe = (url: string): unknown => {
    if (url.includes("/lugares")) {
      return { items: [LUGAR], total: 1, skip: 0, limit: 100 };
    }

    if (url.includes("/eventos")) {
      return { items: [EVENTO], total: 157, skip: 0, limit: 12 };
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

/** Renderiza el catálogo con su proveedor de consultas y su router. */
function renderCatalogo() {
  return render(
    <QueryClientProvider client={clienteDePrueba()}>
      <MemoryRouter>
        <Catalogo />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** La última petición que la pantalla le hizo a la lista de eventos. */
function ultimaPeticionDeEventos(peticiones: string[]): string {
  const deEventos = peticiones.filter((url) => url.includes("/api/eventos"));

  return deEventos[deEventos.length - 1] ?? "";
}

describe("pantalla de catálogo", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra los eventos con su fecha y su lugar", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderCatalogo();

    // El nombre del evento es el enlace a su ficha.
    const enlace = await screen.findByRole("link", { name: "Concierto de rock" });

    expect(enlace).toHaveAttribute("href", `/eventos/${ID_EVENTO}`);

    // La fecha de inicio, en formato es-CO.
    expect(screen.getByText("01/07/2023")).toBeInTheDocument();

    // El lugar, buscado por su identificador en la lista de lugares.
    expect(screen.getByText("Coliseo MedPlus")).toBeInTheDocument();
  });

  it("manda los filtros del contrato al filtrar", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderCatalogo();
    await screen.findByRole("link", { name: "Concierto de rock" });

    const usuario = userEvent.setup();

    await usuario.selectOptions(screen.getByLabelText("Tipo de evento"), "masivo");
    await usuario.type(screen.getByLabelText("Categoría"), "musica");
    await usuario.type(screen.getByLabelText("Búsqueda"), "rock");
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2023-07-01" } });

    // Escribir no dispara peticiones: el borrador y los filtros aplicados son
    // estados distintos.
    const peticionesAntes = peticiones.length;

    await usuario.click(screen.getByRole("button", { name: "Filtrar" }));

    await waitFor(() => {
      const peticion = ultimaPeticionDeEventos(peticiones);

      expect(peticion).toContain("tipo_evento=masivo");
      expect(peticion).toContain("categoria=musica");
      expect(peticion).toContain("q=rock");
      expect(peticion).toContain("desde=2023-07-01");
      expect(peticion).toContain("estado=publicado");
      expect(peticion).toContain("limit=12");
    });

    // Una sola petición nueva: la de los eventos filtrados.
    expect(peticiones.length).toBe(peticionesAntes + 1);
  });

  it("avanza de página sin perder los filtros aplicados", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderCatalogo();
    await screen.findByRole("link", { name: "Concierto de rock" });

    const usuario = userEvent.setup();

    await usuario.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => {
      expect(ultimaPeticionDeEventos(peticiones)).toContain("skip=12");
    });

    // La página visible es la segunda y el total sigue en pie.
    expect(screen.getByText("Página 2 de 14")).toBeInTheDocument();
    expect(screen.getByText("157 eventos")).toBeInTheDocument();
  });

  it("limpiar borra los filtros y vuelve a la primera página", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderCatalogo();
    await screen.findByRole("link", { name: "Concierto de rock" });

    const usuario = userEvent.setup();

    await usuario.selectOptions(screen.getByLabelText("Tipo de evento"), "masivo");
    await usuario.click(screen.getByRole("button", { name: "Filtrar" }));

    await waitFor(() => {
      expect(ultimaPeticionDeEventos(peticiones)).toContain("tipo_evento=masivo");
    });

    await usuario.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => {
      expect(ultimaPeticionDeEventos(peticiones)).toContain("skip=12");
    });

    await usuario.click(screen.getByRole("button", { name: "Limpiar" }));

    await waitFor(() => {
      const peticion = ultimaPeticionDeEventos(peticiones);

      expect(peticion).not.toContain("tipo_evento=masivo");
      expect(peticion).toContain("estado=publicado");
      expect(peticion).toContain("skip=0");
    });
  });
});
