import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { config } from "../../src/config.js";
import { crearContextoPrueba, type ContextoPrueba } from "./helpers.js";
import { IDS } from "../domain/fixtures.js";

/**
 * T4.2 · endpoints de `eventos`: alta, edición, baja, tipos de ticket y
 * promociones.
 *
 * El evento es la colección central: sus tipos de ticket y sus promociones
 * van embebidos, así que sus sub-recursos se prueban sobre el evento real.
 */
let contexto: ContextoPrueba;

const EVENTO = {
  nombre: "Rock al Parque 2025",
  tipo_evento: "masivo",
  descripcion: "Festival de rock con 4 escenarios",
  fecha_inicio: "2025-09-12T16:00:00Z",
  fecha_fin: "2025-09-14T23:00:00Z",
  estado: "publicado",
  visibilidad: "publico",
  organizador_id: IDS.usuario,
  lugar_id: IDS.lugar,
  categorias: ["musica", "rock"],
  tags: ["2025"],
};

const TIPO_TICKET = {
  nombre: "General Día 1",
  precio_cop: 120000,
  aforo_total: 8000,
  restricciones: { edad_minima: 0, max_por_compra: 6 },
};

const PROMOCION = {
  codigo: "EARLY2025",
  tipo: "porcentaje",
  valor: 25,
  vigencia_inicio: "2025-01-01T00:00:00Z",
  vigencia_fin: "2025-03-31T23:59:59Z",
  usos_maximos: 1000,
  activo: true,
};

beforeAll(async () => {
  contexto = await crearContextoPrueba({ nombreBase: `${config.MONGODB_DB}_http_eventos` });
});

afterAll(async () => {
  await contexto.cerrar();
});

beforeEach(async () => {
  await contexto.limpiar();
});

/** Crea un evento y devuelve su cuerpo. */
async function crearEvento(
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const response = await request(contexto.app)
    .post("/api/eventos")
    .send({ ...EVENTO, ...overrides });

  expect(response.status).toBe(201);

  return response.body;
}

describe("T4.2 · alta de eventos", () => {
  it("crea el evento y devuelve 201 con el identificador y la ubicación", async () => {
    const response = await request(contexto.app).post("/api/eventos").send(EVENTO);

    expect(response.status).toBe(201);
    expect(response.body._id).toMatch(/^[0-9a-f]{24}$/);
    expect(response.headers.location).toBe(`/api/eventos/${response.body._id}`);
  });

  it("deriva el slug del nombre cuando el cliente no lo manda", async () => {
    const evento = await crearEvento();

    expect(evento.slug).toBe("rock-al-parque-2025");
  });

  it("rechaza un evento sin nombre con 422 y el detalle del campo", async () => {
    const response = await request(contexto.app)
      .post("/api/eventos")
      .send({ ...EVENTO, nombre: "" });

    expect(response.status).toBe(422);
    expect(response.body.error.codigo).toBe("validacion");
    expect(response.body.error.detalles[0].campo).toBe("nombre");
  });

  it("rechaza un evento con fechas invertidas con 422", async () => {
    const response = await request(contexto.app)
      .post("/api/eventos")
      .send({ ...EVENTO, fecha_fin: "2025-09-01T00:00:00Z" });

    expect(response.status).toBe(422);
    expect(response.body.error.detalles[0].campo).toBe("fecha_fin");
  });

  it("devuelve 409 cuando el slug ya existe", async () => {
    await crearEvento();

    const response = await request(contexto.app).post("/api/eventos").send(EVENTO);

    expect(response.status).toBe(409);
    expect(response.body.error.codigo).toBe("conflicto");
  });
});

