import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient } from "mongodb";
import request from "supertest";
import type { Express } from "express";
import { config } from "../../src/config.js";
import { aplicarSetup } from "../../src/db/setup.js";
import { crearRepositorios, type Repositorios } from "../../src/db/repos/index.js";
import { createApp } from "../../src/app.js";
import { logger as loggerPorDefecto } from "../../src/logger.js";
import {
  prepararEvento,
  prepararTicket,
  prepararTransaccion,
  prepararUsuario,
} from "../../src/domain/schemas/index.js";
import { crearContextoPrueba, type ContextoPrueba } from "./helpers.js";

/**
 * T7.1 · reporting operativo: dashboard live y cierre contable diario.
 *
 * Las dos consultas que resuelven el documento 01 §7.1 con una forma distinta
 * cada una:
 *
 * - el **dashboard live** se resuelve con **una sola lectura** sobre `eventos`
 *   (CB-1: el evento embebe sus tipos de ticket y sus métricas, así que el
 *   dashboard no necesita un JOIN ni una segunda colección);
 * - el **cierre contable diario** agrupa `transacciones` por día y por estado.
 *
 * El cierre descuenta las reembolsadas del neto (decisión de contrato): un
 * cierre que no resta lo devuelto no cuadra con el banco.
 */

const DB_PRUEBA = `${config.MONGODB_DB}_http_reportes`;
const DB_MONITOR = `${config.MONGODB_DB}_http_reportes_monitor`;

const ORGANIZADOR = "66a800000000000000000001";
const LUGAR = "66b000000000000000000002";
const TIPO_GENERAL = "66c200000000000000000004";
const TIPO_VIP = "66c200000000000000000005";
const TICKET_REFERENCIA = "66e500000000000000000010";
const ID_INEXISTENTE = "66d900000000000000000009";

const EMAIL = "asistente@eventix.test";
const DIA_UNO = "2023-05-14";
const DIA_DOS = "2023-05-15";

let ctx: ContextoPrueba;
let eventoId: string;
let usuarioId: string;

/** Lectura observada en el servidor: el comando y la colección que tocó. */
type Lectura = { comando: string; coleccion: string };

/**
 * Contexto con el monitor de comandos del driver encendido.
 *
 * Sirve para **probar** el criterio de aceptación del dashboard ("se resuelve
 * en una única lectura sobre `eventos`"): el monitor ve cada comando que sale
 * hacia el servidor, así que la afirmación no es una inspección del código sino
 * una observación del tráfico real.
 */
async function crearContextoMonitorizado(): Promise<{
  app: Express;
  lecturas: Lectura[];
  eventoId: string;
  cerrar: () => Promise<void>;
}> {
  const lecturas: Lectura[] = [];
  const cliente = new MongoClient(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 5_000,
    monitorCommands: true,
  });

  cliente.on("commandStarted", (evento) => {
    const datos = evento as unknown as {
      commandName: string;
      command: Record<string, unknown>;
      databaseName: string;
    };

    if (datos.databaseName !== DB_MONITOR) {
      return;
    }

    const comando = datos.command;
    const coleccion =
      typeof comando.find === "string"
        ? comando.find
        : typeof comando.aggregate === "string"
          ? comando.aggregate
          : "";

    lecturas.push({ comando: datos.commandName, coleccion });
  });

  await cliente.connect();

  const db = cliente.db(DB_MONITOR);
  await db.dropDatabase();
  await aplicarSetup(db);

  const repos = crearRepositorios(db);
  const { eventoId } = await sembrarEvento(repos);

  const app = createApp({
    checkMongo: async () => true,
    version: "0.1.0-test",
    startedAt: Date.now(),
    repos,
    cliente,
    logger: loggerPorDefecto,
  });

  return {
    app,
    lecturas,
    eventoId,
    cerrar: async () => {
      await db.dropDatabase();
      await cliente.close();
    },
  };
}

