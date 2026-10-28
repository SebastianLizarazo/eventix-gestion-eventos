import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { config } from "../../src/config.js";
import { crearContextoPrueba, type ContextoPrueba } from "./helpers.js";

/**
 * T4.4 · matriz de errores 4xx por endpoint.
 *
 * Cada endpoint tiene al menos un caso 4xx con su código de error: un cliente
 * que se equivoca siempre recibe el mismo cuerpo y sabe qué le pasó.
 */

/** Identificador que no existe en ninguna colección. */
const INEXISTENTE = "000000000000000000000000";

const USUARIO = {
  email: "ana.gomez@example.com",
  nombre: "Ana Gómez",
  documento_identidad: "1234567890",
  tipo_usuario: ["asistente"],
};

const LUGAR = {
  nombre: "Corferias - Pabellón 4",
  direccion: "Carrera 37 #24-67, Bogotá",
  ciudad: "Bogotá",
  pais: "CO",
  capacidad_total: 2500,
  geometria: { type: "Point", coordinates: [-74.09, 4.654] },
};

const EVENTO = {
  nombre: "Rock al Parque 2025",
  tipo_evento: "masivo",
  fecha_inicio: "2025-09-12T16:00:00Z",
  fecha_fin: "2025-09-14T23:00:00Z",
  estado: "publicado",
  visibilidad: "publico",
};

const TICKET = {
  codigo_qr: "QR-RK25-AB12CD34",
  snapshot_tipo_ticket: {
    tipo_ticket_id: "000000000000000000000001",
    nombre: "General Día 1",
    precio_cop: 120000,
  },
  asistente_snapshot: {
    usuario_id: "000000000000000000000002",
    nombre: "Ana Gómez",
    documento_identidad: "1234567890",
    email: "ana.gomez@example.com",
  },
  precio_pagado_cop: 90000,
};

const TRANSACCION = {
  monto_cop: 90000,
  metodo_pago: "tarjeta_credito",
  pasarela: "wompi_mock",
  referencia_pasarela: "TXN-MOCK-987654",
};

const AUDITORIA = {
  actor_id: "000000000000000000000002",
  actor_rol: "organizador",
  accion: "ticket.emitido",
  sujeto_tipo: "ticket",
  sujeto_id: "000000000000000000000003",
};

let contexto: ContextoPrueba;
let app: Express;

let ids: {
  usuario: string;
  lugar: string;
  evento: string;
  ticket: string;
  transaccion: string;
  auditoria: string;
};

beforeAll(async () => {
  contexto = await crearContextoPrueba({ nombreBase: `${config.MONGODB_DB}_http_matriz` });
  app = contexto.app;

  const usuario = await request(app).post("/api/usuarios").send(USUARIO);
  const lugar = await request(app).post("/api/lugares").send(LUGAR);
  const evento = await request(app)
    .post("/api/eventos")
    .send({ ...EVENTO, organizador_id: usuario.body._id, lugar_id: lugar.body._id });
  const ticket = await request(app)
    .post("/api/tickets")
    .send({ ...TICKET, evento_id: evento.body._id, comprado_por_usuario_id: usuario.body._id });
  const transaccion = await request(app)
    .post("/api/transacciones")
    .send({
      ...TRANSACCION,
      usuario_id: usuario.body._id,
      ticket_id: ticket.body._id,
    });
  const auditoria = await request(app).post("/api/auditoria").send(AUDITORIA);

  ids = {
    usuario: usuario.body._id as string,
    lugar: lugar.body._id as string,
    evento: evento.body._id as string,
    ticket: ticket.body._id as string,
    transaccion: transaccion.body._id as string,
    auditoria: auditoria.body._id as string,
  };
});

afterAll(async () => {
  await contexto.cerrar();
});

type Metodo = "get" | "post" | "patch" | "delete";

type Caso = {
  nombre: string;
  metodo: Metodo;
  ruta: string;
  cuerpo?: Record<string, unknown>;
  esperado: number;
  codigo: string;
};

