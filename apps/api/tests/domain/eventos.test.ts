import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { prepararEvento, eventoSchema } from "../../src/domain/schemas/eventos.js";
import { IDS } from "./fixtures.js";

const TIPO_TICKET_BASE = {
  _id: IDS.tipoTicket1,
  nombre: "General Día 1",
  precio_cop: 120000,
  aforo_total: 8000,
  aforo_vendido: 1234,
};

const PROMOCION_BASE = {
  codigo: "EARLY2025",
  tipo: "porcentaje" as const,
  valor: 25,
  aplica_a_tipo_ticket_ids: [IDS.tipoTicket1],
  vigencia_inicio: "2025-01-01T00:00:00Z",
  vigencia_fin: "2025-03-31T23:59:59Z",
  usos_maximos: 1000,
  usos_realizados: 234,
  activo: false,
};

const EVENTO_VALIDO = {
  _id: IDS.evento,
  slug: "rock-al-parque-2025",
  nombre: "Rock al Parque 2025",
  tipo_evento: "masivo",
  descripcion: "Festival de rock con 4 escenarios",
  fecha_inicio: "2025-09-12T16:00:00Z",
  fecha_fin: "2025-09-14T23:00:00Z",
  estado: "publicado",
  visibilidad: "publico",
  organizador_id: IDS.usuario,
  lugar_id: IDS.lugar,
  categorias: ["musica", "rock", "festival"],
  configuracion_evento: {
    plantilla_id: "festival_v2",
    branding: {
      color_primario: "#FF6B35",
      color_secundario: "#004E89",
      logo_url: "https://cdn.eventix.test/brands/rock2025.png",
    },
    encuesta_post_evento: {
      habilitada: true,
      preguntas: [
        { id: "q1", tipo: "escala", texto: "¿Cómo calificarías el evento?", rango: [1, 5] },
        { id: "q2", tipo: "abierta", texto: "¿Qué artista disfrutaste más?" },
      ],
    },
    hibrido: {
      habilitado: true,
      url_streaming: "https://stream.eventix.test/rock2025",
    },
  },
  tipos_ticket: [TIPO_TICKET_BASE],
  promociones: [PROMOCION_BASE],
  metricas_evento: {
    tickets_vendidos_total: 1721,
    ingresos_cop: 415000000,
    ultima_actualizacion: "2025-09-01T12:00:00Z",
  },
  tags: ["2025", "festival", "bogota"],
  creado_en: "2024-11-20T10:00:00Z",
  actualizado_en: "2025-09-01T12:00:00Z",
  _v: 17,
};