/** Siembra el usuario y el evento que comparten las dos bases de la suite. */
async function sembrarEvento(
  repos: Repositorios,
): Promise<{ eventoId: string; usuarioId: string }> {
  const usuarioId = await repos.usuarios.insertar(
    prepararUsuario({
      email: EMAIL,
      nombre: "Ana Asistente",
      documento_identidad: "CC-1000001",
      tipo_usuario: ["asistente"],
    }),
  );

  const eventoId = await repos.eventos.insertar(
    prepararEvento({
      nombre: "Concierto de prueba",
      tipo_evento: "masivo",
      descripcion: "Evento de la suite de reporting",
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
          precio_cop: 100_000,
          aforo_total: 100,
          aforo_vendido: 30,
          restricciones: {},
        },
        {
          _id: TIPO_VIP,
          nombre: "VIP",
          precio_cop: 250_000,
          aforo_total: 50,
          aforo_vendido: 10,
          restricciones: {},
        },
      ],
      metricas_evento: { tickets_vendidos_total: 40, ingresos_cop: 5_000_000 },
    }),
  );

  return { eventoId, usuarioId };
}

/** Inserta una transacción con su fecha de confirmación (o sin ella). */
async function crearTransaccion(
  repos: Repositorios,
  datos: {
    estado: "pendiente" | "aprobada" | "rechazada" | "anulada" | "reembolsada";
    monto_cop: number;
    confirmada_en?: string;
  },
): Promise<void> {
  const id = await repos.transacciones.insertar(
    prepararTransaccion({
      usuario_id: usuarioId,
      ticket_id: TICKET_REFERENCIA,
      monto_cop: datos.monto_cop,
      metodo_pago: "tarjeta_credito",
      pasarela: "pasarela-prueba",
      estado: datos.estado,
      referencia_pasarela: `ref-${datos.estado}-${datos.monto_cop}-${datos.confirmada_en ?? "pendiente"}`,
    }),
  );

  if (datos.confirmada_en) {
    await repos.transacciones.actualizarPorId(id, {
      $set: { confirmada_en: new Date(datos.confirmada_en) },
    });
  }
}

/** Siembra los datos de la suite: un evento con dos tipos de ticket y ventas. */
async function sembrar(): Promise<void> {
  const repos = crearRepositorios(ctx.db);
  const sembrado = await sembrarEvento(repos);

  eventoId = sembrado.eventoId;
  usuarioId = sembrado.usuarioId;

  // Día uno: dos aprobadas, una rechazada, una anulada y una reembolsada.
  await crearTransaccion(repos, {
    estado: "aprobada",
    monto_cop: 100_000,
    confirmada_en: `${DIA_UNO}T10:00:00Z`,
  });
  await crearTransaccion(repos, {
    estado: "aprobada",
    monto_cop: 50_000,
    confirmada_en: `${DIA_UNO}T18:00:00Z`,
  });
  await crearTransaccion(repos, {
    estado: "rechazada",
    monto_cop: 0,
    confirmada_en: `${DIA_UNO}T19:00:00Z`,
  });
  await crearTransaccion(repos, {
    estado: "anulada",
    monto_cop: 0,
    confirmada_en: `${DIA_UNO}T20:00:00Z`,
  });
  await crearTransaccion(repos, {
    estado: "reembolsada",
    monto_cop: 30_000,
    confirmada_en: `${DIA_UNO}T21:00:00Z`,
  });

  // Día dos: una aprobada más.
  await crearTransaccion(repos, {
    estado: "aprobada",
    monto_cop: 20_000,
    confirmada_en: `${DIA_DOS}T09:00:00Z`,
  });

  // Una pendiente: no tiene fecha de confirmación, así que no pertenece a
  // ningún día del cierre.
  await crearTransaccion(repos, { estado: "pendiente", monto_cop: 10_000 });

  await sembrarEventosDelRanking(repos);
  await sembrarTickets(repos);
}

/**
 * Eventos para el ranking: uno con más ventas que el principal, uno cancelado
 * y uno en borrador.
 *
 * El cancelado y el borrador **no** deben aparecer en el ranking: no son
 * eventos operativos, y el cancelado además es el que más "vendió", así que
 * si el filtro fallara se vería enseguida.
 */
