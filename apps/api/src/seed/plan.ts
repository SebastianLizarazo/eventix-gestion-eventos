import {
  crearGenerador,
  fechaEnRango,
  idDeterminista,
  sumarDias,
  sumarHoras,
  type Generador,
} from "./aleatorio.js";
import { ANIO_DATOS, INSTANTE_DATOS, type Volumenes } from "./volumenes.js";
import { slugify } from "../domain/normalization.js";
import { TIPO_EVENTO, TIPO_PROMOCION } from "../domain/schemas/index.js";
import type {
  ESTADO_EVENTO,
  ESTADO_TICKET,
  ESTADO_TRANSACCION,
  VISIBILIDAD_EVENTO,
} from "../domain/schemas/index.js";

/**
 * Plan de generación: la descripción completa y determinista del dataset.
 *
 * El plan se calcula **antes** de escribir nada, y en dos tiempos:
 *
 * 1. Se reparten los tickets entre los eventos y los asistentes entre los
 *    usuarios (cada usuario asiste a un evento y compra 2 o 3 tickets en él).
 * 2. Se recorre cada ticket para acumular los contadores que el sistema es
 *    dueño (`aforo_vendido`, `metricas_evento`, `usos_realizados`) y las
 *    estadísticas del usuario (`tickets_comprados`, `ltv_cop`).
 *
 * Los contadores no se inventan: salen de los tickets que el propio seed
 * genera, así que el dataset es coherente por construcción. Es lo mismo que
 * haría el flujo de compra (H6), pero de una sola vez y con datos sintéticos.
 */

/** Restricciones de un tipo de ticket. */
export type Restricciones = {
  edad_minima?: number;
  max_por_compra?: number;
  venta_inicio?: Date;
  venta_fin?: Date;
};

/** Lugar del plan: ya viene con su geometría y sus salas. */
export type PlanLugar = {
  id: string;
  nombre: string;
  direccion: string;
  ciudad: string;
  pais: string;
  capacidad_total: number;
  geometria: { type: "Point"; coordinates: [number, number] };
  salas: { nombre: string; capacidad: number; piso?: number; tipo?: string }[];
  activo: boolean;
  creado_en: Date;
};

/** Tipo de ticket del plan, con su aforo ya contado. */
export type PlanTipo = {
  id: string;
  nombre: string;
  precio_cop: number;
  aforo_total: number;
  aforo_vendido: number;
  restricciones: Restricciones;
};

/** Promoción del plan, con sus usos ya contados. */
export type PlanPromocion = {
  codigo: string;
  tipo: (typeof TIPO_PROMOCION)[number];
  valor: number;
  aplica_a_tipo_ticket_ids: string[];
  vigencia_inicio: Date;
  vigencia_fin: Date;
  usos_maximos?: number;
  usos_realizados: number;
  activo: boolean;
  /**
   * Regla interna de aplicación. No viaja al documento: solo decide a qué
   * tickets del evento aplica la promoción.
   */
  regla: { cada: number | null; desde: number; hasta: number | null };
};

/** Configuración del evento embebida. */
export type PlanConfiguracion = {
  plantilla_id?: string;
  branding?: { color_primario: string; color_secundario: string; logo_url: string };
  encuesta_post_evento?: {
    habilitada: boolean;
    preguntas: {
      id: string;
      tipo: "escala" | "abierta";
      texto: string;
      rango?: [number, number];
    }[];
  };
  hibrido?: { habilitado: boolean; url_streaming?: string };
};