describe("eventoSchema", () => {
  it("acepta el evento de ejemplo del documento 04", () => {
    const evento = eventoSchema.parse(EVENTO_VALIDO);

    expect(evento.slug).toBe("rock-al-parque-2025");
    expect(evento.tipos_ticket).toHaveLength(1);
  });

  it("rechaza un tipo_evento fuera del catálogo", () => {
    expect(eventoSchema.safeParse({ ...EVENTO_VALIDO, tipo_evento: "concierto" }).success).toBe(
      false,
    );
  });

  it("rechaza un estado fuera del catálogo", () => {
    expect(eventoSchema.safeParse({ ...EVENTO_VALIDO, estado: "en_curso" }).success).toBe(false);
  });

  it("rechaza un slug que no cumple el patrón ^[a-z0-9-]+$", () => {
    expect(eventoSchema.safeParse({ ...EVENTO_VALIDO, slug: "Rock Al Parque" }).success).toBe(
      false,
    );
  });

  it("rechaza una fecha_fin anterior o igual a fecha_inicio", () => {
    expect(
      eventoSchema.safeParse({ ...EVENTO_VALIDO, fecha_fin: EVENTO_VALIDO.fecha_inicio }).success,
    ).toBe(false);
  });

  it("rechaza un aforo_vendido superior al aforo_total", () => {
    const tipos_ticket = [{ ...TIPO_TICKET_BASE, aforo_vendido: 9000 }];

    expect(eventoSchema.safeParse({ ...EVENTO_VALIDO, tipos_ticket }).success).toBe(false);
  });

  it("rechaza una promoción cuya vigencia termina antes de empezar", () => {
    const promociones = [{ ...PROMOCION_BASE, vigencia_inicio: "2025-04-01T00:00:00Z" }];

    expect(eventoSchema.safeParse({ ...EVENTO_VALIDO, promociones }).success).toBe(false);
  });

  it("rechaza una promoción con más usos realizados que usos máximos", () => {
    const promociones = [{ ...PROMOCION_BASE, usos_realizados: 1001 }];

    expect(eventoSchema.safeParse({ ...EVENTO_VALIDO, promociones }).success).toBe(false);
  });

  it("rechaza un porcentaje de descuento mayor a 100", () => {
    const promociones = [{ ...PROMOCION_BASE, valor: 150 }];

    expect(eventoSchema.safeParse({ ...EVENTO_VALIDO, promociones }).success).toBe(false);
  });

  it("rechaza una promoción 2x1 con valor menor a 2", () => {
    const promociones = [{ ...PROMOCION_BASE, tipo: "2x1" as const, valor: 1 }];

    expect(eventoSchema.safeParse({ ...EVENTO_VALIDO, promociones }).success).toBe(false);
  });

  it("rechaza una promoción que aplica a un tipo de ticket ajeno al evento", () => {
    const promociones = [{ ...PROMOCION_BASE, aplica_a_tipo_ticket_ids: [IDS.tipoTicket2] }];

    expect(eventoSchema.safeParse({ ...EVENTO_VALIDO, promociones }).success).toBe(false);
  });

  it("rechaza más de 5 categorías", () => {
    const categorias = ["uno", "dos", "tres", "cuatro", "cinco", "seis"];

    expect(eventoSchema.safeParse({ ...EVENTO_VALIDO, categorias }).success).toBe(false);
  });

  it("acepta 10 tipos de ticket (tope del documento 04 §1.2) y rechaza el 11", () => {
    const tipos = (cantidad: number) =>
      Array.from({ length: cantidad }, (_, indice) => ({
        ...TIPO_TICKET_BASE,
        _id: `${IDS.tipoTicket1.slice(0, 20)}${indice.toString().padStart(4, "0")}`,
      }));

    expect(eventoSchema.safeParse({ ...EVENTO_VALIDO, tipos_ticket: tipos(10) }).success).toBe(
      true,
    );
    expect(eventoSchema.safeParse({ ...EVENTO_VALIDO, tipos_ticket: tipos(11) }).success).toBe(
      false,
    );
  });

  it("rechaza un evento híbrido habilitado sin url de streaming", () => {
    const configuracion_evento = {
      ...EVENTO_VALIDO.configuracion_evento,
      hibrido: { habilitado: true },
    };

    expect(eventoSchema.safeParse({ ...EVENTO_VALIDO, configuracion_evento }).success).toBe(false);
  });

  it("rechaza una pregunta de escala sin rango", () => {
    const configuracion_evento = {
      ...EVENTO_VALIDO.configuracion_evento,
      encuesta_post_evento: {
        habilitada: true,
        preguntas: [{ id: "q1", tipo: "escala", texto: "¿Cómo calificarías?" }],
      },
    };

    expect(eventoSchema.safeParse({ ...EVENTO_VALIDO, configuracion_evento }).success).toBe(false);
  });

  it("rechaza un rango de escala cuyo mínimo no es menor que el máximo", () => {
    const configuracion_evento = {
      ...EVENTO_VALIDO.configuracion_evento,
      encuesta_post_evento: {
        habilitada: true,
        preguntas: [{ id: "q1", tipo: "escala", texto: "¿Cómo calificarías?", rango: [5, 1] }],
      },
    };

    expect(eventoSchema.safeParse({ ...EVENTO_VALIDO, configuracion_evento }).success).toBe(false);
  });

  it("rechaza más de 5 promociones activas (tope del documento 04 §1.2)", () => {
    const promociones = Array.from({ length: 6 }, (_, indice) => ({
      ...PROMOCION_BASE,
      codigo: `PROMO${indice}`,
      activo: true,
    }));

    expect(eventoSchema.safeParse({ ...EVENTO_VALIDO, promociones }).success).toBe(false);
  });

  it("rechaza una ventana de venta de un tipo de ticket invertida", () => {
    const tipos_ticket = [
      {
        ...TIPO_TICKET_BASE,
        restricciones: {
          venta_inicio: "2025-06-01T00:00:00Z",
          venta_fin: "2025-05-01T00:00:00Z",
        },
      },
    ];

    expect(eventoSchema.safeParse({ ...EVENTO_VALIDO, tipos_ticket }).success).toBe(false);
  });

  it("acepta una categoría con acentos y espacios", () => {
    const categorias = ["música", "rock and roll"];

    expect(eventoSchema.safeParse({ ...EVENTO_VALIDO, categorias }).success).toBe(true);
  });

  it("normaliza a hexadecimal un _id de MongoDB", () => {
    const evento = eventoSchema.parse({ ...EVENTO_VALIDO, _id: new ObjectId(IDS.evento) });

    expect(evento._id).toBe(IDS.evento);
  });

  it("no exige que las métricas embebidas coincidan con la suma de aforos (deriva controlada)", () => {
    const metricas_evento = {
      tickets_vendidos_total: 999999,
      ingresos_cop: 1,
      ultima_actualizacion: "2025-09-01T12:00:00Z",
    };

    expect(eventoSchema.safeParse({ ...EVENTO_VALIDO, metricas_evento }).success).toBe(true);
  });
});