async function sembrarEventosDelRanking(repos: Repositorios): Promise<void> {
  await repos.eventos.insertar(
    prepararEvento({
      nombre: "Festival de verano",
      tipo_evento: "masivo",
      descripcion: "El que más vendió",
      estado: "publicado",
      visibilidad: "publico",
      fecha_inicio: new Date("2026-02-01T16:00:00Z"),
      fecha_fin: new Date("2026-02-01T23:00:00Z"),
      organizador_id: ORGANIZADOR,
      lugar_id: LUGAR,
      tipos_ticket: [
        {
          _id: "66c200000000000000000020",
          nombre: "General",
          precio_cop: 75_000,
          aforo_total: 200,
          aforo_vendido: 120,
          restricciones: {},
        },
      ],
      metricas_evento: { tickets_vendidos_total: 120, ingresos_cop: 9_000_000 },
    }),
  );

  await repos.eventos.insertar(
    prepararEvento({
      nombre: "Evento cancelado",
      tipo_evento: "corporativo",
      descripcion: "Cancelado: no va al ranking",
      estado: "cancelado",
      visibilidad: "publico",
      fecha_inicio: new Date("2026-03-01T16:00:00Z"),
      fecha_fin: new Date("2026-03-01T23:00:00Z"),
      organizador_id: ORGANIZADOR,
      lugar_id: LUGAR,
      tipos_ticket: [
        {
          _id: "66c200000000000000000021",
          nombre: "General",
          precio_cop: 50_000,
          aforo_total: 500,
          aforo_vendido: 300,
          restricciones: {},
        },
      ],
      metricas_evento: { tickets_vendidos_total: 300, ingresos_cop: 15_000_000 },
    }),
  );

  await repos.eventos.insertar(
    prepararEvento({
      nombre: "Evento en borrador",
      tipo_evento: "academico",
      descripcion: "Borrador: no va al ranking",
      estado: "borrador",
      visibilidad: "privado",
      fecha_inicio: new Date("2026-04-01T16:00:00Z"),
      fecha_fin: new Date("2026-04-01T23:00:00Z"),
      organizador_id: ORGANIZADOR,
      lugar_id: LUGAR,
      tipos_ticket: [],
      metricas_evento: { tickets_vendidos_total: 0, ingresos_cop: 0 },
    }),
  );
}

/** Tickets del evento principal: dos emitidos y uno usado. */
async function sembrarTickets(repos: Repositorios): Promise<void> {
  const asistentes = [
    {
      codigo_qr: "QR-EMITIDO-1",
      estado: "emitido" as const,
      nombre: "Ana Asistente",
      documento_identidad: "CC-1000001",
      precio_pagado_cop: 100_000,
      emitido_en: new Date(`${DIA_UNO}T10:00:00Z`),
    },
    {
      codigo_qr: "QR-EMITIDO-2",
      estado: "emitido" as const,
      nombre: "LuisOtro",
      documento_identidad: "CC-2000002",
      precio_pagado_cop: 100_000,
      emitido_en: new Date(`${DIA_UNO}T11:00:00Z`),
    },
    {
      codigo_qr: "QR-USADO-1",
      estado: "usado" as const,
      nombre: "Marta Usada",
      documento_identidad: "CC-3000003",
      precio_pagado_cop: 250_000,
      emitido_en: new Date(`${DIA_UNO}T12:00:00Z`),
    },
  ];

  for (const asistente of asistentes) {
    await repos.tickets.insertar(
      prepararTicket(
        {
          codigo_qr: asistente.codigo_qr,
          estado: asistente.estado,
          evento_id: eventoId,
          comprado_por_usuario_id: usuarioId,
          snapshot_tipo_ticket: {
            tipo_ticket_id: TIPO_GENERAL,
            nombre: "General",
            precio_cop: 100_000,
          },
          asistente_snapshot: {
            usuario_id: usuarioId,
            nombre: asistente.nombre,
            documento_identidad: asistente.documento_identidad,
            email: EMAIL,
          },
          precio_pagado_cop: asistente.precio_pagado_cop,
        },
        asistente.emitido_en,
      ),
    );
  }
}

beforeAll(async () => {
  ctx = await crearContextoPrueba({ nombreBase: DB_PRUEBA });
});

afterAll(async () => {
  await ctx.cerrar();
});

beforeEach(async () => {
  await ctx.limpiar();
  await sembrar();
});

