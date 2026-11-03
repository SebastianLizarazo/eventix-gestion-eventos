import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { config } from "../../../src/config.js";
import { aplicarSetup } from "../../../src/db/setup.js";
import { crearRepositorioEventos } from "../../../src/db/repos/eventos.js";
import { eventoSchema, type Evento } from "../../../src/domain/schemas/index.js";
import { validar } from "../../../src/domain/validar.js";
import { IDS } from "../../domain/fixtures.js";
import { DOCUMENTOS_EJEMPLO } from "../../domain/documentos-ejemplo.js";

/**
 * Repositorio de `eventos` (tarea T3.2): las consultas del documento 04 §4.3.
 *
 * Corre contra una base propia para no tocar la base de desarrollo.
 */

const DB_PRUEBA = `${config.MONGODB_DB}_repos_eventos`;

let cliente: MongoClient;
let db: Db;

/** Referencias válidos (24 hex) para distinguir los eventos sembrados. */
const LUGAR_A = IDS.lugar;
const LUGAR_B = "66b000000000000000000099";
const ORGANIZADOR_A = IDS.usuario;
const ORGANIZADOR_B = "66a800000000000000000099";

/** El evento del documento 04 §3.3, ya validado por el dominio. */
const EVENTO_BASE = validar(eventoSchema, DOCUMENTOS_EJEMPLO.eventos, "evento") as Evento;

/**
 * Deriva un evento del ejemplo: el `_id` se quita (lo genera la base) y cada
 * prueba cambia solo los campos que necesita (el `slug` es único).
 */
function evento(overrides: Partial<Evento>): Evento {
  return { ...EVENTO_BASE, _id: undefined, ...overrides };
}

/** Sembra los cuatro eventos que usan las pruebas. */
async function sembrar(): Promise<void> {
  const repositorio = crearRepositorioEventos(db.collection("eventos"));

  await repositorio.insertar(
    evento({
      slug: "rock-al-parque-2025",
      nombre: "Rock al Parque 2025",
      descripcion: "Festival de rock con 4 escenarios",
      tipo_evento: "masivo",
      estado: "publicado",
      visibilidad: "publico",
      fecha_inicio: new Date("2025-09-12T16:00:00Z"),
      fecha_fin: new Date("2025-09-14T23:00:00Z"),
      categorias: ["musica", "rock", "festival"],
      tags: ["2025", "festival", "bogota"],
      organizador_id: ORGANIZADOR_A,
      lugar_id: LUGAR_A,
      metricas_evento: {
        tickets_vendidos_total: 1721,
        ingresos_cop: 415000000,
        ultima_actualizacion: new Date("2025-09-01T12:00:00Z"),
      },
    }),
  );

  await repositorio.insertar(
    evento({
      slug: "concierto-de-jazz-2025",
      nombre: "Concierto de Jazz",
      descripcion: "Noche de jazz con trio local",
      tipo_evento: "corporativo",
      estado: "publicado",
      visibilidad: "publico",
      fecha_inicio: new Date("2025-10-01T19:00:00Z"),
      fecha_fin: new Date("2025-10-01T23:00:00Z"),
      categorias: ["musica", "jazz"],
      tags: ["jazz", "noche"],
      organizador_id: ORGANIZADOR_B,
      lugar_id: LUGAR_B,
      promociones: [
        {
          codigo: "VERANO10",
          tipo: "porcentaje",
          valor: 10,
          aplica_a_tipo_ticket_ids: [IDS.tipoTicket1],
          vigencia_inicio: new Date("2025-05-01T00:00:00Z"),
          vigencia_fin: new Date("2025-08-31T23:59:59Z"),
          usos_maximos: 500,
          usos_realizados: 12,
          activo: true,
        },
      ],
      metricas_evento: {
        tickets_vendidos_total: 900,
        ingresos_cop: 180000000,
        ultima_actualizacion: new Date("2025-09-02T12:00:00Z"),
      },
    }),
  );

  await repositorio.insertar(
    evento({
      slug: "evento-privado-2025",
      nombre: "Encuentro Privado",
      descripcion: "Reunion de tribunal",
      tipo_evento: "hibrido",
      estado: "publicado",
      visibilidad: "privado",
      fecha_inicio: new Date("2025-08-01T09:00:00Z"),
      fecha_fin: new Date("2025-08-01T18:00:00Z"),
      categorias: ["corporativo"],
      tags: ["privado"],
      organizador_id: ORGANIZADOR_A,
      lugar_id: LUGAR_A,
      metricas_evento: {
        tickets_vendidos_total: 50,
        ingresos_cop: 5000000,
        ultima_actualizacion: new Date("2025-09-03T12:00:00Z"),
      },
    }),
  );

  await repositorio.insertar(
    evento({
      slug: "borrador-2025",
      nombre: "Taller en borrador",
      descripcion: " taller ",
      tipo_evento: "academico",
      estado: "borrador",
      visibilidad: "publico",
      fecha_inicio: new Date("2025-07-01T09:00:00Z"),
      fecha_fin: new Date("2025-07-01T18:00:00Z"),
      categorias: ["academico"],
      tags: ["taller"],
      organizador_id: ORGANIZADOR_B,
      lugar_id: LUGAR_B,
      metricas_evento: {
        tickets_vendidos_total: 10,
        ingresos_cop: 1000000,
        ultima_actualizacion: new Date("2025-09-04T12:00:00Z"),
      },
    }),
  );
}