/** Evento del plan: contenido, reparto y contadores. */
export type PlanEvento = {
  indice: number;
  id: string;
  nombre: string;
  slug: string;
  descripcion: string;
  tipo_evento: (typeof TIPO_EVENTO)[number];
  estado: (typeof ESTADO_EVENTO)[number];
  visibilidad: (typeof VISIBILIDAD_EVENTO)[number];
  fecha_inicio: Date;
  fecha_fin: Date;
  organizador_id: string;
  lugar_id: string;
  categorias: string[];
  tags: string[];
  configuracion: PlanConfiguracion;
  tipos: PlanTipo[];
  promociones: PlanPromocion[];
  /** Límites acumulados de tickets por tipo: el tipo `i` cubre `[anterior, limite)`. */
  limitesTipo: number[];
  /** Tickets que le tocan a este evento. */
  tickets: number;
  /** Asistentes del evento (usuarios que compraron en él). */
  asistentes: number;
  /** Primer usuario (índice global de usuario) del rango de asistentes. */
  primerUsuario: number;
  /** Primer ticket (índice global) del bloque del evento. */
  primerTicket: number;
  /** Tickets vendidos (emitidos o usados) del evento. */
  ticketsVendidos: number;
  /** Ingresos confirmados (transacciones aprobadas) del evento. */
  ingresos_cop: number;
};

/** Plan completo del dataset. */
export type Plan = {
  semilla: number;
  volumenes: Volumenes;
  lugares: PlanLugar[];
  eventos: PlanEvento[];
  /** Los primeros `nOrganizadores` usuarios organizan eventos. */
  nOrganizadores: number;
  /** Tickets comprados por usuario (índice global de usuario). */
  ticketsPorUsuario: number[];
  /** Ingresos por usuario (índice global de usuario). */
  ingresosPorUsuario: number[];
};

/** Decisión de venta de un ticket: la misma en el plan y en la emisión. */
export type DecisionTicket = {
  local: number;
  global: number;
  usuario: number;
  tipo: number;
  promocion: PlanPromocion | null;
  precio_base: number;
  precio_pagado: number;
  monto: number;
  estado_transaccion: (typeof ESTADO_TRANSACCION)[number];
  estado_ticket: (typeof ESTADO_TICKET)[number];
  emitido_en: Date;
  validado_en: Date | null;
  validado_por_puerta: string | null;
  revalidaciones: { fecha: Date; puerta: string; resultado: "aceptado" | "rechazado" }[];
};

/** Opciones de construcción del plan. */
export type OpcionesPlan = {
  semilla: number;
  volumenes: Volumenes;
};

const NOMBRES = [
  "Ana",
  "Luis",
  "María",
  "Carlos",
  "Sofía",
  "Andrés",
  "Valentina",
  "Diego",
  "Camila",
  "Julián",
  "Mariana",
  "Sebastián",
  "Laura",
  "Mateo",
  "Daniela",
  "Alejandro",
  "Isabella",
  "Juan",
  "Fernanda",
  "Nicolás",
  "Paula",
  "Samuel",
  "Carolina",
  "Felipe",
];

const APELLIDOS = [
  "Ríos",
  "Mendoza",
  "Salazar",
  "Cárdenas",
  "Villalba",
  "Ospina",
  "Bedoya",
  "Giraldo",
  "Pineda",
  "Quintero",
  "Zapata",
  "Arango",
  "Hoyos",
  "Valencia",
  "Betancur",
  "Correa",
  "Escobar",
  "Franco",
  "Gil",
  "Henao",
];

const TITULOS_EVENTO = [
  "Concierto de rock",
  "Festival de jazz",
  "Partido de fútbol",
  "Obra de teatro",
  "Conferencia de tecnología",
  "Taller de cocina",
  "Maratón de cine",
  "Feria del libro",
  "Encuentro de networking",
  "Torneo de esports",
  "Exposición de arte",
  "Concierto de salsa",
];

const CATEGORIAS = [
  "conciertos",
  "deportes",
  "teatro",
  "familia",
  "cultura",
  "tecnologia",
  "gastronomia",
  "entretenimiento",
];

const ETIQUETAS = [
  "en-vivo",
  "preventa",
  "familiar",
  "joven",
  "exclusivo",
  "temporada",
  "destacado",
  "streaming",
];

const CIUDAD_BASE = { nombre: "Bogotá", longitud: -74.072, latitud: 4.711 };

