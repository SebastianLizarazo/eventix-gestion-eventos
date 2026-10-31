import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoClient, type Db } from "mongodb";
import type { Logger } from "pino";
import { config } from "../../src/config.js";
import { aplicarSetup } from "../../src/db/setup.js";
import { crearRepositorios, type Repositorios } from "../../src/db/repos/index.js";
import { crearServicioCompra, type EntradaCompra } from "../../src/services/compra.js";
import { ErrorCompra } from "../../src/domain/errors.js";
import { prepararEvento, prepararUsuario } from "../../src/domain/schemas/index.js";

/**
 * Servicio de compra (tarea T6.1): la compra transaccional de un ticket.
 *
 * Corre contra una base propia para no tocar la base de desarrollo.
 */

const DB_PRUEBA = `${config.MONGODB_DB}_servicios_compra`;

const ORGANIZADOR = "66a800000000000000000001";
const LUGAR = "66b000000000000000000002";
const TIPO_GENERAL = "66c200000000000000000004";
const TIPO_VIP = "66c200000000000000000005";

const EMAIL_COMPRADOR = "comprador@eventix.test";
const EMAIL_ASISTENTE = "asistente@eventix.test";

const PRECIO = 100_000;

let cliente: MongoClient;
let db: Db;
let repos: Repositorios;
let servicio: ReturnType<typeof crearServicioCompra>;

/** Id del evento sembrado (lo asigna la base al insertar). */
let eventoId: string;

/**
 * Siembra el evento publicado con un tipo de ticket y los dos usuarios de la
 * prueba (el que paga y el que asiste).
 */
async function sembrar(): Promise<void> {
  await repos.usuarios.insertar(
    prepararUsuario({
      email: EMAIL_COMPRADOR,
      nombre: "Ana Compradora",
      documento_identidad: "CC-1000001",
      tipo_usuario: ["asistente"],
    }),
  );

  await repos.usuarios.insertar(
    prepararUsuario({
      email: EMAIL_ASISTENTE,
      nombre: "Luis Asistente",
      documento_identidad: "CC-1000002",
      tipo_usuario: ["asistente"],
    }),
  );

  const evento = await repos.eventos.insertar(
    prepararEvento({
      nombre: "Concierto de prueba",
      tipo_evento: "masivo",
      descripcion: "Evento de la suite de compra",
      estado: "publicado",
      visibilidad: "publico",
      fecha_inicio: new Date("2026-01-01T16:00:00Z"),
      fecha_fin: new Date("2026-01-01T23:00:00Z"),
      organizador_id: ORGANIZADOR,
      lugar_id: LUGAR,
      tags: ["prueba"],
      tipos_ticket: [
        {
          _id: TIPO_GENERAL,
          nombre: "General",
          precio_cop: PRECIO,
          aforo_total: 2,
          aforo_vendido: 0,
          restricciones: {},
        },
        {
          _id: TIPO_VIP,
          nombre: "VIP",
          precio_cop: 250_000,
          aforo_total: 1,
          aforo_vendido: 0,
          restricciones: {},
        },
      ],
      promociones: [
        {
          codigo: "VERANO10",
          tipo: "porcentaje",
          valor: 10,
          aplica_a_tipo_ticket_ids: [TIPO_GENERAL],
          vigencia_inicio: new Date("2025-01-01T00:00:00Z"),
          vigencia_fin: new Date("2027-12-31T23:59:59Z"),
          usos_maximos: 100,
          usos_realizados: 0,
          activo: true,
        },
        {
          codigo: "DOBLE",
          tipo: "2x1",
          valor: 2,
          aplica_a_tipo_ticket_ids: [TIPO_GENERAL],
          vigencia_inicio: new Date("2025-01-01T00:00:00Z"),
          vigencia_fin: new Date("2027-12-31T23:59:59Z"),
          usos_maximos: 100,
          usos_realizados: 0,
          activo: true,
        },
      ],
    }),
  );

  eventoId = evento;
}

/** Identificador del comprador sembrado. */
async function idComprador(): Promise<string> {
  const comprador = await repos.usuarios.porEmailNormalizado(EMAIL_COMPRADOR);

  if (!comprador?._id) {
    throw new Error("El comprador no está sembrado");
  }

  return comprador._id;
}