beforeAll(async () => {
  cliente = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });
  await cliente.connect();
  db = cliente.db(DB_PRUEBA);
  await db.dropDatabase();
  await aplicarSetup(db);
});

afterAll(async () => {
  await db.dropDatabase();
  await cliente.close();
});

beforeEach(async () => {
  await db.collection("eventos").deleteMany({});
  await sembrar();
});

describe("T3.2 · repositorio de eventos", () => {
  it("busca un evento por su slug (índice eventos_slug_unique)", async () => {
    const repositorio = crearRepositorioEventos(db.collection("eventos"));

    const encontrado = await repositorio.porSlug("rock-al-parque-2025");

    expect(encontrado?.nombre).toBe("Rock al Parque 2025");
    expect(encontrado?.categorias).toEqual(["musica", "rock", "festival"]);
    await expect(repositorio.porSlug("no-existe")).resolves.toBeNull();
  });

  it("lista el catalogo publico: publicados y publicos, ordenados por fecha_inicio", async () => {
    const repositorio = crearRepositorioEventos(db.collection("eventos"));

    const catalogo = await repositorio.catalogoPublico();

    expect(catalogo.total).toBe(2);
    expect(catalogo.items.map((evento) => evento.slug)).toEqual([
      "rock-al-parque-2025",
      "concierto-de-jazz-2025",
    ]);
    // El evento privado y el borrador quedan fuera aunque empiecen antes.
    expect(catalogo.items.map((evento) => evento.estado)).toEqual(["publicado", "publicado"]);
    expect(catalogo.items.map((evento) => evento.visibilidad)).toEqual(["publico", "publico"]);
  });

  it("filtra por tipo de evento, ordenado por fecha_inicio", async () => {
    const repositorio = crearRepositorioEventos(db.collection("eventos"));

    const masivos = await repositorio.porTipoEvento("masivo");

    expect(masivos.total).toBe(1);
    expect(masivos.items.map((evento) => evento.slug)).toEqual(["rock-al-parque-2025"]);
  });

  it("filtra por una categoria (índice multikey eventos_categorias)", async () => {
    const repositorio = crearRepositorioEventos(db.collection("eventos"));

    const porMusica = await repositorio.porCategoria("musica");

    expect(porMusica.total).toBe(2);
    expect(porMusica.items.map((evento) => evento.slug).sort()).toEqual([
      "concierto-de-jazz-2025",
      "rock-al-parque-2025",
    ]);

    const porJazz = await repositorio.porCategoria("jazz");

    expect(porJazz.items.map((evento) => evento.slug)).toEqual(["concierto-de-jazz-2025"]);
  });

  it("filtra por varias categorias a la vez (índice multikey eventos_categorias)", async () => {
    const repositorio = crearRepositorioEventos(db.collection("eventos"));

    const porCategorias = await repositorio.porCategorias(["rock", "jazz"]);

    expect(porCategorias.total).toBe(2);
    expect(porCategorias.items.map((evento) => evento.slug).sort()).toEqual([
      "concierto-de-jazz-2025",
      "rock-al-parque-2025",
    ]);

    const sinCategorias = await repositorio.porCategorias(["categoria-inexistente"]);

    expect(sinCategorias.total).toBe(0);
    expect(sinCategorias.items).toEqual([]);
  });

  it("busca por texto en nombre, descripcion y tags (índice eventos_texto_text)", async () => {
    const repositorio = crearRepositorioEventos(db.collection("eventos"));

    const porFestival = await repositorio.buscarPorTexto("festival");

    expect(porFestival.total).toBe(1);
    expect(porFestival.items.map((evento) => evento.slug)).toEqual(["rock-al-parque-2025"]);

    const porJazz = await repositorio.buscarPorTexto("jazz");

    expect(porJazz.items.map((evento) => evento.slug)).toEqual(["concierto-de-jazz-2025"]);

    const porTag = await repositorio.buscarPorTexto("taller");

    expect(porTag.items.map((evento) => evento.slug)).toEqual(["borrador-2025"]);

    const sinCoincidencias = await repositorio.buscarPorTexto("ceremonia");

    expect(sinCoincidencias.total).toBe(0);
    expect(sinCoincidencias.items).toEqual([]);
  });

  it("lista los eventos de un lugar (índice eventos_lugar_id)", async () => {
    const repositorio = crearRepositorioEventos(db.collection("eventos"));

    const delLugarA = await repositorio.porLugar(LUGAR_A);

    expect(delLugarA.total).toBe(2);
    expect(delLugarA.items.map((evento) => evento.slug).sort()).toEqual([
      "evento-privado-2025",
      "rock-al-parque-2025",
    ]);

    const delLugarB = await repositorio.porLugar(LUGAR_B);

    expect(delLugarB.items.map((evento) => evento.slug).sort()).toEqual([
      "borrador-2025",
      "concierto-de-jazz-2025",
    ]);
  });

  it("lista los eventos de un organizador (índice eventos_organizador_id)", async () => {
    const repositorio = crearRepositorioEventos(db.collection("eventos"));

    const delOrganizadorA = await repositorio.porOrganizador(ORGANIZADOR_A);

    expect(delOrganizadorA.total).toBe(2);
    expect(delOrganizadorA.items.map((evento) => evento.slug).sort()).toEqual([
      "evento-privado-2025",
      "rock-al-parque-2025",
    ]);

    const delOrganizadorB = await repositorio.porOrganizador(ORGANIZADOR_B);

    expect(delOrganizadorB.items.map((evento) => evento.slug).sort()).toEqual([
      "borrador-2025",
      "concierto-de-jazz-2025",
    ]);
  });

  it("encuentra el evento con una promocion activa y normaliza el codigo", async () => {
    const repositorio = crearRepositorioEventos(db.collection("eventos"));

    const conPromocion = await repositorio.conPromocionActiva("VERANO10");

    expect(conPromocion?.slug).toBe("concierto-de-jazz-2025");

    // El parametro se normaliza a MAYUSCULAS como hace el dominio.
    await expect(repositorio.conPromocionActiva("verano10")).resolves.toMatchObject({
      slug: "concierto-de-jazz-2025",
    });

    // La promocion del evento de rock esta inactiva: no debe aparecer.
    await expect(repositorio.conPromocionActiva("EARLY2025")).resolves.toBeNull();
    await expect(repositorio.conPromocionActiva("codigo-inexistente")).resolves.toBeNull();
  });

  it("ordena por tickets vendidos y respeta el limite (índice eventos_metricas_tickets_vendidos_total)", async () => {
    const repositorio = crearRepositorioEventos(db.collection("eventos"));

    const top = await repositorio.masVendidos(3);

    expect(top.map((evento) => evento.slug)).toEqual([
      "rock-al-parque-2025",
      "concierto-de-jazz-2025",
      "evento-privado-2025",
    ]);

    const dosPrimeros = await repositorio.masVendidos(2);

    expect(dosPrimeros.map((evento) => evento.slug)).toEqual([
      "rock-al-parque-2025",
      "concierto-de-jazz-2025",
    ]);
  });

  it("lista los eventos que empiezan desde una fecha, en orden cronológico (índice eventos_fecha_inicio)", async () => {
    const repositorio = crearRepositorioEventos(db.collection("eventos"));

    const proximos = await repositorio.proximos(new Date("2025-08-15T00:00:00Z"));

    expect(proximos.items.map((evento) => evento.slug)).toEqual([
      "rock-al-parque-2025",
      "concierto-de-jazz-2025",
    ]);

    // El evento privado (agosto) y el borrador (julio) quedan fuera por fecha.
    const desdeJulio = await repositorio.proximos(new Date("2025-07-01T00:00:00Z"));

    expect(desdeJulio.items.map((evento) => evento.slug)).toEqual([
      "borrador-2025",
      "evento-privado-2025",
      "rock-al-parque-2025",
      "concierto-de-jazz-2025",
    ]);
  });
});
