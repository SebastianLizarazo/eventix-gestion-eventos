/**
 * Volúmenes del seed y escala de generación.
 *
 * Los **volúmenes declarados** salen del documento 01 §1.2 (el caso simulado
 * del año 2023) y del documento 02 §5 (estimación de cardinalidad):
 *
 * - ~180.000 usuarios registrados
 * - ~340 eventos gestionados por año
 * - ~520.000 tickets emitidos
 * - ~520.000 transacciones
 *
 * La **escala `full`** reproduce esos volúmenes; la **escala `dev`** es el 1 %,
 * que se siembra en segundos y sirve para desarrollo y pruebas. El 1 % conserva
 * las proporciones del dataset completo, así que un bug de reparto no se
 * esconde en la escala pequeña.
 */

/** Escala de generación disponible en la CLI. */
export type Escala = "dev" | "full";

/** Número de documentos que genera cada escala. */
export type Volumenes = {
  lugares: number;
  usuarios: number;
  eventos: number;
  tickets: number;
  transacciones: number;
};

/**
 * Volúmenes declarados en el documento 01 §1.2 y el documento 02 §5.
 *
 * `lugares` no tiene volumen declarado en esos documentos: el seed elige uno y
 * lo deja explícito con `null` en vez de inventar un número "oficial".
 */
export type VolumenesDeclarados = {
  lugares: number | null;
  usuarios: number;
  eventos: number;
  tickets: number;
  transacciones: number;
};

/** Volúmenes declarados por los documentos del proyecto. */
export const VOLUMENES_DECLARADOS: VolumenesDeclarados = {
  lugares: null,
  usuarios: 180_000,
  eventos: 340,
  tickets: 520_000,
  transacciones: 520_000,
};

/** Volúmenes de cada escala. */
export const ESCALAS: Record<Escala, Volumenes> = {
  dev: { lugares: 12, usuarios: 1_800, eventos: 34, tickets: 5_200, transacciones: 5_200 },
  full: {
    lugares: 120,
    usuarios: 180_000,
    eventos: 340,
    tickets: 520_000,
    transacciones: 520_000,
  },
};

/** Escalas aceptadas por la CLI. */
export const ESCALAS_DISPONIBLES = Object.keys(ESCALAS) as Escala[];

/** Semilla por defecto: fija, documentada y derivada del año del caso. */
export const SEMILLA_POR_DEFECTO = 20230101;

/** Año del caso simulado (documento 01 §1.2). */
export const ANIO_DATOS = 2023;

/**
 * Instante que representa el "ahora" del dataset.
 *
 * El seed no usa la hora del reloj: el dataset es una foto de mitad de 2023, así
 * que hay eventos finalizados y eventos por venir, y el estado de cada evento
 * (`finalizado`, `publicado`) es coherente con esa foto.
 */
export const INSTANTE_DATOS = new Date("2023-07-01T00:00:00.000Z");

/** Devuelve los volúmenes de una escala. */
export function volumenesDe(escala: Escala): Volumenes {
  const volumenes = ESCALAS[escala];

  if (!volumenes) {
    throw new Error(`Escala desconocida: ${escala}`);
  }

  return volumenes;
}