/** Identificador del asistente sembrado. */
async function idAsistente(): Promise<string> {
  const asistente = await repos.usuarios.porEmailNormalizado(EMAIL_ASISTENTE);

  if (!asistente?._id) {
    throw new Error("El asistente no está sembrado");
  }

  return asistente._id;
}

/** Compra de referencia: un ticket general para el comprador. */
async function entrada(overrides: Partial<EntradaCompra> = {}): Promise<EntradaCompra> {
  return {
    evento_id: eventoId,
    tipo_ticket_id: TIPO_GENERAL,
    usuario_id: await idComprador(),
    asistente_id: await idAsistente(),
    metodo_pago: "tarjeta_credito",
    pasarela: "demo_pago",
    referencia_pasarela: "REF-000000001",
    ...overrides,
  };
}

beforeAll(async () => {
  cliente = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });
  await cliente.connect();

  db = cliente.db(DB_PRUEBA);
  await db.dropDatabase();
  await aplicarSetup(db);

  repos = crearRepositorios(db);
  servicio = crearServicioCompra(cliente, repos);
});

beforeEach(async () => {
  await Promise.all(
    ["usuarios", "lugares", "eventos", "tickets", "transacciones", "auditoria_eventos"].map(
      (coleccion) => db.collection(coleccion).deleteMany({}),
    ),
  );

  await sembrar();
});

afterAll(async () => {
  await db.dropDatabase();
  await cliente.close();
});

describe("compra de un ticket", () => {
  it("escribe el ticket y la transacción, y suma el aforo y las métricas del evento", async () => {
    const resultado = await servicio.comprar(await entrada());

    expect(resultado.idempotente).toBe(false);
    expect(resultado.ticket.estado).toBe("emitido");
    expect(resultado.ticket.precio_pagado_cop).toBe(PRECIO);
    expect(resultado.transaccion.estado).toBe("aprobada");
    expect(resultado.transaccion.monto_cop).toBe(PRECIO);
    expect(resultado.transaccion.confirmada_en).toBeInstanceOf(Date);

    const evento = await repos.eventos.obtenerPorId(eventoId);
    const general = evento?.tipos_ticket.find((tipo) => tipo._id === TIPO_GENERAL);

    expect(general?.aforo_vendido).toBe(1);
    expect(evento?.metricas_evento?.tickets_vendidos_total).toBe(1);
    expect(evento?.metricas_evento?.ingresos_cop).toBe(PRECIO);

    const tickets = await repos.tickets.listar({});
    const transacciones = await repos.transacciones.listar({});

    expect(tickets.items).toHaveLength(1);
    expect(transacciones.items).toHaveLength(1);
    expect(tickets.items[0]?.transaccion_id).toBe(transacciones.items[0]?._id);
    expect(transacciones.items[0]?.ticket_id).toBe(tickets.items[0]?._id);
  });

  it("guarda en el ticket el snapshot del tipo de ticket y del asistente", async () => {
    const resultado = await servicio.comprar(await entrada());

    expect(resultado.ticket.snapshot_tipo_ticket).toEqual({
      tipo_ticket_id: TIPO_GENERAL,
      nombre: "General",
      precio_cop: PRECIO,
    });
    expect(resultado.ticket.asistente_snapshot.nombre).toBe("Luis Asistente");
    expect(resultado.ticket.asistente_snapshot.documento_identidad).toBe("CC-1000002");
    expect(resultado.ticket.asistente_snapshot.email).toBe(EMAIL_ASISTENTE);
    expect(resultado.ticket.comprado_por_usuario_id).toBe(await idComprador());
  });

  it("suma las estadísticas del comprador", async () => {
    await servicio.comprar(await entrada());

    const comprador = await repos.usuarios.porEmailNormalizado(EMAIL_COMPRADOR);

    expect(comprador?.estadisticas.tickets_comprados).toBe(1);
    expect(comprador?.estadisticas.ltv_cop).toBe(PRECIO);
  });

  it("rechaza la compra si el evento no existe", async () => {
    const compra = await entrada({ evento_id: "66c1000000000000000000ff" });

    await expect(servicio.comprar(compra)).rejects.toThrow(ErrorCompra);
  });

  it("rechaza la compra si el evento no está publicado", async () => {
    await repos.eventos.actualizarPorId(eventoId, { $set: { estado: "borrador" } });

    await expect(servicio.comprar(await entrada())).rejects.toThrow(ErrorCompra);
  });

  it("rechaza la compra si el tipo de ticket no pertenece al evento", async () => {
    await expect(
      servicio.comprar(await entrada({ tipo_ticket_id: "66c2000000000000000000ff" })),
    ).rejects.toThrow(ErrorCompra);
  });

  it("rechaza la compra si el usuario que paga no existe", async () => {
    await expect(
      servicio.comprar(await entrada({ usuario_id: "66a8000000000000000000ff" })),
    ).rejects.toThrow(ErrorCompra);
  });

  it("no deja ticket ni transacción cuando la compra falla", async () => {
    await expect(
      servicio.comprar(await entrada({ usuario_id: "66a8000000000000000000ff" })),
    ).rejects.toThrow(ErrorCompra);

    const tickets = await repos.tickets.listar({});
    const transacciones = await repos.transacciones.listar({});
    const evento = await repos.eventos.obtenerPorId(eventoId);

    expect(tickets.items).toHaveLength(0);
    expect(transacciones.items).toHaveLength(0);
    expect(evento?.tipos_ticket.find((tipo) => tipo._id === TIPO_GENERAL)?.aforo_vendido).toBe(0);
  });
});

