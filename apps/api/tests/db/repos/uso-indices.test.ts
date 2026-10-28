import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db, type Document } from "mongodb";
import { config } from "../../../src/config.js";
import { aplicarSetup } from "../../../src/db/setup.js";
import {
  crearRepositorioAuditoria,
  crearRepositorioEventos,
  crearRepositorioLugares,
  crearRepositorioTickets,
  crearRepositorioTransacciones,
  crearRepositorioUsuarios,
} from "../../../src/db/repos/index.js";
import {
  auditoriaABson,
  eventoABson,
  lugarABson,
  ticketABson,
  transaccionABson,
  usuarioABson,
} from "../../../src/db/mapeo.js";
import {
  auditoriaSchema,
  eventoSchema,
  lugarSchema,
  ticketSchema,
  transaccionSchema,
  usuarioSchema,
  type Auditoria,
  type Evento,
  type Lugar,
  type Ticket,
  type Transaccion,
  type Usuario,
} from "../../../src/domain/schemas/index.js";
import { validar } from "../../../src/domain/validar.js";
import { DOCUMENTOS_EJEMPLO } from "../../domain/documentos-ejemplo.js";

/**
 * Uso real de los índices (tarea T3.4, evidencia directa del NFR-01).
 *
 * El test no reescribe la consulta: **observa la que manda la aplicación**.
 * El profiler del servidor registra cada consulta con su filtro y su orden,
 * y con esos mismos valores se pide el `explain`. Así el plan que se verifica
 * es el de la consulta real del repositorio, no el de una copia escrita aquí.
 *
 * Cada consulta se prueba contra su índice esperado (los 27 del documento 04
 * §4) y el plan nunca puede ser un `COLLSCAN`.
 */

const DB_PRUEBA = `${config.MONGODB_DB}_indices_uso`;

/**
 * Documentos por colección.
 *
 * No es un detalle: con una colección muy chica el planificador elige el
 * `COLLSCAN` por coste y el diagnóstico sería falso. Con cientos de
 * documentos el índice gana y la medición significa algo.
 */
const CANTIDAD = 300;

let cliente: MongoClient;
let db: Db;

/** Repositorios: se crean en el `beforeAll`, cuando ya existe la conexión. */
let usuarios: ReturnType<typeof crearRepositorioUsuarios>;
let lugares: ReturnType<typeof crearRepositorioLugares>;
let eventos: ReturnType<typeof crearRepositorioEventos>;
let tickets: ReturnType<typeof crearRepositorioTickets>;
let transacciones: ReturnType<typeof crearRepositorioTransacciones>;
let auditoria: ReturnType<typeof crearRepositorioAuditoria>;

const USUARIO_BASE = validar(usuarioSchema, DOCUMENTOS_EJEMPLO.usuarios, "usuario") as Usuario;
const LUGAR_BASE = validar(lugarSchema, DOCUMENTOS_EJEMPLO.lugares, "lugar") as Lugar;
const EVENTO_BASE = validar(eventoSchema, DOCUMENTOS_EJEMPLO.eventos, "evento") as Evento;
const TICKET_BASE = validar(ticketSchema, DOCUMENTOS_EJEMPLO.tickets, "ticket") as Ticket;
const TRANSACCION_BASE = validar(
  transaccionSchema,
  DOCUMENTOS_EJEMPLO.transacciones,
  "transaccion",
) as Transaccion;
const AUDITORIA_BASE = validar(
  auditoriaSchema,
  DOCUMENTOS_EJEMPLO.auditoria_eventos,
  "auditoria",
) as Auditoria;

/** Identificador hexadecimal único (24 caracteres) para el dato de prueba `i`. */
function idDePrueba(prefijo: string, i: number): string {
  return `${prefijo}${String(i).padStart(24 - prefijo.length, "0")}`;
}

/** `_id` nuevo para cada documento de prueba. */
function idNuevo(): string {
  return new ObjectId().toHexString();
}

function usuariosDePrueba(): Usuario[] {
  return Array.from({ length: CANTIDAD }, (_, i) => ({
    ...USUARIO_BASE,
    _id: undefined,
    email: `persona${i}@example.com`,
    email_normalizado: `persona${i}@example.com`,
    nombre: `Persona ${i}`,
    tipo_usuario: (i % 3 === 0 ? ["organizador"] : ["asistente"]) as Usuario["tipo_usuario"],
    preferencias: { ...USUARIO_BASE.preferencias, idioma: i % 2 === 0 ? "es-CO" : "en-US" },
  }));
}