describe("T7.1 · dashboard live del evento", () => {
  it("resuelve el dashboard con las métricas y la ocupación embebidas", async () => {
    const respuesta = await request(ctx.app).get(`/api/reportes/eventos/${eventoId}/dashboard`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.evento_id).toBe(eventoId);
    expect(respuesta.body.nombre).toBe("Concierto de prueba");
    expect(respuesta.body.estado).toBe("publicado");
    expect(respuesta.body.metricas).toEqual({
      tickets_vendidos_total: 40,
      ingresos_cop: 5_000_000,
      ultima_actualizacion: null,
    });

    expect(respuesta.body.tipos_ticket).toEqual([
      {
        tipo_ticket_id: TIPO_GENERAL,
        nombre: "General",
        precio_cop: 100_000,
        aforo_total: 100,
        aforo_vendido: 30,
        ocupacion_pct: 30,
      },
      {
        tipo_ticket_id: TIPO_VIP,
        nombre: "VIP",
        precio_cop: 250_000,
        aforo_total: 50,
        aforo_vendido: 10,
        ocupacion_pct: 20,
      },
    ]);

    expect(respuesta.body.aforo_total).toBe(150);
    expect(respuesta.body.aforo_vendido).toBe(40);
    expect(respuesta.body.ocupacion_pct).toBe(26.67);
  });

  it("se resuelve en una única lectura sobre `eventos` (CB-1)", async () => {
    const monitor = await crearContextoMonitorizado();

    try {
      const respuesta = await request(monitor.app).get(
        `/api/reportes/eventos/${monitor.eventoId}/dashboard`,
      );

      expect(respuesta.status).toBe(200);

      const lecturasDeDatos = monitor.lecturas.filter(
        (lectura) => lectura.comando === "find" || lectura.comando === "aggregate",
      );

      expect(lecturasDeDatos).toHaveLength(1);
      expect(lecturasDeDatos[0].coleccion).toBe("eventos");
    } finally {
      await monitor.cerrar();
    }
  });

  it("responde 404 cuando el evento no existe", async () => {
    const respuesta = await request(ctx.app).get(
      `/api/reportes/eventos/${ID_INEXISTENTE}/dashboard`,
    );

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe("no_encontrado");
  });

  it("responde 400 cuando el identificador no es válido", async () => {
    const respuesta = await request(ctx.app).get("/api/reportes/eventos/no-es-un-id/dashboard");

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("peticion_invalida");
  });
});

describe("T7.1 · cierre contable diario", () => {
  it("agrupa por día y estado y descuenta las reembolsadas del neto", async () => {
    const respuesta = await request(ctx.app).get("/api/reportes/cierre-contable");

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.desde).toBeNull();
    expect(respuesta.body.hasta).toBeNull();
    expect(respuesta.body.dias).toHaveLength(2);

    const [primerDia, segundoDia] = respuesta.body.dias;

    expect(primerDia.dia).toBe(DIA_UNO);
    expect(primerDia.por_estado.aprobada).toEqual({ cantidad: 2, monto_cop: 150_000 });
    expect(primerDia.por_estado.rechazada).toEqual({ cantidad: 1, monto_cop: 0 });
    expect(primerDia.por_estado.anulada).toEqual({ cantidad: 1, monto_cop: 0 });
    expect(primerDia.por_estado.reembolsada).toEqual({ cantidad: 1, monto_cop: 30_000 });
    expect(primerDia.por_estado.pendiente).toEqual({ cantidad: 0, monto_cop: 0 });
    expect(primerDia.neto_cop).toBe(120_000);

    expect(segundoDia.dia).toBe(DIA_DOS);
    expect(segundoDia.por_estado.aprobada).toEqual({ cantidad: 1, monto_cop: 20_000 });
    expect(segundoDia.neto_cop).toBe(20_000);
  });

  it("deja las pendientes fuera de los días y las reporta aparte", async () => {
    const respuesta = await request(ctx.app).get("/api/reportes/cierre-contable");

    expect(respuesta.body.pendientes_sin_confirmar).toEqual({ cantidad: 1, monto_cop: 10_000 });
    expect(respuesta.body.totales).toEqual({ cantidad: 6, monto_cop: 200_000, neto_cop: 140_000 });
  });

  it("filtra por el rango pedido", async () => {
    const respuesta = await request(ctx.app)
      .get("/api/reportes/cierre-contable")
      .query({ desde: `${DIA_DOS}T00:00:00Z` });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.desde).toBe(`${DIA_DOS}T00:00:00.000Z`);
    expect(respuesta.body.dias).toHaveLength(1);
    expect(respuesta.body.dias[0].dia).toBe(DIA_DOS);
  });

  it("responde 400 con una fecha que no existe", async () => {
    const respuesta = await request(ctx.app)
      .get("/api/reportes/cierre-contable")
      .query({ desde: "2023-02-30" });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("peticion_invalida");
  });

  it("responde 400 cuando el rango está al revés", async () => {
    const respuesta = await request(ctx.app)
      .get("/api/reportes/cierre-contable")
      .query({ desde: `${DIA_DOS}T00:00:00Z`, hasta: `${DIA_UNO}T00:00:00Z` });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("peticion_invalida");
  });
});

