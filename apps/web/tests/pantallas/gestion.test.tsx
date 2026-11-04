import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormularioEvento } from "@/pantallas/gestion/evento-form";
import { GestionEventos } from "@/pantallas/gestion";

/**
 * Pruebas de la gestión de eventos.
 *
 * La red es falsa, pero no es una maqueta: el `fetch` global responde con la
 * forma real del contrato y **anota método, URL y cuerpo** de cada petición.
 * Lo que se comprueba es lo que la gestión promete:
 *
 * - la tabla muestra los eventos con su estado y su versión;
 * - la baja pide confirmación antes de borrar;
 * - el alta manda un `POST` con los datos del formulario;
 * - la edición manda un `PATCH` **con la versión que se leyó**, que es lo que
 *   permite que el servidor responda `409` si el evento cambió;
 * - un `409` se muestra como un conflicto y no como un fallo genérico;
 * - los tipos de ticket van contra el sub-recurso del evento.
 */

/** Identificador del evento de la prueba. */
const ID_EVENTO = "65a0000000000000000000a1";

/** Identificador del organizador. */
const ID_ORGANIZADOR = "65a0000000000000000000b1";

/** Identificador del lugar. */
const ID_LUGAR = "65a0000000000000000000c1";

/** El evento que la API devuelve. */
const EVENTO = {
  _id: ID_EVENTO,
  slug: "concierto-de-rock",
  nombre: "Concierto de rock",
  tipo_evento: "masivo",
  descripcion: "Una noche de rock.",
  fecha_inicio: "2026-03-15T18:00:00.000Z",
  fecha_fin: "2026-03-15T23:00:00.000Z",
  estado: "publicado",
  visibilidad: "publico",
  organizador_id: ID_ORGANIZADOR,
  lugar_id: ID_LUGAR,
  categorias: ["conciertos"],
  configuracion_evento: {},
  tipos_ticket: [],
  promociones: [],
  tags: [],
  creado_en: "2026-03-01T00:00:00.000Z",
  actualizado_en: "2026-03-01T00:00:00.000Z",
  _v: 7,
};

/** El lugar de la prueba. */
const LUGAR = {
  _id: ID_LUGAR,
  nombre: "Coliseo MedPlus",
  direccion: "Carrera 50 # 8-30",
  ciudad: "Bogotá",
  direccion_geo: { type: "Point", coordinates: [-74.07, 4.6] },
  caracteristicas: { aforo: 4000, accesible: true },
};

/** El organizador de la prueba. */
const ORGANIZADOR = {
  _id: ID_ORGANIZADOR,
  nombre: "Ana Organizadora",
  email: "ana@eventix.dev",
  documento_identidad: "CC123456",
  tipo_usuario: "organizador",
  idioma: "es",
  canales_notificacion: ["email"],
  preferencias_notificacion: {},
  creado_en: "2026-02-01T00:00:00.000Z",
  actualizado_en: "2026-02-01T00:00:00.000Z",
  _v: 0,
};

/** El contrato que publica la API: el que construye la configuración. */
const CONTRATO = {
  openapi: "3.1.0",
  info: { title: "Eventix API", version: "0.1.0" },
  paths: {},
  components: {
    schemas: {
      EventoEntrada: {
        type: "object",
        properties: {
          configuracion_evento: {
            type: "object",
            properties: {
              academico: {
                type: "object",
                properties: { creditos: { type: "integer" } },
              },
            },
          },
        },
      },
    },
  },
};

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
function crearRed(opciones?: { conflicto?: boolean }) {
  const peticiones: Peticion[] = [];

  const fetchFalso = async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(entrada);
    const metodo = init?.method ?? "GET";
    const cuerpo =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;

    peticiones.push({ metodo, url, cuerpo });

    if (metodo === "DELETE") {
      return new Response(null, { status: 204 });
    }

    if (url.includes("/api/openapi.json")) {
      return respuesta(CONTRATO, 200);
    }

    if (url.includes("/api/lugares")) {
      return respuesta({ items: [LUGAR], total: 1, skip: 0, limit: 200 }, 200);
    }

    if (url.includes("/api/usuarios")) {
      return respuesta({ items: [ORGANIZADOR], total: 1, skip: 0, limit: 25 }, 200);
    }

    if (url.endsWith("/promociones") || url.endsWith("/tipos-ticket")) {
      return respuesta([], 200);
    }

    if (metodo === "PATCH" && opciones?.conflicto === true) {
      return respuesta(
        {
          error: {
            codigo: "conflicto",
            mensaje: "El recurso cambió desde que se leyó",
            request_id: "req-conflicto",
          },
        },
        409,
      );
    }

    if (metodo === "POST" || metodo === "PATCH") {
      return respuesta(EVENTO, metodo === "POST" ? 201 : 200);
    }

    if (/^\/api\/eventos\/[0-9a-f]{24}$/.test(url)) {
      return respuesta(EVENTO, 200);
    }

    return respuesta({ items: [EVENTO], total: 1, skip: 0, limit: 25 }, 200);
  };

  return { peticiones, fetchFalso };
}