function lugaresDePrueba(): Lugar[] {
  return Array.from({ length: CANTIDAD }, (_, i) => ({
    ...LUGAR_BASE,
    _id: undefined,
    nombre: `Lugar ${i}`,
    ciudad: i % 2 === 0 ? "Bogotá" : "Medellín",
    geometria: {
      type: "Point" as const,
      // El lugar 0 queda en Bogotá; el resto, lejos, para que la búsqueda por
      // proximidad tenga un ganador claro y un excluido claro.
      coordinates:
        i === 0
          ? ([-74.09, 4.654] as [number, number])
          : ([-80 + (i % 20) * 0.5, 8] as [number, number]),
    },
    activo: i % 10 !== 0,
  }));
}

function eventosDePrueba(): Evento[] {
  return Array.from({ length: CANTIDAD }, (_, i) => ({
    ...EVENTO_BASE,
    _id: undefined,
    slug: i === 0 ? "rock-al-parque-prueba" : `evento-prueba-${i}`,
    nombre: i === 0 ? "Rock al Parque" : `Evento de prueba ${i}`,
    descripcion: i === 0 ? "Festival de rock" : "Descripcion de prueba",
    tipo_evento: i === 1 ? "corporativo" : "masivo",
    estado: i % 2 === 0 ? "publicado" : "borrador",
    visibilidad: "publico",
    categorias: i === 0 ? ["musica", "rock"] : ["general"],
    tags: i === 0 ? ["festival"] : ["2025"],
    fecha_inicio: new Date(Date.UTC(2025, 0, 1 + (i % 28), 16)),
    fecha_fin: new Date(Date.UTC(2025, 0, 2 + (i % 28), 23)),
    metricas_evento: {
      tickets_vendidos_total: i,
      ingresos_cop: i * 1000,
      ultima_actualizacion: new Date(Date.UTC(2025, 0, 1)),
    },
    organizador_id: idDePrueba("66a1", i),
    lugar_id: idDePrueba("66b1", i),
  }));
}

function ticketsDePrueba(): Ticket[] {
  return Array.from({ length: CANTIDAD }, (_, i) => ({
    ...TICKET_BASE,
    _id: undefined,
    codigo_qr: `QR-PRUEBA-${i}`,
    estado: i % 3 === 0 ? "usado" : "emitido",
    evento_id: idDePrueba("66c1", i),
    comprado_por_usuario_id: idDePrueba("66a2", i),
    transaccion_id: idDePrueba("66e3", i),
    emitido_en: new Date(Date.UTC(2025, 1, 1 + (i % 28), 11)),
    validado_en: i % 3 === 0 ? new Date(Date.UTC(2025, 1, 15, 18)) : null,
    validado_por_puerta: i % 3 === 0 ? "Puerta A" : null,
  }));
}

function transaccionesDePrueba(): Transaccion[] {
  const estados: Transaccion["estado"][] = ["aprobada", "pendiente", "rechazada", "anulada"];

  return Array.from({ length: CANTIDAD }, (_, i) => ({
    ...TRANSACCION_BASE,
    _id: undefined,
    estado: estados[i % 4] ?? "aprobada",
    usuario_id: idDePrueba("66a3", i),
    ticket_id: idDePrueba("66d1", i),
    referencia_pasarela: `TXN-PRUEBA-${i}`,
    creada_en: new Date(Date.UTC(2025, 1, 1 + (i % 28), 11)),
    confirmada_en: i % 4 === 0 ? new Date(Date.UTC(2025, 1, 1 + (i % 28), 11, 3)) : undefined,
  }));
}

function auditoriasDePrueba(): Auditoria[] {
  return Array.from({ length: CANTIDAD }, (_, i) => ({
    ...AUDITORIA_BASE,
    _id: undefined,
    actor_id: idDePrueba("66f1", i),
    sujeto_id: idDePrueba("66f2", i),
    sujeto_tipo: i % 2 === 0 ? "ticket" : "evento",
    ocurrido_en: new Date(Date.UTC(2025, 1, 1 + (i % 28), 11)),
    metadata: { ip: "190.24.1.10" },
  }));
}