const CIUDADES = [
  CIUDAD_BASE,
  { nombre: "Medellín", longitud: -75.5636, latitud: 6.2442 },
  { nombre: "Cali", longitud: -76.5228, latitud: 3.4516 },
  { nombre: "Barranquilla", longitud: -74.7815, latitud: 10.9685 },
  { nombre: "Bucaramanga", longitud: -73.1227, latitud: 7.1193 },
  { nombre: "Pereira", longitud: -75.6906, latitud: 4.8144 },
  { nombre: "Cartagena", longitud: -74.208, latitud: 10.391 },
  { nombre: "Manizales", longitud: -75.5236, latitud: 5.1489 },
];

/** Ciudad que corresponde a un índice (repite la lista si hace falta). */
function ciudadDe(indice: number): (typeof CIUDADES)[number] {
  return CIUDADES[indice % CIUDADES.length] ?? CIUDAD_BASE;
}

const NOMBRES_LUGAR = [
  "Coliseo Andes",
  "Teatro Mayor",
  "Auditorio Norte",
  "Arena del Parque",
  "Centro de Convenciones",
  "Pabellón Central",
  "Arena Sur",
  "Espacio Cultural",
];

const TIPOS_SALA = ["principal", "vip", "tecnica", "taller", "estadio"];

const NOMBRES_TIPO: string[][] = [
  ["Campo", "Preferencial"],
  ["General", "Estándar", "VIP"],
  ["Campo", "Preferencial", "VIP", "Platea"],
];

const PRECIOS_BASE = [45_000, 90_000, 180_000, 250_000];

const PESOS_POR_CANTIDAD: Record<number, number[]> = {
  2: [0.65, 0.35],
  3: [0.55, 0.3, 0.15],
  4: [0.45, 0.28, 0.17, 0.1],
};

const FACTOR_POR_TIPO_EVENTO: Record<string, number> = {
  corporativo: 1.5,
  masivo: 0.8,
  hibrido: 1,
  academico: 0.6,
};

const COLORES = [
  ["#1B4F9C", "#F2A900"],
  ["#0F7B6C", "#F4D35E"],
  ["#7A1F3D", "#EF8354"],
  ["#2E4057", "#D9D9D9"],
  ["#4B3F2C", "#C9B037"],
  ["#5A189A", "#F8F0E3"],
];

const PUERTAS = ["A", "B", "C", "D", "E", "F", "G", "H", "P1", "P2"];

const PASARELAS = ["demo_pago", "demo_tarjeta", "demo_transferencia"];

const METODOS_PAGO = ["tarjeta_credito", "tarjeta_debito", "efectivo", "transferencia"];

/** Crea el plan completo del dataset. */
export function crearPlan(opciones: OpcionesPlan): Plan {
  const { semilla, volumenes } = opciones;

  const lugares = crearLugares(semilla, volumenes.lugares);
  const nOrganizadores = Math.max(5, Math.floor(volumenes.usuarios * 0.01));
  const eventos = crearEventos(semilla, volumenes, lugares, nOrganizadores);

  repartirTicketsYAsistentes(eventos, volumenes, nOrganizadores);

  const ticketsPorUsuario = new Array<number>(volumenes.usuarios).fill(0);
  const ingresosPorUsuario = new Array<number>(volumenes.usuarios).fill(0);

  acumularContadores(eventos, semilla, ticketsPorUsuario, ingresosPorUsuario);

  return {
    semilla,
    volumenes,
    lugares,
    eventos,
    nOrganizadores,
    ticketsPorUsuario,
    ingresosPorUsuario,
  };
}

/** Identificador estable de un usuario del plan. */
export function idUsuario(semilla: number, indice: number): string {
  return idDeterminista(semilla, "usuario", indice);
}

/** Identificador estable de un ticket del plan. */
export function idTicket(semilla: number, global: number): string {
  return idDeterminista(semilla, "ticket", global);
}

/** Identificador estable de una transacción del plan. */
export function idTransaccion(semilla: number, global: number): string {
  return idDeterminista(semilla, "transaccion", global);
}

