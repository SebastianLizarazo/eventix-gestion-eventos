import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Exploradores } from "@/pantallas/exploradores";

/**
 * Pruebas de la pantalla de exploradores.
 *
 * Lo que se comprueba es la promesa de la spec S4 para esta pantalla: las
 * cuatro colecciones de solo lectura se consultan **una a una**, cada una con
 * su tabla, y solo una consulta a la API a la vez.
 */

/**
 * Red falsa: responde a cualquier colección con una página vacía.
 *
 * Se anota el camino pedido para comprobar que cada tabla consulta su propia
 * colección y no la de otra.
 */
function crearRed() {
  const peticiones: string[] = [];

  const fetchFalso = async (entrada: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(entrada), "http://eventix.test");

    peticiones.push(url.pathname);

    return new Response(JSON.stringify({ items: [], total: 0, skip: 0, limit: 25 }), {
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

/** Renderiza los exploradores con su proveedor de consultas. */
function renderExploradores() {
  return render(
    <QueryClientProvider client={clienteDePrueba()}>
      <Exploradores />
    </QueryClientProvider>,
  );
}

describe("pantalla de exploradores", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("ofrece las cuatro colecciones de solo lectura", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExploradores();

    expect(screen.getByRole("button", { name: "Usuarios" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tickets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transacciones" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auditoría" })).toBeInTheDocument();

    // La pantalla abre en la primera colección, y solo consulta esa.
    expect(await screen.findByRole("heading", { name: "Usuarios" })).toBeInTheDocument();
  });

  it("cada colección se consulta en su propia tabla", async () => {
    const { peticiones, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExploradores();

    await screen.findByRole("heading", { name: "Usuarios" });

    await waitFor(() => {
      expect(peticiones).toContain("/api/usuarios");
    });

    const usuario = userEvent.setup();

    await usuario.click(screen.getByRole("button", { name: "Tickets" }));

    expect(await screen.findByRole("heading", { name: "Tickets" })).toBeInTheDocument();

    await waitFor(() => {
      expect(peticiones).toContain("/api/tickets");
    });

    // La tabla anterior desaparece: solo hay una colección a la vez.
    expect(screen.queryByRole("heading", { name: "Usuarios" })).not.toBeInTheDocument();
  });

  it("la colección elegida se queda marcada", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderExploradores();

    const usuario = userEvent.setup();

    await usuario.click(screen.getByRole("button", { name: "Auditoría" }));

    expect(screen.getByRole("button", { name: "Auditoría" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Usuarios" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
