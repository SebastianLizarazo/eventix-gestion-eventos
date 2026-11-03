import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { config } from "../../src/config.js";
import { crearContextoPrueba, type ContextoPrueba } from "./helpers.js";
import { IDS } from "../domain/fixtures.js";

/**
 * T4.3 · endpoints de las otras cinco colecciones: `usuarios`, `lugares`,
 * `tickets`, `transacciones` y `auditoria_eventos`.
 */
let contexto: ContextoPrueba;

const USUARIO = {
  email: "ana.gomez@example.com",
  nombre: "Ana Gómez",
  telefono: "+57 311 555 1234",
  documento_identidad: "1234567890",
  tipo_usuario: ["asistente"],
  fecha_nacimiento: "1992-04-15",
  preferencias: { newsletter: true, idioma: "es-CO", canal_notif: ["email"] },
};

const LUGAR = {
  nombre: "Corferias - Pabellón 4",
  direccion: "Carrera 37 #24-67, Bogotá",
  ciudad: "Bogotá",
  pais: "CO",
  capacidad_total: 2500,
  geometria: { type: "Point", coordinates: [-74.09, 4.654] },
  salas: [{ nombre: "Sala A", capacidad: 1500, piso: 1 }],
};

const TICKET = {
  codigo_qr: "QR-RK25-AB12CD34",
  evento_id: IDS.evento,
  comprado_por_usuario_id: IDS.usuario,
  snapshot_tipo_ticket: {
    tipo_ticket_id: IDS.tipoTicket1,
    nombre: "General Día 1",
    precio_cop: 120000,
  },
  asistente_snapshot: {
    usuario_id: IDS.usuario,
    nombre: "Ana Gómez",
    documento_identidad: "1234567890",
    email: "ana.gomez@example.com",
  },
  precio_pagado_cop: 90000,
};

const TRANSACCION = {
  usuario_id: IDS.usuario,
  ticket_id: IDS.ticket,
  monto_cop: 90000,
  metodo_pago: "tarjeta_credito",
  pasarela: "wompi_mock",
  referencia_pasarela: "TXN-MOCK-987654",
};

const AUDITORIA = {
  actor_id: IDS.usuario,
  actor_rol: "organizador",
  accion: "ticket.emitido",
  sujeto_tipo: "ticket",
  sujeto_id: IDS.ticket,
  metadata: { evento_id: IDS.evento },
};

beforeAll(async () => {
  contexto = await crearContextoPrueba({ nombreBase: `${config.MONGODB_DB}_http_recursos` });
});

afterAll(async () => {
  await contexto.cerrar();
});

beforeEach(async () => {
  await contexto.limpiar();
});

describe("T4.3 · usuarios", () => {
  it("crea el usuario con el correo normalizado derivado", async () => {
    const response = await request(contexto.app).post("/api/usuarios").send(USUARIO);

    expect(response.status).toBe(201);
    expect(response.body.email_normalizado).toBe("anagomez@example.com");
    expect(response.headers.location).toBe(`/api/usuarios/${response.body._id}`);
  });

  it("rechaza un correo inválido con 422", async () => {
    const response = await request(contexto.app)
      .post("/api/usuarios")
      .send({ ...USUARIO, email: "no-es-un-correo" });

    expect(response.status).toBe(422);
    expect(response.body.error.codigo).toBe("validacion");
  });

  it("devuelve 409 con un correo ya registrado", async () => {
    await request(contexto.app).post("/api/usuarios").send(USUARIO);

    const response = await request(contexto.app).post("/api/usuarios").send(USUARIO);

    expect(response.status).toBe(409);
  });

  it("filtra la lista por tipo de usuario", async () => {
    await request(contexto.app).post("/api/usuarios").send(USUARIO);
    await request(contexto.app)
      .post("/api/usuarios")
      .send({ ...USUARIO, email: "bruno@eventix.test", tipo_usuario: ["organizador"] });

    const response = await request(contexto.app)
      .get("/api/usuarios")
      .query({ tipo_usuario: "organizador" });

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].tipo_usuario).toEqual(["organizador"]);
  });

  it("actualiza el nombre del usuario", async () => {
    const creado = await request(contexto.app).post("/api/usuarios").send(USUARIO);

    const response = await request(contexto.app)
      .patch(`/api/usuarios/${creado.body._id as string}`)
      .send({ nombre: "Ana Gómez Pérez" });

    expect(response.status).toBe(200);
    expect(response.body.nombre).toBe("Ana Gómez Pérez");
  });

  it("da de baja el usuario y responde 404 después", async () => {
    const creado = await request(contexto.app).post("/api/usuarios").send(USUARIO);

    const borrado = await request(contexto.app).delete(
      `/api/usuarios/${creado.body._id as string}`,
    );
    expect(borrado.status).toBe(204);

    const consulta = await request(contexto.app).get(`/api/usuarios/${creado.body._id as string}`);
    expect(consulta.status).toBe(404);
  });
});