function crearLugares(semilla: number, cantidad: number): PlanLugar[] {
  const generador = crearGenerador(semilla, "lugares");
  const lugares: PlanLugar[] = [];

  for (let indice = 0; indice < cantidad; indice += 1) {
    const ciudad = ciudadDe(indice);
    const base = NOMBRES_LUGAR[indice % NOMBRES_LUGAR.length] ?? "Espacio";
    const nombre = `${base} ${ciudad.nombre}`;
    const salas: PlanLugar["salas"] = [];

    for (let numero = 1; numero <= generador.entero(1, 4); numero += 1) {
      salas.push({
        nombre: `Sala ${String(numero).padStart(2, "0")}`,
        capacidad: generador.entero(50, 1_200),
        piso: numero,
        tipo: generador.elegir(TIPOS_SALA),
      });
    }

    const capacidadTotal = salas.reduce((total, sala) => total + sala.capacidad, 0);

    lugares.push({
      id: idDeterminista(semilla, "lugar", indice),
      nombre,
      direccion: `Calle ${generador.entero(1, 200)} # ${generador.entero(1, 99)} - ${generador.entero(1, 40)}`,
      ciudad: ciudad.nombre,
      pais: "CO",
      capacidad_total: capacidadTotal,
      geometria: {
        type: "Point",
        coordinates: [
          Number((ciudad.longitud + generador.decimal() * 0.2 - 0.1).toFixed(6)),
          Number((ciudad.latitud + generador.decimal() * 0.2 - 0.1).toFixed(6)),
        ],
      },
      salas,
      activo: generador.booleano(0.95),
      creado_en: new Date(Date.UTC(ANIO_DATOS - 1, 0, 1 + (indice % 300))),
    });
  }

  return lugares;
}

function crearEventos(
  semilla: number,
  volumenes: Volumenes,
  lugares: PlanLugar[],
  nOrganizadores: number,
): PlanEvento[] {
  const eventos: PlanEvento[] = [];

  for (let indice = 0; indice < volumenes.eventos; indice += 1) {
    const propio = crearGenerador(semilla, "evento", indice);

    const tipoEvento = propio.elegir(TIPO_EVENTO);
    const titulo = propio.elegir(TITULOS_EVENTO);
    const nombre = `${titulo} ${indice + 1}`;

    const diaDelAno = Math.floor(
      (indice + propio.decimal()) * (365 / Math.max(1, volumenes.eventos)),
    );
    const fechaInicio = new Date(
      Date.UTC(ANIO_DATOS, 0, 1 + diaDelAno, propio.entero(9, 20), propio.entero(0, 59)),
    );
    const fechaFin = sumarHoras(fechaInicio, propio.entero(2, 9));

    const lugar = propio.elegir(lugares);
    const tipos = crearTipos(semilla, propio, indice, tipoEvento, fechaInicio);
    const promociones = crearPromociones(propio, indice, fechaInicio, tipos);

    eventos.push({
      indice,
      id: idDeterminista(semilla, "evento", indice),
      nombre,
      slug: slugify(`${titulo} ${indice + 1}`),
      descripcion: `${titulo} en ${lugar.nombre}, ${lugar.ciudad}. Entradas sintéticas para el prototipo Eventix.`,
      tipo_evento: tipoEvento,
      estado: elegirEstadoEvento(propio, fechaInicio),
      visibilidad: propio.booleano(0.9) ? "publico" : "privado",
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      organizador_id: idUsuario(semilla, propio.entero(0, nOrganizadores - 1)),
      lugar_id: lugar.id,
      categorias: elegirVarios(propio, CATEGORIAS, propio.entero(1, 3)),
      tags: elegirVarios(propio, ETIQUETAS, propio.entero(0, 4)),
      configuracion: crearConfiguracion(propio, indice, tipoEvento),
      tipos,
      promociones,
      limitesTipo: [],
      tickets: 0,
      asistentes: 0,
      primerUsuario: 0,
      primerTicket: 0,
      ticketsVendidos: 0,
      ingresos_cop: 0,
    });
  }

  return eventos;
}

function elegirEstadoEvento(
  generador: Generador,
  fechaInicio: Date,
): (typeof ESTADO_EVENTO)[number] {
  const suerte = generador.decimal();

  if (suerte < 0.05) {
    return "borrador";
  }

  if (suerte < 0.09) {
    return "cancelado";
  }

  return fechaInicio > INSTANTE_DATOS ? "publicado" : "finalizado";
}