beforeAll(async () => {
  cliente = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });
  await cliente.connect();
  db = cliente.db(DB_PRUEBA);
  await db.dropDatabase();
  await aplicarSetup(db);

  await db
    .collection("usuarios")
    .insertMany(usuariosDePrueba().map((u) => usuarioABson({ ...u, _id: idNuevo() })));
  await db
    .collection("lugares")
    .insertMany(lugaresDePrueba().map((l) => lugarABson({ ...l, _id: idNuevo() })));
  await db
    .collection("eventos")
    .insertMany(eventosDePrueba().map((e) => eventoABson({ ...e, _id: idNuevo() })));
  await db
    .collection("tickets")
    .insertMany(ticketsDePrueba().map((t) => ticketABson({ ...t, _id: idNuevo() })));
  await db
    .collection("transacciones")
    .insertMany(transaccionesDePrueba().map((t) => transaccionABson({ ...t, _id: idNuevo() })));
  await db
    .collection("auditoria_eventos")
    .insertMany(auditoriasDePrueba().map((a) => auditoriaABson({ ...a, _id: idNuevo() })));

  usuarios = crearRepositorioUsuarios(db.collection("usuarios"));
  lugares = crearRepositorioLugares(db.collection("lugares"));
  eventos = crearRepositorioEventos(db.collection("eventos"));
  tickets = crearRepositorioTickets(db.collection("tickets"));
  transacciones = crearRepositorioTransacciones(db.collection("transacciones"));
  auditoria = crearRepositorioAuditoria(db.collection("auditoria_eventos"));
});

afterAll(async () => {
  await db.dropDatabase();
  await cliente.close();
});

/** Etapa del plan de ejecución. */
type EtapaPlan = {
  stage?: string;
  indexName?: string;
  inputStage?: EtapaPlan;
};

/** Entrada del profiler del servidor. */
type EntradaPerfil = {
  op: string;
  ns: string;
  command: { find?: string; filter?: Document; sort?: Document };
  planSummary?: string;
};

async function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/** Nombres de los índices que aparecen en el plan, en cualquier nivel. */
function indicesDelPlan(plan: EtapaPlan | undefined): string[] {
  const nombres: string[] = [];
  let etapa = plan;

  while (etapa) {
    if (etapa.indexName) {
      nombres.push(etapa.indexName);
    }

    etapa = etapa.inputStage;
  }

  return nombres;
}

/**
 * Última consulta registrada por el profiler que contiene el marcador.
 *
 * El marcador distingue una consulta de otra sobre la misma colección, así
 * que el test nunca puede validar el plan de una consulta anterior.
 */
async function ultimaConsulta(coleccion: string, marcador: string): Promise<EntradaPerfil> {
  const ns = `${DB_PRUEBA}.${coleccion}`;

  for (let intento = 0; intento < 40; intento += 1) {
    const entradas = await db
      .collection("system.profile")
      .find({ op: "query", ns })
      .sort({ ts: -1 })
      .limit(20)
      .toArray();

    const encontrada = entradas.find((entrada) =>
      JSON.stringify(entrada.command ?? {}).includes(marcador),
    );

    if (encontrada) {
      return encontrada as EntradaPerfil;
    }

    await esperar(50);
  }

  throw new Error(`El profiler no registró sobre ${ns} una consulta con el marcador "${marcador}"`);
}

/**
 * Ejecuta la consulta de la aplicación y devuelve el plan de **esa** consulta.
 *
 * El profiler devuelve el filtro y el orden tal como los mandó el driver; con
 * esos mismos valores se pide el `explain`, de modo que el plan verificado es
 * el de la consulta real y no el de una copia escrita en el test.
 */
async function planReal(
  coleccion: string,
  marcador: string,
  ejecutar: () => Promise<unknown>,
): Promise<EtapaPlan> {
  await db.command({ profile: 2, slowms: 0 });

  try {
    await ejecutar();

    const entrada = await ultimaConsulta(coleccion, marcador);
    const cursor = db.collection(coleccion).find(entrada.command.filter ?? {});

    if (entrada.command.sort) {
      cursor.sort(entrada.command.sort);
    }

    const plan = await cursor.explain("executionStats");

    return plan.queryPlanner.winningPlan as EtapaPlan;
  } finally {
    await db.command({ profile: 0 });
  }
}