describe("T4.3 · lugares", () => {
  it("crea el lugar", async () => {
    const response = await request(contexto.app).post("/api/lugares").send(LUGAR);

    expect(response.status).toBe(201);
    expect(response.body.pais).toBe("CO");
    expect(response.body.creado_en).toBeDefined();
  });

  it("rechaza un país que no es un código alfa-2 con 422", async () => {
    const response = await request(contexto.app)
      .post("/api/lugares")
      .send({ ...LUGAR, pais: "COL" });

    expect(response.status).toBe(422);
    expect(response.body.error.codigo).toBe("validacion");
  });

  it("lista los lugares de una ciudad", async () => {
    await request(contexto.app).post("/api/lugares").send(LUGAR);

    const response = await request(contexto.app).get("/api/lugares").query({ ciudad: "Bogotá" });

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
  });

  it("busca los lugares cercanos por coordenadas", async () => {
    await request(contexto.app).post("/api/lugares").send(LUGAR);

    const response = await request(contexto.app)
      .get("/api/lugares/cerca")
      .query({ longitud: -74.09, latitud: 4.654, distancia: 1000 });

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
  });

  it("devuelve 400 con coordenadas que no son números", async () => {
    const response = await request(contexto.app)
      .get("/api/lugares/cerca")
      .query({ longitud: "oeste", latitud: 4.654 });

    expect(response.status).toBe(400);
    expect(response.body.error.codigo).toBe("peticion_invalida");
  });

  it("da de baja el lugar", async () => {
    const creado = await request(contexto.app).post("/api/lugares").send(LUGAR);

    const borrado = await request(contexto.app).delete(`/api/lugares/${creado.body._id as string}`);

    expect(borrado.status).toBe(204);
  });
});

describe("T4.3 · tickets", () => {
  it("crea el ticket con la fecha de emisión del servidor", async () => {
    const response = await request(contexto.app).post("/api/tickets").send(TICKET);

    expect(response.status).toBe(201);
    expect(response.body.emitido_en).toBeDefined();
    expect(response.body.estado).toBe("emitido");
  });

  it("rechaza un ticket sin el snapshot del asistente con 422", async () => {
    const response = await request(contexto.app)
      .post("/api/tickets")
      .send({ ...TICKET, asistente_snapshot: undefined });

    expect(response.status).toBe(422);
    expect(response.body.error.codigo).toBe("validacion");
  });

  it("devuelve 409 con un código QR repetido", async () => {
    await request(contexto.app).post("/api/tickets").send(TICKET);

    const response = await request(contexto.app).post("/api/tickets").send(TICKET);

    expect(response.status).toBe(409);
  });

  it("busca el ticket por su código QR", async () => {
    await request(contexto.app).post("/api/tickets").send(TICKET);

    const response = await request(contexto.app).get("/api/tickets/codigo/QR-RK25-AB12CD34");

    expect(response.status).toBe(200);
    expect(response.body.codigo_qr).toBe("QR-RK25-AB12CD34");
  });

  it("filtra los tickets de un evento por estado", async () => {
    await request(contexto.app).post("/api/tickets").send(TICKET);

    const response = await request(contexto.app)
      .get("/api/tickets")
      .query({ evento_id: IDS.evento, estado: "emitido" });

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
  });

  it("marca el ticket como usado con la validación de la puerta", async () => {
    const creado = await request(contexto.app).post("/api/tickets").send(TICKET);

    const response = await request(contexto.app)
      .patch(`/api/tickets/${creado.body._id as string}`)
      .send({ estado: "usado", validado_en: "2025-09-12T16:30:00Z", validado_por_puerta: "A" });

    expect(response.status).toBe(200);
    expect(response.body.estado).toBe("usado");
    expect(response.body.validado_por_puerta).toBe("A");
  });

  it("lista los tickets de un usuario", async () => {
    const usuario = await request(contexto.app).post("/api/usuarios").send(USUARIO);
    await request(contexto.app)
      .post("/api/tickets")
      .send({ ...TICKET, comprado_por_usuario_id: usuario.body._id });

    const response = await request(contexto.app).get(
      `/api/usuarios/${usuario.body._id as string}/tickets`,
    );

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
  });

  it("devuelve 404 al pedir los tickets de un usuario que no existe", async () => {
    const response = await request(contexto.app).get(`/api/usuarios/${IDS.usuario}/tickets`);

    expect(response.status).toBe(404);
  });
});