function crearTipos(
  semilla: number,
  generador: Generador,
  indiceEvento: number,
  tipoEvento: (typeof TIPO_EVENTO)[number],
  fechaInicio: Date,
): PlanTipo[] {
  const cantidad = generador.entero(2, 4);
  const nombres = NOMBRES_TIPO[cantidad - 2] ?? NOMBRES_TIPO[0] ?? [];
  const factor = FACTOR_POR_TIPO_EVENTO[tipoEvento] ?? 1;
  const tipos: PlanTipo[] = [];

  for (let indice = 0; indice < cantidad; indice += 1) {
    const nombre = nombres[indice] ?? `Tipo ${indice + 1}`;
    const precioBase = PRECIOS_BASE[indice] ?? PRECIOS_BASE[0] ?? 0;
    const precio = Math.round((precioBase * factor) / 1_000) * 1_000;

    // La ventana de venta arranca antes del evento y termina antes de él.
    const ventaInicio = sumarDias(fechaInicio, -generador.entero(60, 150));
    const ventaFin = sumarHoras(ventaInicio, generador.entero(24, 96));

    tipos.push({
      id: idDeterminista(semilla, "tipo", indiceEvento, indice),
      nombre,
      precio_cop: precio,
      aforo_total: 0,
      aforo_vendido: 0,
      restricciones: {
        edad_minima: generador.booleano(0.35) ? generador.elegir([18, 21]) : undefined,
        max_por_compra: generador.entero(4, 8),
        venta_inicio: ventaInicio,
        venta_fin: ventaFin,
      },
    });
  }

  return tipos;
}

function crearPromociones(
  generador: Generador,
  indiceEvento: number,
  fechaInicio: Date,
  tipos: PlanTipo[],
): PlanPromocion[] {
  const promociones: PlanPromocion[] = [];
  const cantidad = generador.entero(0, 2);

  for (let indice = 0; indice < cantidad; indice += 1) {
    const tipo = generador.elegir(TIPO_PROMOCION);
    const ids = tipos.filter(() => generador.booleano(0.6)).map((tipoTicket) => tipoTicket.id);

    if (ids.length === 0 && tipos[0]) {
      ids.push(tipos[0].id);
    }

    const valor = tipo === "2x1" ? 2 : generador.entero(10, 30);
    const vigenciaInicio = sumarDias(fechaInicio, -generador.entero(90, 150));
    const vigenciaFin = sumarDias(vigenciaInicio, generador.entero(20, 60));

    promociones.push({
      codigo: `PROMO-${indiceEvento + 1}-${tipo}-${indice + 1}`.toUpperCase(),
      tipo,
      valor,
      aplica_a_tipo_ticket_ids: ids,
      vigencia_inicio: vigenciaInicio,
      vigencia_fin: vigenciaFin,
      usos_maximos: 0,
      usos_realizados: 0,
      activo: true,
      regla: reglaDePromocion(tipo),
    });
  }

  return promociones;
}

/** Regla con la que una promoción decide a qué tickets aplica. */
function reglaDePromocion(tipo: (typeof TIPO_PROMOCION)[number]): PlanPromocion["regla"] {
  if (tipo === "porcentaje") {
    return { cada: 3, desde: 0, hasta: null };
  }

  if (tipo === "2x1") {
    return { cada: 2, desde: 1, hasta: null };
  }

  // `early_bird`: el cupo (cantidad de tickets) se fija cuando ya se sabe
  // cuántos tickets tiene el evento.
  return { cada: null, desde: 0, hasta: null };
}