describe("T4.2 · consulta de eventos", () => {
  it("devuelve el evento por identificador", async () => {
    const evento = await crearEvento();

    const response = await request(contexto.app).get(`/api/eventos/${evento._id as string}`);

    expect(response.status).toBe(200);
    expect(response.body.nombre).toBe("Rock al Parque 2025");
  });

  it("devuelve 400 con un identificador que no es un ObjectId", async () => {
    const response = await request(contexto.app).get("/api/eventos/no-es-un-id");

    expect(response.status).toBe(400);
    expect(response.body.error.codigo).toBe("peticion_invalida");
  });

  it("devuelve 404 con un identificador que no existe", async () => {
    const response = await request(contexto.app).get(`/api/eventos/${IDS.evento}`);

    expect(response.status).toBe(404);
    expect(response.body.error.codigo).toBe("no_encontrado");
  });

  it("filtra la lista por tipo de evento", async () => {
    await crearEvento();
    await crearEvento({ nombre: "Encuentro corporativo", tipo_evento: "corporativo" });

    const response = await request(contexto.app)
      .get("/api/eventos")
      .query({ tipo_evento: "masivo" });

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].tipo_evento).toBe("masivo");
    expect(response.body.total).toBe(1);
  });

  it("el catálogo solo devuelve los eventos publicados y públicos", async () => {
    await crearEvento();
    await crearEvento({ nombre: "Evento en borrador", estado: "borrador" });
    await crearEvento({ nombre: "Evento privado", visibilidad: "privado" });

    const response = await request(contexto.app).get("/api/eventos/catalogo");

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].nombre).toBe("Rock al Parque 2025");
  });

  it("devuelve 400 con una paginación inválida", async () => {
    const response = await request(contexto.app).get("/api/eventos").query({ limit: "muchos" });

    expect(response.status).toBe(400);
    expect(response.body.error.codigo).toBe("peticion_invalida");
  });
});

describe("T4.2 · edición y baja de eventos", () => {
  it("actualiza los campos enviados y deja los demás intactos", async () => {
    const evento = await crearEvento();

    const response = await request(contexto.app)
      .patch(`/api/eventos/${evento._id as string}`)
      .send({ nombre: "Rock al Parque 2026" });

    expect(response.status).toBe(200);
    expect(response.body.nombre).toBe("Rock al Parque 2026");
    expect(response.body.slug).toBe("rock-al-parque-2025");
  });

  it("rechaza una edición inválida con 422", async () => {
    const evento = await crearEvento();

    const response = await request(contexto.app)
      .patch(`/api/eventos/${evento._id as string}`)
      .send({ tipo_evento: "inventado" });

    expect(response.status).toBe(422);
    expect(response.body.error.codigo).toBe("validacion");
  });

  it("devuelve 404 al editar un evento que no existe", async () => {
    const response = await request(contexto.app)
      .patch(`/api/eventos/${IDS.evento}`)
      .send({ nombre: "No existe" });

    expect(response.status).toBe(404);
  });

  it("da de baja el evento y luego responde 404", async () => {
    const evento = await crearEvento();

    const borrado = await request(contexto.app).delete(`/api/eventos/${evento._id as string}`);
    expect(borrado.status).toBe(204);

    const consulta = await request(contexto.app).get(`/api/eventos/${evento._id as string}`);
    expect(consulta.status).toBe(404);
  });
});