/** Los casos 4xx de cada endpoint (se construyen cuando ya hay datos). */
function construirCasos(): Caso[] {
  return [
    // usuarios
    {
      nombre: "lista de usuarios con paginación inválida",
      metodo: "get",
      ruta: "/api/usuarios?limit=abc",
      esperado: 400,
      codigo: "peticion_invalida",
    },
    {
      nombre: "alta de usuario con correo inválido",
      metodo: "post",
      ruta: "/api/usuarios",
      cuerpo: { ...USUARIO, email: "no-es-correo" },
      esperado: 422,
      codigo: "validacion",
    },
    {
      nombre: "alta de usuario con correo repetido",
      metodo: "post",
      ruta: "/api/usuarios",
      cuerpo: USUARIO,
      esperado: 409,
      codigo: "conflicto",
    },
    {
      nombre: "usuario que no existe",
      metodo: "get",
      ruta: `/api/usuarios/${INEXISTENTE}`,
      esperado: 404,
      codigo: "no_encontrado",
    },
    {
      nombre: "usuario con identificador inválido",
      metodo: "get",
      ruta: "/api/usuarios/no-es-un-id",
      esperado: 400,
      codigo: "peticion_invalida",
    },
    {
      nombre: "edición de usuario con correo inválido",
      metodo: "patch",
      ruta: `/api/usuarios/${ids.usuario}`,
      cuerpo: { email: "no-es-correo" },
      esperado: 422,
      codigo: "validacion",
    },
    {
      nombre: "baja de usuario que no existe",
      metodo: "delete",
      ruta: `/api/usuarios/${INEXISTENTE}`,
      esperado: 404,
      codigo: "no_encontrado",
    },
    {
      nombre: "tickets de un usuario que no existe",
      metodo: "get",
      ruta: `/api/usuarios/${INEXISTENTE}/tickets`,
      esperado: 404,
      codigo: "no_encontrado",
    },

    // lugares
    {
      nombre: "lista de lugares con paginación inválida",
      metodo: "get",
      ruta: "/api/lugares?limit=abc",
      esperado: 400,
      codigo: "peticion_invalida",
    },
    {
      nombre: "alta de lugar con país inválido",
      metodo: "post",
      ruta: "/api/lugares",
      cuerpo: { ...LUGAR, pais: "COL" },
      esperado: 422,
      codigo: "validacion",
    },
    {
      nombre: "lugar que no existe",
      metodo: "get",
      ruta: `/api/lugares/${INEXISTENTE}`,
      esperado: 404,
      codigo: "no_encontrado",
    },
    {
      nombre: "búsqueda de lugares con coordenadas inválidas",
      metodo: "get",
      ruta: "/api/lugares/cerca?longitud=oeste&latitud=4.654",
      esperado: 400,
      codigo: "peticion_invalida",
    },
    {
      nombre: "edición de lugar con país inválido",
      metodo: "patch",
      ruta: `/api/lugares/${ids.lugar}`,
      cuerpo: { pais: "COL" },
      esperado: 422,
      codigo: "validacion",
    },
    {
      nombre: "baja de lugar que no existe",
      metodo: "delete",
      ruta: `/api/lugares/${INEXISTENTE}`,
      esperado: 404,
      codigo: "no_encontrado",
    },

    // eventos
    {
      nombre: "lista de eventos con tipo inválido",
      metodo: "get",
      ruta: "/api/eventos?tipo_evento=inventado",
      esperado: 400,
      codigo: "peticion_invalida",
    },
    {
      nombre: "alta de evento sin nombre",
      metodo: "post",
      ruta: "/api/eventos",
      cuerpo: { ...EVENTO, nombre: "" },
      esperado: 422,
      codigo: "validacion",
    },
    {
      nombre: "catálogo con paginación inválida",
      metodo: "get",
      ruta: "/api/eventos/catalogo?limit=abc",
      esperado: 400,
      codigo: "peticion_invalida",
    },
    {
      nombre: "evento que no existe",
      metodo: "get",
      ruta: `/api/eventos/${INEXISTENTE}`,
      esperado: 404,
      codigo: "no_encontrado",
    },
    {
      nombre: "edición de evento con tipo inválido",
      metodo: "patch",
      ruta: `/api/eventos/${ids.evento}`,
      cuerpo: { tipo_evento: "inventado" },
      esperado: 422,
      codigo: "validacion",
    },
    {
      nombre: "baja de evento que no existe",
      metodo: "delete",
      ruta: `/api/eventos/${INEXISTENTE}`,
      esperado: 404,
      codigo: "no_encontrado",
    },
    {
      nombre: "tipos de ticket de un evento que no existe",
      metodo: "get",
      ruta: `/api/eventos/${INEXISTENTE}/tipos-ticket`,
      esperado: 404,
      codigo: "no_encontrado",
    },
    {
      nombre: "alta de tipo de ticket inválido",
      metodo: "post",
      ruta: `/api/eventos/${ids.evento}/tipos-ticket`,
      cuerpo: { nombre: "", precio_cop: 1, aforo_total: 1 },
      esperado: 422,
      codigo: "validacion",
    },
    {
      nombre: "edición de tipo de ticket que no existe",
      metodo: "patch",
      ruta: `/api/eventos/${ids.evento}/tipos-ticket/${INEXISTENTE}`,
      cuerpo: { precio_cop: 1 },
      esperado: 404,
      codigo: "no_encontrado",
    },
    {
      nombre: "baja de tipo de ticket que no existe",
      metodo: "delete",
      ruta: `/api/eventos/${ids.evento}/tipos-ticket/${INEXISTENTE}`,
      esperado: 404,
      codigo: "no_encontrado",
    },
    {
      nombre: "promociones de un evento que no existe",
      metodo: "get",
      ruta: `/api/eventos/${INEXISTENTE}/promociones`,
      esperado: 404,
      codigo: "no_encontrado",
    },
    {
      nombre: "alta de promoción con vigencia inválida",
      metodo: "post",
      ruta: `/api/eventos/${ids.evento}/promociones`,
      cuerpo: {
        codigo: "MALA",
        tipo: "porcentaje",
        valor: 10,
        vigencia_inicio: "2025-01-01T00:00:00Z",
        vigencia_fin: "2024-01-01T00:00:00Z",
      },
      esperado: 422,
      codigo: "validacion",
    },
    {
      nombre: "edición de promoción que no existe",
      metodo: "patch",
      ruta: `/api/eventos/${ids.evento}/promociones/NOEXISTE`,
      cuerpo: { valor: 5 },
      esperado: 404,
      codigo: "no_encontrado",
    },
    {
      nombre: "baja de promoción que no existe",
      metodo: "delete",
      ruta: `/api/eventos/${ids.evento}/promociones/NOEXISTE`,
      esperado: 404,
      codigo: "no_encontrado",
    },

    // tickets
    {
      nombre: "lista de tickets con estado inválido",
      metodo: "get",
      ruta: "/api/tickets?estado=inventado",
      esperado: 400,
      codigo: "peticion_invalida",
    },
    {
      nombre: "alta de ticket con precio inválido",
      metodo: "post",
      ruta: "/api/tickets",
      cuerpo: { ...TICKET, precio_pagado_cop: -1 },
      esperado: 422,
      codigo: "validacion",
    },
    {
      nombre: "ticket por código que no existe",
      metodo: "get",
      ruta: "/api/tickets/codigo/NOEXISTE",
      esperado: 404,
      codigo: "no_encontrado",
    },
    {
      nombre: "ticket que no existe",
      metodo: "get",
      ruta: `/api/tickets/${INEXISTENTE}`,
      esperado: 404,
      codigo: "no_encontrado",
    },
    {
      nombre: "edición de ticket con estado inválido",
      metodo: "patch",
      ruta: `/api/tickets/${ids.ticket}`,
      cuerpo: { estado: "inventado" },
      esperado: 422,
      codigo: "validacion",
    },
    {
      nombre: "baja de ticket que no existe",
      metodo: "delete",
      ruta: `/api/tickets/${INEXISTENTE}`,
      esperado: 404,
      codigo: "no_encontrado",
    },

    // transacciones
    {
      nombre: "lista de transacciones con estado inválido",
      metodo: "get",
      ruta: "/api/transacciones?estado=inventado",
      esperado: 400,
      codigo: "peticion_invalida",
    },
    {
      nombre: "alta de transacción con método de pago inválido",
      metodo: "post",
      ruta: "/api/transacciones",
      cuerpo: { ...TRANSACCION, metodo_pago: "bitcoin" },
      esperado: 422,
      codigo: "validacion",
    },
    {
      nombre: "transacción que no existe",
      metodo: "get",
      ruta: `/api/transacciones/${INEXISTENTE}`,
      esperado: 404,
      codigo: "no_encontrado",
    },
    {
      nombre: "edición de transacción con estado inválido",
      metodo: "patch",
      ruta: `/api/transacciones/${ids.transaccion}`,
      cuerpo: { estado: "inventado" },
      esperado: 422,
      codigo: "validacion",
    },
    {
      nombre: "baja de transacción que no existe",
      metodo: "delete",
      ruta: `/api/transacciones/${INEXISTENTE}`,
      esperado: 404,
      codigo: "no_encontrado",
    },

    // auditoría
    {
      nombre: "lista de auditoría con rol inválido",
      metodo: "get",
      ruta: "/api/auditoria?actor_rol=inventado",
      esperado: 400,
      codigo: "peticion_invalida",
    },
    {
      nombre: "alta de auditoría con acción inválida",
      metodo: "post",
      ruta: "/api/auditoria",
      cuerpo: { ...AUDITORIA, accion: "Ticket Emitido" },
      esperado: 422,
      codigo: "validacion",
    },
    {
      nombre: "registro de auditoría que no existe",
      metodo: "get",
      ruta: `/api/auditoria/${INEXISTENTE}`,
      esperado: 404,
      codigo: "no_encontrado",
    },
    {
      nombre: "edición de auditoría prohibida",
      metodo: "patch",
      ruta: `/api/auditoria/${ids.auditoria}`,
      cuerpo: { accion: "otro.accion" },
      esperado: 405,
      codigo: "metodo_no_permitido",
    },
    {
      nombre: "baja de auditoría prohibida",
      metodo: "delete",
      ruta: `/api/auditoria/${ids.auditoria}`,
      esperado: 405,
      codigo: "metodo_no_permitido",
    },
  ];
}

describe("T4.4 · errores 4xx por endpoint", () => {
  it("responde 4xx con el formato único en cada endpoint", async () => {
    const fallos: string[] = [];

    for (const caso of construirCasos()) {
      const peticion = request(app)[caso.metodo](caso.ruta);

      if (caso.cuerpo !== undefined) {
        peticion.send(caso.cuerpo);
      }

      const respuesta = await peticion;

      if (respuesta.status !== caso.esperado) {
        fallos.push(`${caso.nombre}: esperaba ${caso.esperado} y llegó ${respuesta.status}`);
        continue;
      }

      if (respuesta.body?.error?.codigo !== caso.codigo) {
        fallos.push(
          `${caso.nombre}: esperaba el código ${caso.codigo} y llegó ${respuesta.body?.error?.codigo}`,
        );
        continue;
      }

      if (typeof respuesta.body?.error?.mensaje !== "string") {
        fallos.push(`${caso.nombre}: la respuesta no trae el mensaje del error`);
        continue;
      }

      if (typeof respuesta.body?.error?.request_id !== "string") {
        fallos.push(`${caso.nombre}: la respuesta no trae el identificador de la petición`);
      }
    }

    expect(fallos).toEqual([]);
  });
});
