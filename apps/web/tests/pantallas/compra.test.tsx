import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Compra as PantallaCompra } from "@/pantallas/compra";

/**
 * Pruebas del flujo de compra.
 *
 * La prueba intercepta el `fetch` global con respuestas falsas que tienen la
 * forma real del contrato, así que se prueba la cadena completa —el cliente,
 * los hooks y la pantalla— y no una maqueta.
 *
 * Lo que se mira aquí es lo que el hito promete: el cuerpo completo de la
 * compra, el ticket emitido con su código, el motivo del fallo y la
 * idempotencia de la referencia.
 */

/** Identificador del evento de la prueba. */
const ID_EVENTO = "65a0000000000000000000a1";

/** Identificador del tipo de ticket de la prueba. */
const ID_TIPO = "65a0000000000000000000d1";

/** Identificador de la compradora. */
const ID_COMPRADORA = "65a0000000000000000000b1";

/** Identificador de la otra persona (la que asiste sin pagar). */
const ID_OTRA = "65a0000000000000000000b2";

/** Un usuario del contrato. */
function usuario(id: string, nombre: string, correo: string) {
  return {
    _id: id,
    email: correo,
    email_normalizado: correo,
    nombre,
    documento_identidad: `CC-${id.slice(-4)}`,
    tipo_usuario: ["asistente"],
    preferencias: { newsletter: false, idioma: "es", canal_notif: [] },
    estadisticas: { eventos_asistidos: 0, tickets_comprados: 0, ltv_cop: 0 },
    creado_en: "2023-06-01T00:00:00.000Z",
    actualizado_en: "2023-06-01T00:00:00.000Z",
    _v: 0,
  };
}

/** Los dos usuarios de la prueba. */
const USUARIOS = [
  usuario(ID_COMPRADORA, "Ana Compradora", "ana@eventix.test"),
  usuario(ID_OTRA, "Beto Asistente", "beto@eventix.test"),
];

/** El evento de la prueba, con su tipo de ticket y su promoción. */
const EVENTO = {
  _id: ID_EVENTO,
  slug: "rock-fest",
  nombre: "Rock Fest",
  tipo_evento: "masivo",
  descripcion: "El festival",
  fecha_inicio: "2023-07-01T18:00:00.000Z",
  fecha_fin: "2023-07-01T23:00:00.000Z",
  estado: "publicado",
  visibilidad: "publico",
  organizador_id: "65a0000000000000000000b9",
  lugar_id: "65a0000000000000000000c1",
  categorias: ["conciertos"],
  configuracion_evento: {},
  tipos_ticket: [
    {
      _id: ID_TIPO,
      nombre: "General",
      precio_cop: 120000,
      aforo_total: 100,
      aforo_vendido: 10,
      restricciones: {},
    },
  ],
  promociones: [
    {
      codigo: "VERANO10",
      tipo: "porcentaje",
      valor: 10,
      aplica_a_tipo_ticket_ids: [],
      vigencia_inicio: "2023-06-01T00:00:00.000Z",
      vigencia_fin: "2023-07-01T00:00:00.000Z",
      usos_maximos: 100,
      usos_realizados: 0,
      activo: true,
    },
  ],
  metricas_evento: {
    tickets_vendidos_total: 10,
    ingresos_cop: 1200000,
    ultima_actualizacion: "2023-07-01T00:00:00.000Z",
  },
  tags: [],
  creado_en: "2023-06-01T00:00:00.000Z",
  actualizado_en: "2023-06-01T00:00:00.000Z",
  _v: 0,
};

/** El ticket emitido por la compra. */
const TICKET = {
  _id: "65a0000000000000000000e1",
  codigo_qr: "QR-EMITIDO-1",
  estado: "emitido",
  evento_id: ID_EVENTO,
  comprado_por_usuario_id: ID_COMPRADORA,
  snapshot_tipo_ticket: { tipo_ticket_id: ID_TIPO, nombre: "General", precio_cop: 120000 },
  asistente_snapshot: {
    usuario_id: ID_COMPRADORA,
    nombre: "Ana Compradora",
    documento_identidad: "CC-00b1",
    email: "ana@eventix.test",
  },
  precio_pagado_cop: 120000,
  transaccion_id: "65a0000000000000000000f1",
  emitido_en: "2023-07-01T10:00:00.000Z",
  revalidaciones: [],
  _v: 0,
};

/** La transacción del cargo. */
const TRANSACCION = {
  _id: "65a0000000000000000000f1",
  usuario_id: ID_COMPRADORA,
  ticket_id: TICKET._id,
  monto_cop: 120000,
  moneda: "COP",
  metodo_pago: "tarjeta_credito",
  pasarela: "demo",
  estado: "aprobada",
  referencia_pasarela: "WEB-PRUEBA-1",
  creada_en: "2023-07-01T10:00:00.000Z",
  confirmada_en: "2023-07-01T10:00:00.000Z",
};

/** La respuesta de una compra nueva. */
const COMPRA = {
  ticket: TICKET,
  transaccion: TRANSACCION,
  idempotente: false,
  promocion_codigo: null,
};

