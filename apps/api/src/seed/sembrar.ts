import type { Collection, Db, Document } from "mongodb";
import {
  eventoABson,
  lugarABson,
  ticketABson,
  transaccionABson,
  usuarioABson,
} from "../db/mapeo.js";
import { Checksum } from "./checksum.js";
import { generarEventos, generarLugares, generarUsuarios } from "./generadores.js";
import { crearPlan } from "./plan.js";
import { generarTickets, generarTransacciones } from "./ventas.js";
import { ESCALAS, VOLUMENES_DECLARADOS, type Escala } from "./volumenes.js";

/**
 * Siembra del dataset en MongoDB.
 *
 * El seed escribe **por el driver**, no por los repositorios: los repositorios
 * validan documento por documento contra el dominio y el seed necesita sembrar
 * millones de documentos. La validación del dominio no se pierde: los
 * generadores validan **antes** de devolver el documento, y el mapper es el
 * mismo que usan los repositorios (`src/db/mapeo.ts`), así que lo que llega a
 * la base es BSON con las referencias como `objectId`.
 *
 * Los documentos se insertan por lotes: el seed completo son más de un millón
 * de documentos y un `insertOne` por documento no escala.
 */

/** Colecciones que siembra el script (el rastro de auditoría no se siembra). */
export const COLECCIONES_SEMBRADAS = [
  "lugares",
  "usuarios",
  "eventos",
  "tickets",
  "transacciones",
] as const;

/** Nombre de una colección sembrada. */
export type ColeccionSembrada = (typeof COLECCIONES_SEMBRADAS)[number];

/** Opciones de la siembra. */
export type OpcionesSemilla = {
  /** Escala del dataset (`dev` o `full`). */
  escala: Escala;
  /** Semilla del generador. */
  semilla: number;
  /** Vacía las colecciones antes de sembrar. */
  reset?: boolean;
  /** Documentos por inserción. */
  batch?: number;
};

/** Comparación de una colección contra el volumen declarado. */
export type ComparacionVolumen = {
  coleccion: ColeccionSembrada;
  generado: number;
  declarado: number | null;
  porcentaje: number | null;
  estado: "completo" | "parcial" | "sin-declarar";
};

/** Resultado de la siembra. */
export type ReporteSemilla = {
  escala: Escala;
  semilla: number;
  conteos: Record<ColeccionSembrada, number>;
  checksums: Record<ColeccionSembrada, string>;
  /** Checksum del dataset completo (combina los de cada colección). */
  checksum_global: string;
  comparacion: ComparacionVolumen[];
  duracion_ms: number;
};

/**
 * Siembra el dataset en la base y devuelve el reporte.
 *
 * @param db base de destino (con los validadores y los índices de `pnpm db:setup`).
 * @param opciones escala, semilla y comportamento del reset.
 */
export async function sembrar(db: Db, opciones: OpcionesSemilla): Promise<ReporteSemilla> {
  const inicio = Date.now();
  const volumenes = ESCALAS[opciones.escala];

  if (!volumenes) {
    throw new Error(`Escala desconocida: ${opciones.escala}`);
  }

  const batch = Math.max(1, opciones.batch ?? 1_000);
  const plan = crearPlan({ semilla: opciones.semilla, volumenes });

  if (opciones.reset) {
    await vaciar(db);
  }

  const lugares = await insertar(db.collection("lugares"), generarLugares(plan), lugarABson, batch);
  const usuarios = await insertar(
    db.collection("usuarios"),
    generarUsuarios(plan),
    usuarioABson,
    batch,
  );
  const eventos = await insertar(
    db.collection("eventos"),
    generarEventos(plan),
    eventoABson,
    batch,
  );
  const tickets = await insertar(
    db.collection("tickets"),
    generarTickets(plan),
    ticketABson,
    batch,
  );
  const transacciones = await insertar(
    db.collection("transacciones"),
    generarTransacciones(plan),
    transaccionABson,
    batch,
  );

  const conteos = {
    lugares: lugares.total,
    usuarios: usuarios.total,
    eventos: eventos.total,
    tickets: tickets.total,
    transacciones: transacciones.total,
  };

  const checksums = {
    lugares: lugares.checksum,
    usuarios: usuarios.checksum,
    eventos: eventos.checksum,
    tickets: tickets.checksum,
    transacciones: transacciones.checksum,
  };

  return {
    escala: opciones.escala,
    semilla: opciones.semilla,
    conteos,
    checksums,
    checksum_global: checksumGlobal(checksums),
    comparacion: compararConDeclarados(conteos),
    duracion_ms: Date.now() - inicio,
  };
}

/**
 * Compara los conteos de una siembra contra los volúmenes declarados en el
 * documento 01 §1.2 y el documento 02 §5.
 */
export function compararConDeclarados(
  conteos: Record<ColeccionSembrada, number>,
): ComparacionVolumen[] {
  return COLECCIONES_SEMBRADAS.map((coleccion) => {
    const generado = conteos[coleccion];
    const declarado = VOLUMENES_DECLARADOS[coleccion] ?? null;

    if (declarado === null) {
      return { coleccion, generado, declarado: null, porcentaje: null, estado: "sin-declarar" };
    }

    const porcentaje = Math.round((generado / declarado) * 10_000) / 100;

    return {
      coleccion,
      generado,
      declarado,
      porcentaje,
      estado: generado === declarado ? "completo" : "parcial",
    };
  });
}

/** Vacía las colecciones que siembra el script (no toca validadores ni índices). */
export async function vaciar(db: Db): Promise<void> {
  for (const coleccion of COLECCIONES_SEMBRADAS) {
    await db.collection(coleccion).deleteMany({});
  }
}

/** Cuenta los documentos que ya hay en las colecciones que siembra el script. */
export async function contarExistentes(db: Db): Promise<number> {
  let total = 0;

  for (const coleccion of COLECCIONES_SEMBRADAS) {
    total += await db.collection(coleccion).countDocuments({});
  }

  return total;
}

/** Inserta los documentos por lotes y calcula el checksum del dataset escrito. */
async function insertar<TDominio extends { _id?: string }>(
  coleccion: Collection<Document>,
  documentos: Iterable<TDominio & { _id: string }>,
  aBson: (documento: TDominio & { _id: string }) => Document,
  batch: number,
): Promise<{ total: number; checksum: string }> {
  const checksum = new Checksum();
  let total = 0;
  let lote: Document[] = [];

  for (const documento of documentos) {
    checksum.agregar(documento);
    lote.push(aBson(documento));
    total += 1;

    if (lote.length >= batch) {
      await coleccion.insertMany(lote);
      lote = [];
    }
  }

  if (lote.length > 0) {
    await coleccion.insertMany(lote);
  }

  return { total, checksum: checksum.finalizar() };
}

/** Checksum del dataset completo: la combinación de los checksums por colección. */
function checksumGlobal(checksums: Record<ColeccionSembrada, string>): string {
  const global = new Checksum();

  for (const coleccion of COLECCIONES_SEMBRADAS) {
    global.agregar({ coleccion, checksum: checksums[coleccion] });
  }

  return global.finalizar();
}
