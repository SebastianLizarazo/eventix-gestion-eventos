import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@/api/tipos";
import { ExploradorUsuarios } from "@/pantallas/exploradores/usuarios";

/**
 * Pruebas del explorador de usuarios.
 *
 * La prueba intercepta el `fetch` global con respuestas falsas que tienen la
 * forma real del contrato, así que se prueba la cadena completa —el cliente,
 * los hooks y la pantalla— y no una maqueta.
 */

/**
 * Un usuario del contrato.
 *
 * El tipo de usuario es un **arreglo**: una cuenta puede ser asistente y
 * organizador a la vez, y la tabla lo muestra unido.
 */
const USUARIO: Usuario = {
  _id: "65a0000000000000000000b1",
  email: "ana@eventix.test",
  email_normalizado: "ana@eventix.test",
  nombre: "Ana Exploradora",
  documento_identidad: "CC-1000001",
  tipo_usuario: ["asistente", "organizador"],
  fecha_nacimiento: "1990-04-12",
  preferencias: {
    newsletter: true,
    idioma: "es-CO",
    canal_notif: ["email"],
  },
  estadisticas: {
    eventos_asistidos: 3,
    tickets_comprados: 1200,
    ltv_cop: 120000,
  },
  creado_en: "2023-07-01T10:00:00.000Z",
  actualizado_en: "2023-07-01T10:00:00.000Z",
  _v: 0,
};

/** Un identificador del contrato: 24 caracteres hexadecimales. */
function idDe(numero: number): string {
  return `65a${"0".repeat(19)}${numero.toString(16).padStart(2, "0")}`;
}

/**
 * Los usuarios que reparte la red falsa.
 *
 * Son 60 para que la paginación tenga algo que paginar: con 25 por página la
 * primera viene llena y hay tres páginas.
 */
const USUARIOS: Usuario[] = [
  USUARIO,
  ...Array.from({ length: 59 }, (_, indice) => {
    const numero = indice + 2;

    return {
      ...USUARIO,
      _id: idDe(numero),
      email: `persona${numero}@eventix.test`,
      email_normalizado: `persona${numero}@eventix.test`,
      nombre: `Persona ${numero}`,
      documento_identidad: `CC-${1000000 + numero}`,
      creado_en: "2023-07-02T10:00:00.000Z",
    };
  }),
];

/**
 * Red falsa: pagina de verdad a los usuarios que se le piden.
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
    opciones.total === undefined ? (sinResultados ? 0 : USUARIOS.length) : opciones.total;

  const fetchFalso = async (entrada: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(entrada), "http://eventix.test");

    peticiones.push(url.toString());

    const skip = Number(url.searchParams.get("skip") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 25);
    const items = sinResultados ? [] : USUARIOS.slice(skip, skip + limit);

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
      <ExploradorUsuarios />
    </QueryClientProvider>,
  );
}

/** La última petición que la pantalla le hizo a la API. */
function ultimaPeticion(peticiones: string[]): string {
  return peticiones[peticiones.length - 1] ?? "";
}

/** La fila de la tabla donde está un usuario. */
function filaDe(celda: HTMLElement): HTMLElement {
  const fila = celda.closest("tr");

  if (!(fila instanceof HTMLElement)) {
    throw new Error("El elemento no está en una fila de tabla");
  }

  return fila;
}