describe("compra con promoción", () => {
  it("aplica el descuento y suma el uso de la promoción", async () => {
    const resultado = await servicio.comprar(await entrada({ promocion_codigo: "VERANO10" }));

    expect(resultado.promocion_codigo).toBe("VERANO10");
    expect(resultado.ticket.promocion_aplicada_codigo).toBe("VERANO10");
    expect(resultado.ticket.precio_pagado_cop).toBe(90_000);
    expect(resultado.transaccion.monto_cop).toBe(90_000);

    const evento = await repos.eventos.obtenerPorId(eventoId);
    const promocion = evento?.promociones.find((candidate) => candidate.codigo === "VERANO10");

    expect(promocion?.usos_realizados).toBe(1);
    expect(evento?.metricas_evento?.ingresos_cop).toBe(90_000);
  });

  it("el 2x1 deja gratis el segundo ticket del mismo tipo y del mismo comprador", async () => {
    const primera = await servicio.comprar(await entrada({ referencia_pasarela: "REF-000000002" }));

    expect(primera.ticket.precio_pagado_cop).toBe(PRECIO);
    expect(primera.ticket.promocion_aplicada_codigo).toBeUndefined();

    const segunda = await servicio.comprar(
      await entrada({ referencia_pasarela: "REF-000000003", promocion_codigo: "DOBLE" }),
    );

    expect(segunda.ticket.precio_pagado_cop).toBe(0);
    expect(segunda.ticket.promocion_aplicada_codigo).toBe("DOBLE");
    expect(segunda.transaccion.monto_cop).toBe(0);
  });

  it("rechaza la compra si la promoción no está vigente", async () => {
    await repos.eventos.actualizarPorId(eventoId, {
      $set: {
        "promociones.0.vigencia_inicio": new Date("2024-01-01T00:00:00Z"),
        "promociones.0.vigencia_fin": new Date("2024-12-31T23:59:59Z"),
      },
    });

    await expect(servicio.comprar(await entrada({ promocion_codigo: "VERANO10" }))).rejects.toThrow(
      ErrorCompra,
    );

    const tickets = await repos.tickets.listar({});
    const transacciones = await repos.transacciones.listar({});
    const evento = await repos.eventos.obtenerPorId(eventoId);

    expect(tickets.items).toHaveLength(0);
    expect(transacciones.items).toHaveLength(0);
    expect(evento?.tipos_ticket.find((tipo) => tipo._id === TIPO_GENERAL)?.aforo_vendido).toBe(0);
  });

  it("rechaza la compra si la promoción no aplica al tipo de ticket", async () => {
    await expect(
      servicio.comprar(await entrada({ tipo_ticket_id: TIPO_VIP, promocion_codigo: "VERANO10" })),
    ).rejects.toThrow(ErrorCompra);
  });

  it("no cobra el precio completo en silencio cuando la promoción no se puede aplicar", async () => {
    await expect(servicio.comprar(await entrada({ promocion_codigo: "NOEXISTE" }))).rejects.toThrow(
      ErrorCompra,
    );

    const tickets = await repos.tickets.listar({});

    expect(tickets.items).toHaveLength(0);
  });
});