function crearConfiguracion(
  generador: Generador,
  indice: number,
  tipoEvento: (typeof TIPO_EVENTO)[number],
): PlanConfiguracion {
  const colores = COLORES[indice % COLORES.length] ?? COLORES[0] ?? ["#1B4F9C", "#F2A900"];
  const configuracion: PlanConfiguracion = {
    plantilla_id: `plantilla-${(indice % 3) + 1}`,
    branding: {
      color_primario: colores[0] ?? "#1B4F9C",
      color_secundario: colores[1] ?? "#F2A900",
      logo_url: `https://cdn.eventix.test/branding/logo-${(indice % 12) + 1}.png`,
    },
  };

  if (tipoEvento === "hibrido") {
    configuracion.hibrido = {
      habilitado: true,
      url_streaming: `https://stream.eventix.test/evento-${indice + 1}`,
    };
  }

  if (generador.booleano(0.3)) {
    configuracion.encuesta_post_evento = {
      habilitada: true,
      preguntas: [
        {
          id: "p1",
          tipo: "escala",
          texto: "¿Cómo calificarías el evento?",
          rango: [1, 5],
        },
        {
          id: "p2",
          tipo: "abierta",
          texto: "¿Qué mejorarías?",
        },
      ],
    };
  }

  return configuracion;
}

function elegirVarios<T>(generador: Generador, valores: readonly T[], cantidad: number): T[] {
  const restantes = [...valores];
  const elegidos: T[] = [];

  for (let indice = 0; indice < cantidad && restantes.length > 0; indice += 1) {
    const posicion = generador.entero(0, restantes.length - 1);
    const [elegido] = restantes.splice(posicion, 1);

    if (elegido !== undefined) {
      elegidos.push(elegido);
    }
  }

  return elegidos;
}

/**
 * Reparte los tickets entre los eventos y los asistentes entre los usuarios.
 *
 * Cada usuario asiste a **un solo evento** y compra 2 o 3 tickets en él: los
 * rangos de asistentes son disjuntos y el reparto es proporcional al peso de
 * cada evento. Así `usuarios.estadisticas.eventos_asistidos` y
 * `tickets_comprados` describen exactamente lo que el dataset contiene.
 */
function repartirTicketsYAsistentes(
  eventos: PlanEvento[],
  volumenes: Volumenes,
  nOrganizadores: number,
): void {
  const totalTickets = volumenes.tickets;
  const totalEventos = Math.max(1, eventos.length);
  const disponibles = Math.max(0, volumenes.usuarios - nOrganizadores);

  const base = Math.floor(totalTickets / totalEventos);
  const resto = totalTickets % totalEventos;

  let ticketsAcumulados = 0;
  let asistentesAcumulados = 0;

  for (const [indice, evento] of eventos.entries()) {
    const tickets = base + (indice < resto ? 1 : 0);

    evento.tickets = tickets;
    evento.primerTicket = ticketsAcumulados;
    ticketsAcumulados += tickets;

    const asistentes =
      tickets > 0 ? Math.max(1, Math.floor((disponibles * tickets) / totalTickets)) : 0;

    evento.asistentes = asistentes;
    evento.primerUsuario = nOrganizadores + asistentesAcumulados;
    asistentesAcumulados += asistentes;

    evento.limitesTipo = limitesPorPeso(tickets, pesosDe(evento));

    for (const [posicion, tipo] of evento.tipos.entries()) {
      const vendidos = ventaDe(evento, posicion);
      const factor = 1.5 + ((evento.indice + posicion) % 5) * 0.5;

      tipo.aforo_total = Math.max(50, Math.ceil((vendidos * factor) / 50) * 50);
    }

    // El cupo del `early_bird` se fija aquí: depende de cuántos tickets tiene
    // el evento, que ya está repartido.
    for (const promocion of evento.promociones) {
      if (promocion.tipo === "early_bird") {
        promocion.regla.hasta = Math.max(1, Math.floor(evento.tickets * 0.2));
      }
    }
  }
}

function pesosDe(evento: PlanEvento): number[] {
  return PESOS_POR_CANTIDAD[evento.tipos.length] ?? PESOS_POR_CANTIDAD[2] ?? [1];
}

/** Límites acumulados de los tickets por tipo. */
function limitesPorPeso(tickets: number, pesos: number[]): number[] {
  const limites: number[] = [];
  let acumulado = 0;

  for (const [indice, peso] of pesos.entries()) {
    acumulado =
      indice === pesos.length - 1
        ? tickets
        : Math.min(tickets, acumulado + Math.round(tickets * peso));
    limites.push(acumulado);
  }

  return limites;
}