/** Cliente de React Query sin reintentos: una prueba no espera tres intentos. */
function clienteDePrueba(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

/** Renderiza la tabla de gestión dentro del enrutador. */
function renderGestion() {
  const cliente = clienteDePrueba();

  function Envoltura({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
  }

  return render(
    <Envoltura>
      <MemoryRouter initialEntries={["/gestion/eventos"]}>
        <Routes>
          <Route path="/gestion/eventos" element={<GestionEventos />} />
        </Routes>
      </MemoryRouter>
    </Envoltura>,
  );
}

/** Renderiza el formulario dentro del enrutador, en el alta o en la edición. */
function renderFormulario(ruta: string) {
  const cliente = clienteDePrueba();

  function Envoltura({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
  }

  return render(
    <Envoltura>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/gestion/eventos/nuevo" element={<FormularioEvento />} />
          <Route path="/gestion/eventos/:id" element={<FormularioEvento />} />
        </Routes>
      </MemoryRouter>
    </Envoltura>,
  );
}

/** Llena los campos obligatorios del formulario de un evento nuevo. */
function llenarFormulario(): void {
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Concierto de rock" } });
  fireEvent.change(screen.getByLabelText("Comienza"), {
    target: { value: "2026-03-15T18:00" },
  });
  fireEvent.change(screen.getByLabelText("Termina"), { target: { value: "2026-03-15T23:00" } });
  fireEvent.change(screen.getByLabelText("Lugar"), { target: { value: ID_LUGAR } });
  fireEvent.change(screen.getByLabelText("Organizador"), {
    target: { value: ID_ORGANIZADOR },
  });
  fireEvent.change(screen.getByLabelText("Categorías"), {
    target: { value: "conciertos, rock" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Gestión de eventos", () => {
  it("la tabla muestra los eventos con su versión y sus acciones", async () => {
    const { fetchFalso } = crearRed();
    vi.stubGlobal("fetch", fetchFalso);

    renderGestion();

    expect(await screen.findByRole("link", { name: "Concierto de rock" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Editar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
    // La versión del documento: es la que viaja en la edición.
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("la baja pide confirmación antes de borrar", async () => {
    const { peticiones, fetchFalso } = crearRed();
    vi.stubGlobal("fetch", fetchFalso);

    renderGestion();

    fireEvent.click(await screen.findByRole("button", { name: "Eliminar" }));

    expect(screen.getByText("¿Eliminar el evento?")).toBeInTheDocument();
    expect(peticiones.some((peticion) => peticion.metodo === "DELETE")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    await waitFor(() =>
      expect(
        peticiones.some(
          (peticion) =>
            peticion.metodo === "DELETE" && peticion.url === `/api/eventos/${ID_EVENTO}`,
        ),
      ).toBe(true),
    );
  });
});

describe("Formulario de evento", () => {
  it("el alta manda un POST con los datos del formulario", async () => {
    const { peticiones, fetchFalso } = crearRed();
    vi.stubGlobal("fetch", fetchFalso);

    renderFormulario("/gestion/eventos/nuevo");

    await screen.findByLabelText("Nombre");

    llenarFormulario();

    fireEvent.click(screen.getByRole("button", { name: "Crear evento" }));

    await waitFor(() =>
      expect(peticiones.some((peticion) => peticion.metodo === "POST")).toBe(true),
    );

    const peticion = peticiones.find((item) => item.metodo === "POST");

    expect(peticion?.url).toBe("/api/eventos");
    expect(peticion?.cuerpo?.nombre).toBe("Concierto de rock");
    expect(peticion?.cuerpo?.tipo_evento).toBe("corporativo");
    expect(peticion?.cuerpo?.lugar_id).toBe(ID_LUGAR);
    expect(peticion?.cuerpo?.organizador_id).toBe(ID_ORGANIZADOR);
    expect(peticion?.cuerpo?.categorias).toEqual(["conciertos", "rock"]);
    expect(peticion?.cuerpo?.fecha_inicio).toBe("2026-03-15T18:00:00.000Z");
  });

  it("la edición manda un PATCH con la versión que se leyó", async () => {
    const { peticiones, fetchFalso } = crearRed();
    vi.stubGlobal("fetch", fetchFalso);

    renderFormulario(`/gestion/eventos/${ID_EVENTO}`);

    const nombre = await screen.findByLabelText("Nombre");

    expect(nombre).toHaveValue("Concierto de rock");

    fireEvent.change(nombre, { target: { value: "Concierto de rock II" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(peticiones.some((peticion) => peticion.metodo === "PATCH")).toBe(true),
    );

    const peticion = peticiones.find((item) => item.metodo === "PATCH");

    expect(peticion?.url).toBe(`/api/eventos/${ID_EVENTO}`);
    expect(peticion?.cuerpo?.nombre).toBe("Concierto de rock II");
    expect(peticion?.cuerpo?._v).toBe(7);
  });

  it("un conflicto de versión se muestra como un conflicto", async () => {
    const { fetchFalso } = crearRed({ conflicto: true });
    vi.stubGlobal("fetch", fetchFalso);

    renderFormulario(`/gestion/eventos/${ID_EVENTO}`);

    const nombre = await screen.findByLabelText("Nombre");

    fireEvent.change(nombre, { target: { value: "Otro nombre" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    // El título dice que no se pudo guardar (sin inventar el motivo: un
    // conflicto puede ser la versión o el slug repetido) y el mensaje de la
    // API dice cuál fue.
    expect(await screen.findByText("No se pudo guardar el evento")).toBeInTheDocument();
    expect(screen.getByText("El recurso cambió desde que se leyó")).toBeInTheDocument();
  });

  it("la configuración se construye con los campos que declara el contrato", async () => {
    const { fetchFalso } = crearRed();
    vi.stubGlobal("fetch", fetchFalso);

    renderFormulario(`/gestion/eventos/${ID_EVENTO}`);

    // El bloque `academico` del contrato, con su campo `creditos`: la interfaz
    // no lo conoce de antemano.
    expect(await screen.findByLabelText("Creditos")).toBeInTheDocument();
  });

  it("el alta de un tipo de ticket va contra el sub-recurso del evento", async () => {
    const { peticiones, fetchFalso } = crearRed();
    vi.stubGlobal("fetch", fetchFalso);

    renderFormulario(`/gestion/eventos/${ID_EVENTO}`);

    fireEvent.click(await screen.findByRole("button", { name: "Nuevo tipo de ticket" }));

    // El formulario del tipo de ticket convive con el del evento: se apunta
    // al control del panel, no al primero que se encuentre.
    fireEvent.change(screen.getByLabelText("Nombre", { selector: "#tipo-nombre" }), {
      target: { value: "General" },
    });
    fireEvent.change(screen.getByLabelText("Precio (COP)"), {
      target: { value: "120000" },
    });
    fireEvent.change(screen.getByLabelText("Aforo total"), { target: { value: "200" } });

    fireEvent.click(screen.getByRole("button", { name: "Guardar tipo de ticket" }));

    await waitFor(() =>
      expect(peticiones.some((peticion) => peticion.metodo === "POST")).toBe(true),
    );

    const peticion = peticiones.find((item) => item.metodo === "POST");

    expect(peticion?.url).toBe(`/api/eventos/${ID_EVENTO}/tipos-ticket`);
    expect(peticion?.cuerpo?.nombre).toBe("General");
    expect(peticion?.cuerpo?.precio_cop).toBe(120000);
    expect(peticion?.cuerpo?.aforo_total).toBe(200);
  });
});