describe("explorador de usuarios", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra los usuarios con sus datos", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();

    const fila = filaDe(await screen.findByText("Ana Exploradora"));

    // El correo, con el nombre en la fila.
    expect(within(fila).getByText("ana@eventix.test")).toBeInTheDocument();

    // Los dos tipos de usuario, unidos: el contrato los guarda como arreglo.
    expect(within(fila).getByText("Asistente, Organizador")).toBeInTheDocument();

    // El idioma, que sale de las preferencias.
    expect(within(fila).getByText("es-CO")).toBeInTheDocument();

    // Los contadores, con el separador de miles de es-CO.
    expect(within(fila).getByText("1.200")).toBeInTheDocument();

    // El valor de vida, en pesos colombianos.
    expect(within(fila).getByText("COP 120.000")).toBeInTheDocument();

    // El alta, con fecha y hora.
    expect(within(fila).getByText("01/07/2023 10:00")).toBeInTheDocument();

    // El identificador, crudo.
    expect(within(fila).getByText(USUARIO._id)).toBeInTheDocument();
  });

  it("manda el filtro aplicado y no manda los filtros vacíos", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();
    await screen.findByText("Ana Exploradora");

    const usuario = userEvent.setup();

    // Escribir no dispara peticiones: el borrador y el filtro aplicado son
    // estados distintos.
    const peticionesAntes = peticiones.length;

    await usuario.selectOptions(screen.getByLabelText("Tipo de usuario"), "organizador");
    await usuario.type(screen.getByLabelText("Idioma"), "es-CO");

    expect(peticiones.length).toBe(peticionesAntes);

    await usuario.click(screen.getByRole("button", { name: "Filtrar" }));

    await waitFor(() => {
      const peticion = ultimaPeticion(peticiones);

      expect(peticion).toContain("tipo_usuario=organizador");
      expect(peticion).toContain("idioma=es-CO");
    });

    // «Todos» es la **ausencia** del parámetro: la API lee `tipo_usuario` como
    // vocabulario cerrado y un valor vacío sería una petición inválida.
    await usuario.selectOptions(screen.getByLabelText("Tipo de usuario"), "");
    await usuario.clear(screen.getByLabelText("Idioma"));

    await usuario.click(screen.getByRole("button", { name: "Filtrar" }));

    await waitFor(() => {
      const peticion = ultimaPeticion(peticiones);

      expect(peticion).not.toContain("tipo_usuario=");
      expect(peticion).not.toContain("idioma=");
      expect(peticion).toContain("skip=0");
    });
  });

  it("vuelve al estado inicial cuando se limpian los filtros", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();
    await screen.findByText("Ana Exploradora");

    const usuario = userEvent.setup();

    await usuario.selectOptions(screen.getByLabelText("Tipo de usuario"), "organizador");
    await usuario.click(screen.getByRole("button", { name: "Filtrar" }));

    await waitFor(() => {
      expect(ultimaPeticion(peticiones)).toContain("tipo_usuario=organizador");
    });

    await usuario.click(screen.getByRole("button", { name: "Limpiar" }));

    await waitFor(() => {
      expect(ultimaPeticion(peticiones)).not.toContain("tipo_usuario=");
    });

    // El control vuelve a «Todos» y el listado vuelve a la primera página.
    expect(screen.getByLabelText("Tipo de usuario")).toHaveValue("");
    expect(screen.getByText("Página 1 de 3")).toBeInTheDocument();
  });

  it("pide la página siguiente con su skip", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();
    await screen.findByText("Ana Exploradora");

    const usuario = userEvent.setup();

    await usuario.click(screen.getByRole("button", { name: "Siguiente — usuarios" }));

    await waitFor(() => {
      expect(ultimaPeticion(peticiones)).toContain("skip=25");
    });

    // La página visible es la segunda, de las tres que hay.
    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando la página no trae usuarios", async () => {
    const { fetchFalso } = crearRed({ sinResultados: true });

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();

    expect(await screen.findByText("No hay usuarios que cumplan los filtros")).toBeInTheDocument();
  });

  it("no sabe cuántas páginas hay cuando la API no calculó el total", async () => {
    const { fetchFalso } = crearRed({ total: null });

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();
    await screen.findByText("Ana Exploradora");

    // Sin total no hay número de páginas: la interfaz lo dice en vez de
    // inventarlo.
    expect(screen.getByText("Página 1 de —")).toBeInTheDocument();
  });

  it("no ofrece ninguna acción de escritura", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExplorador();
    await screen.findByText("Ana Exploradora");

    // La colección es de solo lectura: ni un botón ni un enlace que escriba.
    expect(
      screen.queryByRole("button", { name: /editar|eliminar|crear|alta|baja|guardar/i }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: /editar|eliminar|crear|alta|baja/i })).toBeNull();
  });
});