describe("T4.3 · transacciones", () => {
  it("crea la transacción en estado pendiente", async () => {
    const response = await request(contexto.app).post("/api/transacciones").send(TRANSACCION);

    expect(response.status).toBe(201);
    expect(response.body.estado).toBe("pendiente");
    expect(response.body.creada_en).toBeDefined();
  });

  it("rechaza un método de pago inválido con 422", async () => {
    const response = await request(contexto.app)
      .post("/api/transacciones")
      .send({ ...TRANSACCION, metodo_pago: "bitcoin" });

    expect(response.status).toBe(422);
    expect(response.body.error.codigo).toBe("validacion");
  });

  it("filtra las transacciones por usuario y estado", async () => {
    await request(contexto.app).post("/api/transacciones").send(TRANSACCION);

    const response = await request(contexto.app)
      .get("/api/transacciones")
      .query({ usuario_id: IDS.usuario, estado: "pendiente" });

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
  });

  it("aprueba la transacción con su fecha de confirmación", async () => {
    const creado = await request(contexto.app).post("/api/transacciones").send(TRANSACCION);

    const response = await request(contexto.app)
      .patch(`/api/transacciones/${creado.body._id as string}`)
      .send({ estado: "aprobada", confirmada_en: "2025-02-15T11:24:03Z" });

    expect(response.status).toBe(200);
    expect(response.body.estado).toBe("aprobada");
  });
});

describe("T4.3 · auditoría", () => {
  it("registra la auditoría con la fecha de ocurrencia del servidor", async () => {
    const response = await request(contexto.app).post("/api/auditoria").send(AUDITORIA);

    expect(response.status).toBe(201);
    expect(response.body.ocurrido_en).toBeDefined();
  });

  it("rechaza una acción que no es un identificador de dominio con 422", async () => {
    const response = await request(contexto.app)
      .post("/api/auditoria")
      .send({ ...AUDITORIA, accion: "Ticket Emitido" });

    expect(response.status).toBe(422);
    expect(response.body.error.codigo).toBe("validacion");
  });

  it("filtra la auditoría por sujeto", async () => {
    await request(contexto.app).post("/api/auditoria").send(AUDITORIA);

    const response = await request(contexto.app)
      .get("/api/auditoria")
      .query({ sujeto_tipo: "ticket", sujeto_id: IDS.ticket });

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
  });

  it("no permite editar una auditoría: responde 405", async () => {
    const creado = await request(contexto.app).post("/api/auditoria").send(AUDITORIA);

    const response = await request(contexto.app)
      .patch(`/api/auditoria/${creado.body._id as string}`)
      .send({ accion: "otro.accion" });

    expect(response.status).toBe(405);
    expect(response.body.error.codigo).toBe("metodo_no_permitido");
  });

  it("no permite borrar una auditoría: responde 405", async () => {
    const creado = await request(contexto.app).post("/api/auditoria").send(AUDITORIA);

    const response = await request(contexto.app).delete(
      `/api/auditoria/${creado.body._id as string}`,
    );

    expect(response.status).toBe(405);
    expect(response.body.error.codigo).toBe("metodo_no_permitido");
  });
});