describe("idempotencia de la compra", () => {
  it("repite la compra con la misma referencia sin volver a cobrar ni a ocupar cupo", async () => {
    const primera = await servicio.comprar(await entrada());
    const segunda = await servicio.comprar(await entrada());

    expect(segunda.idempotente).toBe(true);
    expect(segunda.ticket._id).toBe(primera.ticket._id);
    expect(segunda.transaccion._id).toBe(primera.transaccion._id);

    const tickets = await repos.tickets.listar({});
    const transacciones = await repos.transacciones.listar({});
    const evento = await repos.eventos.obtenerPorId(eventoId);

    expect(tickets.items).toHaveLength(1);
    expect(transacciones.items).toHaveLength(1);
    expect(evento?.tipos_ticket.find((tipo) => tipo._id === TIPO_GENERAL)?.aforo_vendido).toBe(1);
    expect(evento?.metricas_evento?.ingresos_cop).toBe(PRECIO);
  });

  it("dos compras simultáneas con la misma referencia cobran una sola vez", async () => {
    const [primera, segunda] = await Promise.all([
      servicio.comprar(await entrada()),
      servicio.comprar(await entrada()),
    ]);

    const tickets = await repos.tickets.listar({});
    const transacciones = await repos.transacciones.listar({});
    const evento = await repos.eventos.obtenerPorId(eventoId);

    expect(tickets.items).toHaveLength(1);
    expect(transacciones.items).toHaveLength(1);
    expect(evento?.tipos_ticket.find((tipo) => tipo._id === TIPO_GENERAL)?.aforo_vendido).toBe(1);
    expect(evento?.metricas_evento?.ingresos_cop).toBe(PRECIO);

    const identicos = primera.ticket._id === segunda.ticket._id;

    expect(identicos).toBe(true);
  });

  it("el reintento no vuelve a escribir la auditoría", async () => {
    await servicio.comprar(await entrada());
    await servicio.comprar(await entrada());

    const auditorias = await repos.auditoria.listar({});

    expect(auditorias.items).toHaveLength(1);
  });

  it("no devuelve la compra de otro comprador para la misma referencia", async () => {
    await servicio.comprar(await entrada());

    await expect(
      servicio.comprar(
        await entrada({ usuario_id: await idAsistente(), asistente_id: await idAsistente() }),
      ),
    ).rejects.toMatchObject({ motivo: "compra_de_otro_comprador" });

    const tickets = await repos.tickets.listar({});
    const transacciones = await repos.transacciones.listar({});

    expect(tickets.items).toHaveLength(1);
    expect(transacciones.items).toHaveLength(1);
  });
});

describe("auditoría de la compra", () => {
  it("registra el rastro de la compra, con su actor y su sujeto", async () => {
    const resultado = await servicio.comprar(await entrada());

    const auditorias = await repos.auditoria.listar({});
    const registro = auditorias.items[0];

    expect(auditorias.items).toHaveLength(1);
    expect(registro?.accion).toBe("compra.ticket_emitido");
    expect(registro?.sujeto_tipo).toBe("ticket");
    expect(registro?.sujeto_id).toBe(resultado.ticket._id);
    expect(registro?.actor_id).toBe(await idComprador());
    expect(registro?.actor_rol).toBe("asistente");
    expect(registro?.metadata.evento_id).toBe(eventoId);
    expect(registro?.metadata.transaccion_id).toBe(resultado.transaccion._id);
    expect(registro?.metadata.monto_cop).toBe(PRECIO);
  });

  it("la compra no se cae si la escritura de la auditoría falla", async () => {
    const reposRotos = {
      ...repos,
      auditoria: {
        ...repos.auditoria,
        insertar: async () => {
          throw new Error("la auditoría no se pudo escribir");
        },
      },
    };

    const servicioRoto = crearServicioCompra(cliente, reposRotos, {
      logger: { error: vi.fn(), warn: vi.fn() } as unknown as Logger,
    });

    const resultado = await servicioRoto.comprar(await entrada());

    expect(resultado.ticket._id).toBeDefined();

    const tickets = await repos.tickets.listar({});

    expect(tickets.items).toHaveLength(1);
  });
});
