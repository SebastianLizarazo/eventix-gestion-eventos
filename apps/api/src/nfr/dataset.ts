import type { Db } from "mongodb";
import { ESCALAS, type Escala } from "../seed/volumenes.js";

/**
 * Utilidades compartidas por las tres mediciones del hito 8.
 *
 * Las tres corridas (p95 de CRUD, flexibilidad de esquema y carga de compras)
 * miden contra **la misma base sembrada** y tienen que responder las mismas
 * tres preguntas: qué escala tiene el dataset, cuántos documentos tiene cada
 * colección y si la corrida los dejó como estaban. Esa pregunta compartida
 * vive aquí, y no en el módulo de una de las unidades: el conteo de documentos
 * no tiene nada que ver con medir un CRUD.
 */

/** Colecciones que las mediciones cuentan y comparan. */
export const COLECCIONES_MEDIDAS = [
  "eventos",
  "usuarios",
  "lugares",
  "tickets",
  "transacciones",
  "auditoria_eventos",
] as const;

/** Comparación entre los conteos de antes y después de la corrida. */
export type ComparacionConteos = {
  /** `true` cuando las seis colecciones tienen los mismos documentos. */
  iguales: boolean;
  /** Colecciones cuyo conteo cambió. */
  diferencias: { coleccion: string; antes: number; despues: number }[];
};

/**
 * Compara los conteos de antes y después de la corrida.
 *
 * Si no coinciden, el dataset sembrado no se puede dejar sucio: la corrida
 * tiene que fallar (código de salida 1) en vez de dar por buena una medición
 * que alteró la evidencia de los demás hitos.
 */
export function compararConteos(
  antes: Record<string, number>,
  despues: Record<string, number>,
): ComparacionConteos {
  const diferencias = COLECCIONES_MEDIDAS.filter((coleccion) => {
    const previo = antes[coleccion];

    return previo !== undefined && previo !== despues[coleccion];
  }).map((coleccion) => ({
    coleccion,
    antes: antes[coleccion] ?? 0,
    despues: despues[coleccion] ?? 0,
  }));

  return { iguales: diferencias.length === 0, diferencias };
}

/** Cuenta los documentos de las seis colecciones medidas. */
export async function contarColecciones(db: Db): Promise<Record<string, number>> {
  const conteos: Record<string, number> = {};

  for (const coleccion of COLECCIONES_MEDIDAS) {
    conteos[coleccion] = await db.collection(coleccion).countDocuments({});
  }

  return conteos;
}

/** Reconoce la escala del dataset sembrado comparando con los volúmenes declarados. */
export function escalaDelDataset(conteos: Record<string, number>): Escala | "desconocida" {
  for (const [escala, volumenes] of Object.entries(ESCALAS)) {
    if (
      conteos.eventos === volumenes.eventos &&
      conteos.tickets === volumenes.tickets &&
      conteos.transacciones === volumenes.transacciones
    ) {
      return escala as Escala;
    }
  }

  return "desconocida";
}

/** Formatea una tabla de texto plano con las columnas alineadas. */
export function tabla(encabezados: string[], filas: string[][]): string {
  const anchos = encabezados.map((encabezado, indice) =>
    Math.max(encabezado.length, ...filas.map((fila) => (fila[indice] ?? "").length)),
  );

  const linea = (celdas: string[]): string =>
    celdas
      .map((celda, indice) => celda.padEnd(anchos[indice] ?? 0))
      .join("  ")
      .trimEnd();

  return [
    linea(encabezados),
    linea(anchos.map((ancho) => "-".repeat(ancho))),
    ...filas.map(linea),
  ].join("\n");
}