/** Una respuesta JSON de la API. */
function respuesta(cuerpo: string, estado = 200): Response {
  return new Response(cuerpo, {
    status: estado,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Un evento cuya venta ya se cerró.
 *
 * El dataset del proyecto es una foto de 2023: todas sus ventanas de venta
 * están cerradas, y la API rechaza la compra con el motivo `venta_cerrada`.
 */
const EVENTO_VENTA_CERRADA = {
  ...EVENTO,
  tipos_ticket: [
    {
      ...EVENTO.tipos_ticket[0],
      restricciones: {
        venta_inicio: "2023-04-01T00:00:00.000Z",
        venta_fin: "2023-06-01T00:00:00.000Z",
      },
    },
  ],
};

/**
 * Red falsa: el evento, los usuarios y la compra.
 *
 * Anota los cuerpos que llegan a `POST /api/compras`: eso es lo que permite
 * comprobar que la pantalla manda el cuerpo **completo** que pide el contrato.
 */
function crearRed(opciones: { compra?: () => Response; evento?: Record<string, unknown> } = {}) {
  const cuerpos: Record<string, unknown>[] = [];
  const peticiones: string[] = [];
  const evento = opciones.evento ?? EVENTO;

  const fetchFalso = async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(entrada), "http://eventix.test");
    const camino = url.pathname;

    peticiones.push(`${camino}${url.search}`);

    if (camino === "/api/eventos") {
      return respuesta(
        JSON.stringify({ items: [evento], total: 1, skip: 0, limit: Number(url.searchParams.get("limit") ?? 20) }),
      );
    }

    if (camino === `/api/eventos/${ID_EVENTO}`) {
      return respuesta(JSON.stringify(evento));
    }

    if (camino === "/api/usuarios") {
      const skip = Number(url.searchParams.get("skip") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 25);

      return respuesta(
        JSON.stringify({ items: USUARIOS.slice(skip, skip + limit), total: USUARIOS.length, skip, limit }),
      );
    }

    if (camino === "/api/compras" && init?.method === "POST") {
      cuerpos.push(JSON.parse(String(init.body)) as Record<string, unknown>);

      return opciones.compra ? opciones.compra() : respuesta(JSON.stringify(COMPRA), 201);
    }

    return respuesta(
      JSON.stringify({ error: { codigo: "no_encontrado", mensaje: "No existe", request_id: "req-1" } }),
      404,
    );
  };

  return { cuerpos, peticiones, fetchFalso };
}

/** Cliente de React Query sin reintentos: una prueba no espera tres intentos. */
function clienteDePrueba(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

/** Renderiza la pantalla de compra con su proveedor de consultas y su ruta. */
function renderPantalla() {
  return render(
    <QueryClientProvider client={clienteDePrueba()}>
      <MemoryRouter initialEntries={["/compra"]}>
        <PantallaCompra />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * El primer cuerpo que llegó a la API.
 *
 * Falla fuerte si no llegó ninguno: sin esto, una prueba que espera un cuerpo
 * puede pasar mirando un `undefined`.
 */
function primerCuerpo(cuerpos: Record<string, unknown>[]): Record<string, unknown> {
  const primero = cuerpos[0];

  if (primero === undefined) {
    throw new Error("No llegó ningún cuerpo a la API");
  }

  return primero;
}

/**
 * Deja el formulario listo para comprar.
 *
 * Busca el evento, elige el tipo de ticket y elige quién paga: es el camino
 * que hace falta para poder mandar la compra.
 */
async function prepararCompra(usuario: ReturnType<typeof userEvent.setup>): Promise<void> {
  await usuario.type(screen.getByLabelText("Buscar evento"), "rock");
  await usuario.click(screen.getByRole("button", { name: "Buscar" }));

  await waitFor(() => {
    expect(screen.getByRole("option", { name: /Rock Fest/ })).toBeInTheDocument();
  });

  await usuario.selectOptions(screen.getByLabelText("Evento"), ID_EVENTO);

  await waitFor(() => {
    expect(screen.getByRole("option", { name: /General/ })).toBeInTheDocument();
  });

  await usuario.selectOptions(screen.getByLabelText("Tipo de ticket"), ID_TIPO);

  await waitFor(() => {
    expect(screen.getByRole("option", { name: /Ana Compradora/ })).toBeInTheDocument();
  });

  await usuario.selectOptions(screen.getByLabelText("Comprador"), ID_COMPRADORA);
}

describe("pantalla de compra", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("manda el cuerpo completo de la compra", async () => {
    const { cuerpos, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderPantalla();

    const usuario = userEvent.setup();

    await prepararCompra(usuario);

    await usuario.type(screen.getByLabelText("Código de promoción"), "VERANO10");
    await usuario.click(screen.getByRole("button", { name: "Comprar el ticket" }));

    await waitFor(() => {
      expect(cuerpos).toHaveLength(1);
    });

    const cuerpo = primerCuerpo(cuerpos);

    expect(cuerpo.evento_id).toBe(ID_EVENTO);
    expect(cuerpo.tipo_ticket_id).toBe(ID_TIPO);
    expect(cuerpo.usuario_id).toBe(ID_COMPRADORA);
    // El asistente es el comprador: es lo que dice la casilla, marcada de una.
    expect(cuerpo.asistente_id).toBe(ID_COMPRADORA);
    expect(cuerpo.metodo_pago).toBe("tarjeta_credito");
    expect(cuerpo.pasarela).toBe("demo");
    expect(cuerpo.referencia_pasarela).toBeTruthy();
    expect(cuerpo.promocion_codigo).toBe("VERANO10");
  });

  it("muestra el ticket emitido con su código", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderPantalla();

    const usuario = userEvent.setup();

    await prepararCompra(usuario);
    await usuario.click(screen.getByRole("button", { name: "Comprar el ticket" }));

    expect(await screen.findByText("QR-EMITIDO-1")).toBeInTheDocument();
    expect(screen.getByText("COP 120.000")).toBeInTheDocument();
    expect(screen.getByText("Emitido")).toBeInTheDocument();
  });

  it("muestra el motivo cuando la API rechaza la compra", async () => {
    const { fetchFalso } = crearRed({
      compra: () =>
        respuesta(
          JSON.stringify({
            error: {
              codigo: "conflicto",
              mensaje: "No quedan entradas de General",
              detalles: [{ campo: "aforo_total", mensaje: "No quedan entradas de General", codigo: "aforo_agotado" }],
              request_id: "req-abc",
            },
          }),
          409,
        ),
    });

    vi.stubGlobal("fetch", fetchFalso);

    renderPantalla();

    const usuario = userEvent.setup();

    await prepararCompra(usuario);
    await usuario.click(screen.getByRole("button", { name: "Comprar el ticket" }));

    expect(
      await screen.findByText("No quedan entradas de este tipo de ticket"),
    ).toBeInTheDocument();
    expect(screen.getByText("req-abc")).toBeInTheDocument();
  });

  it("el reintento con la misma referencia devuelve el mismo ticket", async () => {
    let intentos = 0;

    const { cuerpos, fetchFalso } = crearRed({
      compra: () => {
        intentos += 1;

        return intentos === 1
          ? respuesta(JSON.stringify(COMPRA), 201)
          : respuesta(JSON.stringify({ ...COMPRA, idempotente: true }), 200);
      },
    });

    vi.stubGlobal("fetch", fetchFalso);

    renderPantalla();

    const usuario = userEvent.setup();

    await prepararCompra(usuario);
    await usuario.click(screen.getByRole("button", { name: "Comprar el ticket" }));

    await screen.findByText("QR-EMITIDO-1");

    await usuario.click(screen.getByRole("button", { name: "Reintentar con la misma referencia" }));

    // La misma referencia: el mismo cuerpo, byte a byte.
    await waitFor(() => {
      expect(cuerpos).toHaveLength(2);
    });

    expect(cuerpos[1]).toEqual(cuerpos[0]);

    // Y la respuesta dice que la compra ya existía.
    expect(await screen.findByText(/no se cobró dos veces/i)).toBeInTheDocument();
    expect(screen.getByText("QR-EMITIDO-1")).toBeInTheDocument();
  });

  it("el asistente puede ser otra persona que la que paga", async () => {
    const { cuerpos, fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderPantalla();

    const usuario = userEvent.setup();

    await prepararCompra(usuario);

    await usuario.click(screen.getByLabelText("El asistente es el comprador"));

    await waitFor(() => {
      expect(screen.getByLabelText("Asistente")).toBeInTheDocument();
    });

    await usuario.selectOptions(screen.getByLabelText("Asistente"), ID_OTRA);
    await usuario.click(screen.getByRole("button", { name: "Comprar el ticket" }));

    await waitFor(() => {
      expect(cuerpos).toHaveLength(1);
    });

    const cuerpo = primerCuerpo(cuerpos);

    expect(cuerpo.usuario_id).toBe(ID_COMPRADORA);
    expect(cuerpo.asistente_id).toBe(ID_OTRA);
  });

  it("avisa cuando la venta del tipo de ticket ya se cerró", async () => {
    const { fetchFalso } = crearRed({ evento: EVENTO_VENTA_CERRADA });

    vi.stubGlobal("fetch", fetchFalso);

    renderPantalla();

    const usuario = userEvent.setup();

    await prepararCompra(usuario);

    // La ventana se muestra antes de comprar: el rechazo no es una sorpresa.
    expect(screen.getByText(/Ya se cerró/i)).toBeInTheDocument();
    expect(screen.getByText(/01\/06\/2023/)).toBeInTheDocument();
  });

  it("dice a qué tipos de ticket aplica cada promoción", async () => {
    const { fetchFalso } = crearRed();

    vi.stubGlobal("fetch", fetchFalso);

    renderPantalla();

    const usuario = userEvent.setup();

    await prepararCompra(usuario);

    // La promoción de la prueba no declara ningún tipo: una lista vacía no
    // significa "a todos", y la API rechaza la que no incluye al tipo.
    expect(screen.getByText("no aplica a ningún tipo de ticket")).toBeInTheDocument();
    expect(screen.getByText("no aplica a General")).toBeInTheDocument();
  });
});
