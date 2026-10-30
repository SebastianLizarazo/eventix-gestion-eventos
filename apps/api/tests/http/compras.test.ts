import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { config } from "../../src/config.js";
import { crearRepositorios } from "../../src/db/repos/index.js";
import { prepararEvento, prepararUsuario } from "../../src/domain/schemas/index.js";
import { crearContextoPrueba, type ContextoPrueba } from "./helpers.js";

/**
 * T6.6 · endpoint HTTP de la compra (`POST /api/compras`).
 *
 * El servicio de compra ya existía (H6); esta suite cubre la capa HTTP: el
 * contrato de la respuesta, la semántica de idempotencia y **el mapeo de los
 * ocho motivos de `ErrorCompra` al contrato de error de la API**.
 *
 * El motivo exacto viaja en `detalles[0].codigo` (L35 del roadmap): el
 * `error.codigo` dice la familia (404/409/422) y el detalle dice el motivo,
 * para que el cliente distinga `aforo_agotado` de `evento_no_vendible` sin
 * leer el mensaje.
 */

const DB_PRUEBA = `${config.MONGODB_DB}_http_compras`;

const ORGANIZADOR = "66a800000000000000000001";
const LUGAR = "66b000000000000000000002";
const TIPO_GENERAL = "66c200000000000000000004";
const TIPO_VIP = "66c200000000000000000005";
const TIPO_FUTURO = "66c200000000000000000006";
const TIPO_CERRADO = "66c200000000000000000007";
const TIPO_AGOTADO = "66c200000000000000000008";
const ID_INEXISTENTE = "66d900000000000000000009";

const EMAIL = "comprador@eventix.test";
const PRECIO = 100_000;

let ctx: ContextoPrueba;
let eventoId: string;
let eventoBorradorId: string;
let usuarioId: string;

/** Siembra los datos de la suite: un comprador y dos eventos. */
async function sembrar(): Promise<void> {
  const repos = crearRepositorios(ctx.db);

  usuarioId = await repos.usuarios.insertar(
    prepararUsuario({
      email: EMAIL,
      nombre: "Ana Compradora",
      documento_identidad: "CC-1000001",
      tipo_usuario: ["asistente"],
    }),
  );

  eventoId = await repos.eventos.insertar(
    prepararEvento({
      nombre: "Concierto de prueba",
      tipo_evento: "masivo",
      descripcion: "Evento de la suite de compras",
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
        {
          _id: TIPO_FUTURO,
          nombre: " venta futura",
          precio_cop: PRECIO,
          aforo_total: 5,
          aforo_vendido: 0,
          restricciones: { venta_inicio: new Date("2099-01-01T00:00:00Z") },
        },
        {
          _id: TIPO_CERRADO,
          nombre: "Venta cerrada",
          precio_cop: PRECIO,
          aforo_total: 5,
          aforo_vendido: 0,
          restricciones: { venta_fin: new Date("2020-01-01T00:00:00Z") },
        },
        {
          _id: TIPO_AGOTADO,
          nombre: "Sin cupo",
          precio_cop: PRECIO,
          aforo_total: 0,
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
      ],
    }),
  );

  eventoBorradorId = await repos.eventos.insertar(
    prepararEvento({
      nombre: "Borrador sin publicar",
      tipo_evento: "masivo",
      descripcion: "Evento que todavía no está publicado",
      estado: "borrador",
      visibilidad: "publico",
      fecha_inicio: new Date("2026-02-01T16:00:00Z"),
      fecha_fin: new Date("2026-02-01T23:00:00Z"),
      organizador_id: ORGANIZADOR,
      lugar_id: LUGAR,
      tipos_ticket: [
        {
          _id: TIPO_GENERAL,
          nombre: "General",
          precio_cop: PRECIO,
          aforo_total: 5,
          aforo_vendido: 0,
          restricciones: {},
        },
      ],
    }),
  );
}

/** Cuerpo de una compra válida. */
function cuerpo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    evento_id: eventoId,
    tipo_ticket_id: TIPO_GENERAL,
    usuario_id: usuarioId,
    asistente_id: usuarioId,
    metodo_pago: "tarjeta_credito",
    pasarela: "demo_pago",
    referencia_pasarela: "REF-1",
    ...overrides,
  };
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

