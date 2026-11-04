import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Evento } from "@/pantallas/evento";

/**
 * Pruebas de la ficha de evento.
 *
 * La prueba intercepta el `fetch` global con respuestas falsas que tienen la
 * forma real del contrato, así que se prueba la cadena completa —el cliente,
 * los hooks y la pantalla— y no una maqueta.
 */

/** Identificador del evento de la prueba. */
const ID_EVENTO = "65a0000000000000000000a1";

/** Identificador del lugar de la prueba. */
const ID_LUGAR = "65a0000000000000000000c1";

/** Un tipo de ticket del contrato. */
const TIPO_TICKET = {
  _id: "65a0000000000000000000d1",
  nombre: "General",
  precio_cop: 120000,
  aforo_total: 200,
  aforo_vendido: 150,
  restricciones: { edad_minima: 18, max_por_compra: 4 },
};

/** El lugar del evento. */
const LUGAR = {
  _id: ID_LUGAR,
  nombre: "Coliseo MedPlus",
  direccion: "Cra. 50 # 30-20",
  ciudad: "Bogotá",
  pais: "Colombia",
  capacidad_total: 12000,
  geometria: { type: "Point", coordinates: [-74.07, 4.6] },
  salas: [],
  activo: true,
  creado_en: "2023-01-01T00:00:00.000Z",
};

/** La base de un evento del contrato. */
const EVENTO_BASE = {
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
  tipos_ticket: [TIPO_TICKET],
  promociones: [],
  metricas_evento: { tickets_vendidos_total: 150, ingresos_cop: 18000000 },
  tags: ["rock"],
  creado_en: "2023-01-01T00:00:00.000Z",
  actualizado_en: "2023-01-02T00:00:00.000Z",
  _v: 3,
};

/**
 * Un evento académico: trae el bloque `academico`, que es el que el modelo
 * flexible permite.
 */
const EVENTO_ACADEMICO = {
  ...EVENTO_BASE,
  nombre: "Simposio de bases de datos",
  tipo_evento: "academico",
  configuracion_evento: {
    plantilla_id: "plantilla-academica",
    branding: {
      color_primario: "#1D4ED8",
      color_secundario: "#0F172A",
      logo_url: "https://ejemplo.edu/logo.png",
    },
    academico: {
      creditos: 12,
      certificado_url: "https://ejemplo.edu/certificado.pdf",
    },
  },
};

/**
 * Un evento con un bloque que **nadie escribió en la interfaz**: la prueba de
 * que los campos propios del tipo se muestran sin código nuevo.
 */
const EVENTO_BLOQUE_NUEVO = {
  ...EVENTO_BASE,
  nombre: "Congreso corporativo",
  tipo_evento: "corporativo",
  configuracion_evento: {
    corporativo: {
      jornada_horaria: 8,
      sede: "Auditorio central",
    },
  },
};

/** Cuerpo de la respuesta según la ruta que se pide. */
function cuerpoDe(url: string, evento: Record<string, unknown>): unknown {
  if (url.includes("/promociones")) {
    return [];
  }

  if (url.includes(`/lugares/${ID_LUGAR}`)) {
    return LUGAR;
  }

  if (url.includes(`/eventos/${ID_EVENTO}`)) {
    return evento;
  }

  return {
    error: { codigo: "no_encontrado", mensaje: "Ruta sin respuesta", request_id: "req-1" },
  };
}

/** `fetch` falso: responde con el contrato real de la API, sin red. */
function fetchFalso(evento: Record<string, unknown>): typeof fetch {
  return async (entrada: RequestInfo | URL) =>
    new Response(JSON.stringify(cuerpoDe(String(entrada), evento)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
}

/** Cliente de React Query sin reintentos: una prueba no espera tres intentos. */
function clienteDePrueba(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

/** Renderiza la ficha de evento dentro del enrutador. */
function renderFicha() {
  const cliente = clienteDePrueba();

  function Envoltura({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
  }

  return render(
    <Envoltura>
      <MemoryRouter initialEntries={[`/eventos/${ID_EVENTO}`]}>
        <Routes>
          <Route path="/eventos/:id" element={<Evento />} />
        </Routes>
      </MemoryRouter>
    </Envoltura>,
  );
}

describe("ficha de evento", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra los datos del evento, sus tipos de ticket y su ocupación", async () => {
    vi.stubGlobal("fetch", fetchFalso(EVENTO_BASE));

    renderFicha();

    expect(await screen.findByText("Concierto de rock")).toBeInTheDocument();

    // El vocabulario del dominio, en español.
    expect(screen.getByText("Publicado")).toBeInTheDocument();
    expect(screen.getByText("Público")).toBeInTheDocument();
    expect(screen.getByText("Masivo")).toBeInTheDocument();

    // El lugar, con su nombre y no solo su identificador: llega en su propia
    // consulta, después del evento.
    expect(await screen.findByText("Coliseo MedPlus")).toBeInTheDocument();

    // El tipo de ticket, con su precio y su ocupación.
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("COP 120.000")).toBeInTheDocument();
    expect(screen.getByText("150 / 200")).toBeInTheDocument();

    // La ficha enlaza con la gestión, que es donde se edita el evento.
    expect(screen.getByRole("link", { name: "Editar" })).toHaveAttribute(
      "href",
      `/gestion/eventos/${ID_EVENTO}`,
    );
  });

  it("muestra el bloque de configuración propio del tipo de evento", async () => {
    vi.stubGlobal("fetch", fetchFalso(EVENTO_ACADEMICO));

    renderFicha();

    // El bloque `academico` aparece con sus campos, sin que la interfaz los
    // conozca de antemano.
    expect(await screen.findByText("Simposio de bases de datos")).toBeInTheDocument();
    expect(screen.getByText("academico")).toBeInTheDocument();
    expect(screen.getByText("creditos")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("certificado_url")).toBeInTheDocument();
    expect(screen.getByText("https://ejemplo.edu/certificado.pdf")).toBeInTheDocument();
  });

  it("muestra un bloque de configuración que la interfaz no conoce", async () => {
    vi.stubGlobal("fetch", fetchFalso(EVENTO_BLOQUE_NUEVO));

    renderFicha();

    expect(await screen.findByText("Congreso corporativo")).toBeInTheDocument();
    expect(screen.getByText("corporativo")).toBeInTheDocument();
    expect(screen.getByText("jornada_horaria")).toBeInTheDocument();
    expect(screen.getByText("Auditorio central")).toBeInTheDocument();
  });

  it("ofrece comprar un ticket del evento", async () => {
    vi.stubGlobal("fetch", fetchFalso(EVENTO_BASE));

    renderFicha();

    const enlace = await screen.findByRole("link", { name: "Comprar" });

    // La compra arranca con el evento ya elegido: su identificador viaja en
    // la ruta de la pantalla de compra.
    expect(enlace).toHaveAttribute("href", `/compra?evento=${ID_EVENTO}`);
  });
});