describe("T3.4 · cada consulta usa el índice que la sostiene", () => {
  const casos: Array<{
    nombre: string;
    coleccion: string;
    indice: string;
    marcador: string;
    ejecutar: () => Promise<unknown>;
  }> = [
    {
      nombre: "usuarios por correo normalizado",
      coleccion: "usuarios",
      indice: "usuarios_email_normalizado_unique",
      marcador: "email_normalizado",
      ejecutar: () => usuarios.porEmailNormalizado("persona0@example.com"),
    },
    {
      nombre: "usuarios por tipo",
      coleccion: "usuarios",
      indice: "usuarios_tipo_usuario",
      marcador: "tipo_usuario",
      ejecutar: () => usuarios.porTipoUsuario("organizador"),
    },
    {
      nombre: "usuarios por idioma preferido",
      coleccion: "usuarios",
      indice: "usuarios_preferencias_idioma",
      marcador: "preferencias.idioma",
      ejecutar: () => usuarios.porIdioma("es-CO"),
    },
    {
      nombre: "lugares por ciudad",
      coleccion: "lugares",
      indice: "lugares_ciudad_activo",
      marcador: "ciudad",
      ejecutar: () => lugares.porCiudad("Bogotá"),
    },
    {
      nombre: "lugares cercanos",
      coleccion: "lugares",
      indice: "lugares_geometria_2dsphere",
      marcador: "geometria",
      ejecutar: () =>
        lugares.cercaDe({ longitud: -74.09, latitud: 4.654 }, { distanciaMaximaMetros: 50_000 }),
    },
    {
      nombre: "eventos por slug",
      coleccion: "eventos",
      indice: "eventos_slug_unique",
      marcador: "slug",
      ejecutar: () => eventos.porSlug("rock-al-parque-prueba"),
    },
    {
      nombre: "catálogo público de eventos",
      coleccion: "eventos",
      indice: "eventos_estado_fecha_inicio",
      marcador: "visibilidad",
      ejecutar: () => eventos.catalogoPublico(),
    },
    {
      nombre: "eventos por tipo",
      coleccion: "eventos",
      indice: "eventos_tipo_evento_fecha_inicio",
      marcador: "tipo_evento",
      ejecutar: () => eventos.porTipoEvento("masivo"),
    },
    {
      nombre: "eventos por categoría",
      coleccion: "eventos",
      indice: "eventos_categorias",
      marcador: "categorias",
      ejecutar: () => eventos.porCategoria("rock"),
    },
    {
      nombre: "eventos por varias categorías",
      coleccion: "eventos",
      indice: "eventos_categorias",
      marcador: "$in",
      ejecutar: () => eventos.porCategorias(["rock", "general"]),
    },
    {
      nombre: "eventos por texto",
      coleccion: "eventos",
      indice: "eventos_texto_text",
      marcador: "$text",
      ejecutar: () => eventos.buscarPorTexto("festival"),
    },
    {
      nombre: "eventos por lugar",
      coleccion: "eventos",
      indice: "eventos_lugar_id",
      marcador: "lugar_id",
      ejecutar: () => eventos.porLugar(idDePrueba("66b1", 0)),
    },
    {
      nombre: "eventos por organizador",
      coleccion: "eventos",
      indice: "eventos_organizador_id",
      marcador: "organizador_id",
      ejecutar: () => eventos.porOrganizador(idDePrueba("66a1", 0)),
    },
    {
      nombre: "eventos con promoción activa",
      coleccion: "eventos",
      indice: "eventos_promociones_codigo_parcial",
      marcador: "promociones.codigo",
      ejecutar: () => eventos.conPromocionActiva("EARLY2025"),
    },
    {
      nombre: "ranking de eventos más vendidos",
      coleccion: "eventos",
      indice: "eventos_metricas_tickets_vendidos_total",
      marcador: "metricas_evento.tickets_vendidos_total",
      ejecutar: () => eventos.masVendidos(10),
    },
    {
      nombre: "eventos próximos por fecha",
      coleccion: "eventos",
      indice: "eventos_fecha_inicio",
      marcador: "fecha_inicio",
      ejecutar: () => eventos.proximos(new Date(Date.UTC(2025, 0, 15))),
    },
    {
      nombre: "tickets por código QR",
      coleccion: "tickets",
      indice: "tickets_codigo_qr_unique",
      marcador: "codigo_qr",
      ejecutar: () => tickets.porCodigoQr("QR-PRUEBA-0"),
    },
    {
      nombre: "tickets por evento y estado",
      coleccion: "tickets",
      indice: "tickets_evento_id_estado",
      marcador: "evento_id",
      ejecutar: () => tickets.porEventoYEstado(idDePrueba("66c1", 0), "usado"),
    },
    {
      nombre: "mis tickets",
      coleccion: "tickets",
      indice: "tickets_comprado_por_usuario_emitido_en",
      marcador: "comprado_por_usuario_id",
      ejecutar: () => tickets.misTickets(idDePrueba("66a2", 0)),
    },
    {
      nombre: "tickets por transacción",
      coleccion: "tickets",
      indice: "tickets_transaccion_id",
      marcador: "transaccion_id",
      ejecutar: () => tickets.porTransaccion(idDePrueba("66e3", 0)),
    },
    {
      nombre: "tickets validados en una ventana",
      coleccion: "tickets",
      indice: "tickets_estado_validado_en_parcial",
      marcador: "validado_en",
      ejecutar: () =>
        tickets.validadosEnVentana(
          new Date(Date.UTC(2025, 1, 1)),
          new Date(Date.UTC(2025, 1, 28, 23, 59)),
        ),
    },
    {
      nombre: "transacciones de un usuario en una ventana",
      coleccion: "transacciones",
      indice: "transacciones_usuario_creada_en",
      marcador: "usuario_id",
      ejecutar: () =>
        transacciones.porUsuarioYFecha(
          idDePrueba("66a3", 0),
          new Date(Date.UTC(2025, 1, 1)),
          new Date(Date.UTC(2025, 1, 28, 23, 59)),
        ),
    },
    {
      nombre: "transacciones de un estado en una ventana",
      coleccion: "transacciones",
      indice: "transacciones_estado_creada_en",
      marcador: "estado",
      ejecutar: () =>
        transacciones.porEstadoYFecha(
          "aprobada",
          new Date(Date.UTC(2025, 1, 1)),
          new Date(Date.UTC(2025, 1, 28, 23, 59)),
        ),
    },
    {
      nombre: "transacciones por referencia de pasarela",
      coleccion: "transacciones",
      indice: "transacciones_pasarela_referencia_parcial",
      marcador: "referencia_pasarela",
      ejecutar: () => transacciones.porReferencia("wompi_mock", "TXN-PRUEBA-0"),
    },
    {
      nombre: "transacciones confirmadas en una ventana",
      coleccion: "transacciones",
      indice: "transacciones_confirmada_en",
      marcador: "confirmada_en",
      ejecutar: () =>
        transacciones.porFechaConfirmacion(
          new Date(Date.UTC(2025, 1, 1)),
          new Date(Date.UTC(2025, 1, 28, 23, 59)),
        ),
    },
    {
      nombre: "auditoría de un actor en una ventana",
      coleccion: "auditoria_eventos",
      indice: "auditoria_actor_ocurrido_en",
      marcador: "actor_id",
      ejecutar: () =>
        auditoria.porActorYFecha(
          idDePrueba("66f1", 0),
          new Date(Date.UTC(2025, 1, 1)),
          new Date(Date.UTC(2025, 1, 28, 23, 59)),
        ),
    },
    {
      nombre: "auditoría de un sujeto",
      coleccion: "auditoria_eventos",
      indice: "auditoria_sujeto_tipo_sujeto_id",
      marcador: "sujeto_id",
      ejecutar: () => auditoria.porSujeto("ticket", idDePrueba("66f2", 0)),
    },
    {
      nombre: "auditoría ocurrida en una ventana",
      coleccion: "auditoria_eventos",
      indice: "auditoria_ocurrido_en_ttl",
      marcador: "ocurrido_en",
      ejecutar: () =>
        auditoria.porOcurridoEn(
          new Date(Date.UTC(2025, 1, 1)),
          new Date(Date.UTC(2025, 1, 28, 23, 59)),
        ),
    },
  ];

  it("cubre los 27 índices del documento 04 §4", () => {
    // 27 índices distintos y 28 consultas: el índice multikey de categorías
    // responde a dos patrones de query (una categoría y varias).
    expect(new Set(casos.map((caso) => caso.indice)).size).toBe(27);
    expect(casos).toHaveLength(28);
  });

  for (const caso of casos) {
    it(`${caso.nombre} usa ${caso.indice}`, async () => {
      const plan = await planReal(caso.coleccion, caso.marcador, caso.ejecutar);

      expect(indicesDelPlan(plan), "el plan debe nombrar el índice esperado").toContain(
        caso.indice,
      );
      expect(plan.stage).not.toBe("COLLSCAN");
    });
  }
});