/** Tickets que se venden del tipo indicado. */
function ventaDe(evento: PlanEvento, posicion: number): number {
  const limite = evento.limitesTipo[posicion] ?? 0;
  const anterior = posicion === 0 ? 0 : (evento.limitesTipo[posicion - 1] ?? 0);

  return Math.max(0, limite - anterior);
}

/** Acumula los contadores que el sistema es dueño y las estadísticas del usuario. */
function acumularContadores(
  eventos: PlanEvento[],
  semilla: number,
  ticketsPorUsuario: number[],
  ingresosPorUsuario: number[],
): void {
  for (const evento of eventos) {
    const generador = crearGenerador(semilla, "tickets", evento.indice);

    for (let local = 0; local < evento.tickets; local += 1) {
      const decision = decidirTicket(generador, evento, local);
      const tipo = evento.tipos[decision.tipo];

      if (decision.promocion) {
        decision.promocion.usos_realizados += 1;
      }

      if (decision.estado_ticket !== "anulado") {
        if (tipo) {
          tipo.aforo_vendido += 1;
        }

        evento.ticketsVendidos += 1;
        ticketsPorUsuario[decision.usuario] = (ticketsPorUsuario[decision.usuario] ?? 0) + 1;
        ingresosPorUsuario[decision.usuario] =
          (ingresosPorUsuario[decision.usuario] ?? 0) + decision.precio_pagado;
      }

      if (decision.estado_transaccion === "aprobada") {
        evento.ingresos_cop += decision.monto;
      }
    }

    for (const promocion of evento.promociones) {
      if (!promocion.activo) {
        promocion.usos_maximos = 0;
        continue;
      }

      const margen = (evento.indice + promocion.codigo.length) % 51;
      promocion.usos_maximos = promocion.usos_realizados + margen;
    }
  }
}

/**
 * Decide la venta de un ticket.
 *
 * La decisión se toma **siempre igual** (mismo generador, mismo orden), porque
 * el plan la usa para contar y la emisión la usa para escribir: si divergieran,
 * los contadores del evento no cuadrarían con los tickets.
 */
export function decidirTicket(
  generador: Generador,
  evento: PlanEvento,
  local: number,
): DecisionTicket {
  const tipo = asignarTipo(evento.limitesTipo, local);
  const usuario =
    evento.asistentes > 0 && evento.tickets > 0
      ? evento.primerUsuario + Math.floor((local * evento.asistentes) / evento.tickets)
      : evento.primerUsuario;
  const promocion = asignarPromocion(evento, local);
  const tipoPlan = evento.tipos[tipo];
  const precioBase = tipoPlan?.precio_cop ?? 0;
  const precioConDescuento = precioConPromocion(precioBase, promocion);

  const estadoTransaccion = elegirEstadoTransaccion(generador);
  const cobrada =
    estadoTransaccion === "aprobada" ||
    estadoTransaccion === "pendiente" ||
    estadoTransaccion === "reembolsada";

  const monto = cobrada ? precioConDescuento : 0;
  const precioPagado = cobrada ? precioConDescuento : 0;

  let estadoTicket: (typeof ESTADO_TICKET)[number];
  if (!cobrada) {
    estadoTicket = "anulado";
  } else if (estadoTransaccion === "pendiente") {
    estadoTicket = "emitido";
  } else {
    estadoTicket = generador.decimal() < 0.62 ? "usado" : "emitido";
  }

  const ventaInicio = tipoPlan?.restricciones.venta_inicio ?? sumarDias(evento.fecha_inicio, -90);
  const ventaFin = tipoPlan?.restricciones.venta_fin ?? sumarDias(evento.fecha_inicio, -1);
  const emitidoEn = fechaEnRango(generador, ventaInicio, ventaFin);

  let validadoEn: Date | null = null;
  let validadoPorPuerta: string | null = null;
  const revalidaciones: DecisionTicket["revalidaciones"] = [];

  if (estadoTicket === "usado") {
    validadoEn = fechaEnRango(generador, evento.fecha_inicio, evento.fecha_fin);
    validadoPorPuerta = generador.elegir(PUERTAS);
    revalidaciones.push({
      fecha: validadoEn,
      puerta: validadoPorPuerta,
      resultado: "aceptado",
    });

    if (generador.booleano(0.15)) {
      revalidaciones.push({
        fecha: sumarHoras(validadoEn, 2),
        puerta: validadoPorPuerta,
        resultado: "rechazado",
      });
    }
  }

  return {
    local,
    global: evento.primerTicket + local,
    usuario,
    tipo,
    promocion,
    precio_base: precioBase,
    precio_pagado: precioPagado,
    monto,
    estado_transaccion: estadoTransaccion,
    estado_ticket: estadoTicket,
    emitido_en: emitidoEn,
    validado_en: validadoEn,
    validado_por_puerta: validadoPorPuerta,
    revalidaciones,
  };
}