describe("T4.2 · tipos de ticket del evento", () => {
  it("agrega un tipo de ticket con identificador asignado por el servidor", async () => {
    const evento = await crearEvento();

    const response = await request(contexto.app)
      .post(`/api/eventos/${evento._id as string}/tipos-ticket`)
      .send(TIPO_TICKET);

    expect(response.status).toBe(201);
    expect(response.body._id).toMatch(/^[0-9a-f]{24}$/);
    expect(response.body.aforo_vendido).toBe(0);

    const consulta = await request(contexto.app).get(
      `/api/eventos/${evento._id as string}/tipos-ticket`,
    );
    expect(consulta.body).toHaveLength(1);
  });

  it("rechaza un tipo de ticket con aforo vendido mayor que el total", async () => {
    const evento = await crearEvento();

    const response = await request(contexto.app)
      .post(`/api/eventos/${evento._id as string}/tipos-ticket`)
      .send({ ...TIPO_TICKET, aforo_vendido: 10, aforo_total: 5 });

    expect(response.status).toBe(422);
    expect(response.body.error.detalles[0].campo).toBe("aforo_vendido");
  });

  it("rechaza más de diez tipos de ticket con 422", async () => {
    const evento = await crearEvento();

    for (let indice = 0; indice < 10; indice += 1) {
      const respuesta = await request(contexto.app)
        .post(`/api/eventos/${evento._id as string}/tipos-ticket`)
        .send({ ...TIPO_TICKET, nombre: `Tipo ${indice}` });

      expect(respuesta.status).toBe(201);
    }

    const response = await request(contexto.app)
      .post(`/api/eventos/${evento._id as string}/tipos-ticket`)
      .send({ ...TIPO_TICKET, nombre: "Tipo 11" });

    expect(response.status).toBe(422);
  });

  it("actualiza un tipo de ticket del evento", async () => {
    const evento = await crearEvento();
    const creado = await request(contexto.app)
      .post(`/api/eventos/${evento._id as string}/tipos-ticket`)
      .send(TIPO_TICKET);

    const response = await request(contexto.app)
      .patch(`/api/eventos/${evento._id as string}/tipos-ticket/${creado.body._id as string}`)
      .send({ precio_cop: 150000 });

    expect(response.status).toBe(200);
    expect(response.body.precio_cop).toBe(150000);
    expect(response.body.nombre).toBe("General Día 1");
  });

  it("devuelve 404 al actualizar un tipo de ticket que no existe", async () => {
    const evento = await crearEvento();

    const response = await request(contexto.app)
      .patch(`/api/eventos/${evento._id as string}/tipos-ticket/${IDS.tipoTicket1}`)
      .send({ precio_cop: 150000 });

    expect(response.status).toBe(404);
  });

  it("elimina un tipo de ticket del evento", async () => {
    const evento = await crearEvento();
    const creado = await request(contexto.app)
      .post(`/api/eventos/${evento._id as string}/tipos-ticket`)
      .send(TIPO_TICKET);

    const borrado = await request(contexto.app).delete(
      `/api/eventos/${evento._id as string}/tipos-ticket/${creado.body._id as string}`,
    );
    expect(borrado.status).toBe(204);

    const consulta = await request(contexto.app).get(
      `/api/eventos/${evento._id as string}/tipos-ticket`,
    );
    expect(consulta.body).toHaveLength(0);
  });
});

describe("T4.2 · promociones del evento", () => {
  it("agrega una promoción al evento", async () => {
    const evento = await crearEvento();

    const response = await request(contexto.app)
      .post(`/api/eventos/${evento._id as string}/promociones`)
      .send(PROMOCION);

    expect(response.status).toBe(201);
    expect(response.body.codigo).toBe("EARLY2025");
    expect(response.body.usos_realizados).toBe(0);
  });

  it("rechaza una promoción con vigencia invertida con 422", async () => {
    const evento = await crearEvento();

    const response = await request(contexto.app)
      .post(`/api/eventos/${evento._id as string}/promociones`)
      .send({ ...PROMOCION, vigencia_fin: "2024-12-31T00:00:00Z" });

    expect(response.status).toBe(422);
    expect(response.body.error.detalles[0].campo).toBe("vigencia_fin");
  });

  it("rechaza una promoción que apunta a un tipo de ticket ajeno con 422", async () => {
    const evento = await crearEvento();

    const response = await request(contexto.app)
      .post(`/api/eventos/${evento._id as string}/promociones`)
      .send({ ...PROMOCION, aplica_a_tipo_ticket_ids: [IDS.tipoTicket1] });

    expect(response.status).toBe(422);
  });

  it("elimina una promoción del evento", async () => {
    const evento = await crearEvento();
    await request(contexto.app)
      .post(`/api/eventos/${evento._id as string}/promociones`)
      .send(PROMOCION);

    const borrado = await request(contexto.app).delete(
      `/api/eventos/${evento._id as string}/promociones/EARLY2025`,
    );
    expect(borrado.status).toBe(204);

    const consulta = await request(contexto.app).get(
      `/api/eventos/${evento._id as string}/promociones`,
    );
    expect(consulta.body).toHaveLength(0);
  });
});