describe("T7.2 · ranking de vendidos", () => {
  it("ordena por tickets vendidos y trae la ocupación por tipo de ticket", async () => {
    const respuesta = await request(ctx.app).get("/api/reportes/mas-vendidos");

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.items).toHaveLength(2);
    expect(respuesta.body.items[0].nombre).toBe("Festival de verano");
    expect(respuesta.body.items[0].tickets_vendidos_total).toBe(120);
    expect(respuesta.body.items[0].ingresos_cop).toBe(9_000_000);
    expect(respuesta.body.items[0].aforo_total).toBe(200);
    expect(respuesta.body.items[0].aforo_vendido).toBe(120);
    expect(respuesta.body.items[0].ocupacion_pct).toBe(60);
    expect(respuesta.body.items[0].tipos_ticket).toEqual([
      {
        tipo_ticket_id: "66c200000000000000000020",
        nombre: "General",
        precio_cop: 75_000,
        aforo_total: 200,
        aforo_vendido: 120,
        ocupacion_pct: 60,
      },
    ]);

    expect(respuesta.body.items[1].nombre).toBe("Concierto de prueba");
    expect(respuesta.body.items[1].ocupacion_pct).toBe(26.67);
  });

  it("respeta el límite pedido", async () => {
    const respuesta = await request(ctx.app).get("/api/reportes/mas-vendidos").query({ limite: 1 });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.limite).toBe(1);
    expect(respuesta.body.items).toHaveLength(1);
    expect(respuesta.body.items[0].nombre).toBe("Festival de verano");
  });

  it("responde 400 con un límite que no es un número", async () => {
    const respuesta = await request(ctx.app)
      .get("/api/reportes/mas-vendidos")
      .query({ limite: "muchos" });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("peticion_invalida");
  });

  it("responde 400 con un límite fuera de rango", async () => {
    const respuesta = await request(ctx.app)
      .get("/api/reportes/mas-vendidos")
      .query({ limite: 500 });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("peticion_invalida");
  });
});

describe("T7.2 · exportación de asistentes", () => {
  it("exporta los asistentes del evento con el snapshot del ticket", async () => {
    const respuesta = await request(ctx.app).get(`/api/reportes/asistentes/${eventoId}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.total).toBe(3);
    expect(respuesta.body.items).toHaveLength(3);
    expect(respuesta.body.items[0]).toEqual({
      ticket_id: expect.any(String),
      codigo_qr: "QR-EMITIDO-1",
      estado: "emitido",
      tipo_ticket: { tipo_ticket_id: TIPO_GENERAL, nombre: "General", precio_cop: 100_000 },
      asistente: {
        usuario_id: usuarioId,
        nombre: "Ana Asistente",
        documento_identidad: "CC-1000001",
        email: EMAIL,
      },
      precio_pagado_cop: 100_000,
      promocion_aplicada_codigo: null,
      emitido_en: new Date(`${DIA_UNO}T10:00:00Z`).toISOString(),
      validado_en: null,
    });
  });

  it("pagina la exportación", async () => {
    const respuesta = await request(ctx.app)
      .get(`/api/reportes/asistentes/${eventoId}`)
      .query({ limit: 2, skip: 1 });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.total).toBe(3);
    expect(respuesta.body.skip).toBe(1);
    expect(respuesta.body.limit).toBe(2);
    expect(respuesta.body.items).toHaveLength(2);
    expect(respuesta.body.items[0].codigo_qr).toBe("QR-EMITIDO-2");
  });

  it("filtra por estado de ticket", async () => {
    const respuesta = await request(ctx.app)
      .get(`/api/reportes/asistentes/${eventoId}`)
      .query({ estado: "usado" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.items).toHaveLength(1);
    expect(respuesta.body.items[0].codigo_qr).toBe("QR-USADO-1");
  });

  it("responde 404 cuando el evento no existe", async () => {
    const respuesta = await request(ctx.app).get(`/api/reportes/asistentes/${ID_INEXISTENTE}`);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe("no_encontrado");
  });

  it("responde 400 con un identificador que no es válido", async () => {
    const respuesta = await request(ctx.app).get("/api/reportes/asistentes/no-es-un-id");

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("peticion_invalida");
  });

  it("responde 400 con un estado de ticket que no existe", async () => {
    const respuesta = await request(ctx.app)
      .get(`/api/reportes/asistentes/${eventoId}`)
      .query({ estado: "inventado" });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("peticion_invalida");
  });
});