function asignarTipo(limites: number[], local: number): number {
  for (const [indice, limite] of limites.entries()) {
    if (local < limite) {
      return indice;
    }
  }

  return Math.max(0, limites.length - 1);
}

/** Primera promoción (en orden de precedencia) que aplica al ticket. */
function asignarPromocion(evento: PlanEvento, local: number): PlanPromocion | null {
  for (const promocion of evento.promociones) {
    if (!promocion.activo) {
      continue;
    }

    const { cada, desde, hasta } = promocion.regla;

    if (hasta !== null && local < hasta) {
      return promocion;
    }

    if (cada !== null && local >= desde && (local - desde) % cada === 0) {
      return promocion;
    }
  }

  return null;
}

/** Precio del ticket después de aplicar la promotions. */
function precioConPromocion(precioBase: number, promocion: PlanPromocion | null): number {
  if (!promocion) {
    return precioBase;
  }

  if (promocion.tipo === "2x1") {
    return 0;
  }

  return Math.round((precioBase * (100 - promocion.valor)) / 100);
}

function elegirEstadoTransaccion(generador: Generador): (typeof ESTADO_TRANSACCION)[number] {
  const suerte = generador.decimal();

  if (suerte < 0.93) {
    return "aprobada";
  }

  if (suerte < 0.95) {
    return "pendiente";
  }

  if (suerte < 0.975) {
    return "rechazada";
  }

  if (suerte < 0.99) {
    return "anulada";
  }

  return "reembolsada";
}

/** Datos del usuario que el generador necesita para escribir su documento. */
export type DatosUsuario = {
  indice: number;
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  documento_identidad: string;
  fecha_nacimiento: Date;
  es_organizador: boolean;
};

/** Construye los datos personales de un usuario (sintéticos, R-07). */
export function datosUsuario(
  semilla: number,
  indice: number,
  nOrganizadores: number,
): DatosUsuario {
  const generador = crearGenerador(semilla, "usuario", indice);
  const nombre = `${generador.elegir(NOMBRES)} ${generador.elegir(APELLIDOS)}`;
  const numero = String(indice + 1).padStart(6, "0");

  return {
    indice,
    id: idUsuario(semilla, indice),
    nombre,
    email: `usuario${numero}@eventix.test`,
    telefono: `+5730${String(indice % 100_000_000).padStart(8, "0")}`,
    documento_identidad: `SYN-${String(indice + 1).padStart(9, "0")}`,
    fecha_nacimiento: new Date(
      Date.UTC(1985 + generador.entero(0, 20), generador.entero(0, 11), generador.entero(1, 28)),
    ),
    es_organizador: indice < nOrganizadores,
  };
}

/** Datos de una transacción tal como los decide el plan. */
export function datosTransaccion(
  semilla: number,
  decision: DecisionTicket,
): { pasarela: string; metodo_pago: string; referencia_pasarela: string } {
  const generador = crearGenerador(semilla, "transaccion", decision.global);

  return {
    pasarela: generador.elegir(PASARELAS),
    metodo_pago: generador.elegir(METODOS_PAGO),
    referencia_pasarela: `REF-${String(decision.global).padStart(9, "0")}`,
  };
}