describe("T6.6 · endpoint HTTP de la compra", () => {
  it("compra un ticket y responde 201 con el ticket, la transacción y su ubicación", async () => {
    const respuesta = await request(ctx.app).post("/api/compras").send(cuerpo());

    expect(respuesta.status).toBe(201);
    expect(respuesta.headers.location).toBe(`/api/tickets/${respuesta.body.ticket._id}`);
    expect(respuesta.body.ticket.estado).toBe("emitido");
    expect(respuesta.body.ticket.codigo_qr).toMatch(/^EVX-[0-9A-F]{24}$/);
    expect(respuesta.body.ticket.transaccion_id).toBe(respuesta.body.transaccion._id);
    expect(respuesta.body.transaccion.monto_cop).toBe(PRECIO);
    expect(respuesta.body.transaccion.estado).toBe("aprobada");
    expect(respuesta.body.transaccion.referencia_pasarela).toBe("REF-1");
    expect(respuesta.body.idempotente).toBe(false);
    expect(respuesta.body.promocion_codigo).toBeNull();
  });

  it("la compra deja el ticket y la transacción en la base y suma el contador del evento", async () => {
    await request(ctx.app).post("/api/compras").send(cuerpo());

    expect(await ctx.db.collection("tickets").countDocuments()).toBe(1);
    expect(await ctx.db.collection("transacciones").countDocuments()).toBe(1);

    const repos = crearRepositorios(ctx.db);
    const evento = await repos.eventos.obtenerPorId(eventoId);
    const tipo = evento?.tipos_ticket.find((item) => item._id === TIPO_GENERAL);

    expect(tipo?.aforo_vendido).toBe(1);
  });

  it("repetir la misma referencia responde 200 con idempotente=true y no vuelve a cobrar", async () => {
    const primera = await request(ctx.app).post("/api/compras").send(cuerpo());
    const segunda = await request(ctx.app).post("/api/compras").send(cuerpo());

    expect(primera.status).toBe(201);
    expect(segunda.status).toBe(200);
    expect(segunda.body.idempotente).toBe(true);
    expect(segunda.body.ticket._id).toBe(primera.body.ticket._id);
    expect(segunda.headers.location).toBeUndefined();

    // Ni un segundo ticket, ni un segundo cargo, ni un segundo rastro.
    expect(await ctx.db.collection("tickets").countDocuments()).toBe(1);
    expect(await ctx.db.collection("transacciones").countDocuments()).toBe(1);
    expect(await ctx.db.collection("auditoria_eventos").countDocuments()).toBe(1);
  });

  it("acepta la cabecera Idempotency-Key cuando coincide con la referencia del cuerpo", async () => {
    const respuesta = await request(ctx.app)
      .post("/api/compras")
      .set("Idempotency-Key", "REF-1")
      .send(cuerpo());

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.transaccion.referencia_pasarela).toBe("REF-1");
  });

  it("rechaza con 400 una cabecera Idempotency-Key que no coincide con la referencia del cuerpo", async () => {
    const respuesta = await request(ctx.app)
      .post("/api/compras")
      .set("Idempotency-Key", "OTRA-REF")
      .send(cuerpo());

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("peticion_invalida");
    expect(await ctx.db.collection("tickets").countDocuments()).toBe(0);
  });

  it("rechaza con 400 la cabecera Idempotency-Key cuando el cuerpo no trae referencia_pasarela", async () => {
    const sinReferencia = cuerpo();

    delete sinReferencia.referencia_pasarela;

    const respuesta = await request(ctx.app)
      .post("/api/compras")
      .set("Idempotency-Key", "SOLO-CABECERA")
      .send(sinReferencia);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("peticion_invalida");
    expect(await ctx.db.collection("tickets").countDocuments()).toBe(0);
    expect(await ctx.db.collection("transacciones").countDocuments()).toBe(0);
  });

  it("el detalle de un asistente inexistente señala el asistente", async () => {
    const respuesta = await request(ctx.app)
      .post("/api/compras")
      .send(cuerpo({ asistente_id: ID_INEXISTENTE }));

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe("no_encontrado");
    expect(respuesta.body.error.detalles[0].codigo).toBe("usuario_no_encontrado");
    expect(respuesta.body.error.detalles[0].campo).toBe("asistente_id");
  });

  it.each([
    ["evento_no_encontrado", 404, "no_encontrado", () => ({ evento_id: ID_INEXISTENTE })],
    ["evento_no_vendible", 409, "conflicto", () => ({ evento_id: eventoBorradorId })],
    ["tipo_ticket_no_encontrado", 404, "no_encontrado", () => ({ tipo_ticket_id: ID_INEXISTENTE })],
    ["venta_no_iniciada", 409, "conflicto", () => ({ tipo_ticket_id: TIPO_FUTURO })],
    ["venta_cerrada", 409, "conflicto", () => ({ tipo_ticket_id: TIPO_CERRADO })],
    ["usuario_no_encontrado", 404, "no_encontrado", () => ({ usuario_id: ID_INEXISTENTE })],
    ["aforo_agotado", 409, "conflicto", () => ({ tipo_ticket_id: TIPO_AGOTADO })],
  ])("traduce %s a %i %s con el motivo en el detalle", async (motivo, estado, codigo, cambios) => {
    const respuesta = await request(ctx.app).post("/api/compras").send(cuerpo(cambios()));

    expect(respuesta.status).toBe(estado);
    expect(respuesta.body.error.codigo).toBe(codigo);
    expect(respuesta.body.error.detalles[0].codigo).toBe(motivo);
    expect(await ctx.db.collection("tickets").countDocuments()).toBe(0);
  });

  it("una promoción que no aplica al tipo responde 422 con el motivo específico", async () => {
    const respuesta = await request(ctx.app)
      .post("/api/compras")
      .send(cuerpo({ tipo_ticket_id: TIPO_VIP, promocion_codigo: "VERANO10" }));

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.codigo).toBe("validacion");
    expect(respuesta.body.error.detalles[0].campo).toBe("promocion_codigo");
    expect(respuesta.body.error.detalles[0].codigo).toBe("no_aplica_al_tipo");
  });

  it("un cuerpo que no es un objeto responde 400", async () => {
    const respuesta = await request(ctx.app).post("/api/compras").send([1, 2, 3]);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("peticion_invalida");
  });

  it("un cuerpo con campos faltantes responde 422 con el detalle por campo", async () => {
    const respuesta = await request(ctx.app)
      .post("/api/compras")
      .send({ evento_id: eventoId, tipo_ticket_id: TIPO_GENERAL });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.codigo).toBe("validacion");
    expect(respuesta.body.error.detalles.length).toBeGreaterThan(0);
  });
});