describe("prepararEvento", () => {
  it("deriva el slug a partir del nombre cuando no viene informado", () => {
    const evento = prepararEvento({
      nombre: "Rock al Parque 2025",
      tipo_evento: "masivo",
      fecha_inicio: "2025-09-12T16:00:00Z",
      fecha_fin: "2025-09-14T23:00:00Z",
      organizador_id: IDS.usuario,
      lugar_id: IDS.lugar,
    });

    expect(evento.slug).toBe("rock-al-parque-2025");
  });

  it("respeta un slug explícito válido aunque no derive del nombre", () => {
    // Decisión de dominio: el slug se deriva del nombre cuando no viene, pero
    // una URL comercial puede no derivar de él; lo que sí se exige es el
    // formato y la unicidad (índice), no la coincidencia con el nombre.
    const evento = prepararEvento({
      slug: "rock-2025-oficial",
      nombre: "Rock al Parque 2025",
      tipo_evento: "masivo",
      fecha_inicio: "2025-09-12T16:00:00Z",
      fecha_fin: "2025-09-14T23:00:00Z",
      organizador_id: IDS.usuario,
      lugar_id: IDS.lugar,
    });

    expect(evento.slug).toBe("rock-2025-oficial");
  });

  it("inicializa el estado en borrador, las métricas y las marcas de tiempo", () => {
    const ahora = new Date("2025-01-01T00:00:00Z");
    const evento = prepararEvento(
      {
        nombre: "Rock al Parque 2025",
        tipo_evento: "masivo",
        fecha_inicio: "2025-09-12T16:00:00Z",
        fecha_fin: "2025-09-14T23:00:00Z",
        organizador_id: IDS.usuario,
        lugar_id: IDS.lugar,
      },
      ahora,
    );

    expect(evento.estado).toBe("borrador");
    expect(evento.metricas_evento?.tickets_vendidos_total).toBe(0);
    expect(evento.creado_en).toEqual(ahora);
    expect(evento._v).toBe(0);
  });
});
