import { logger } from "../logger.js";
import { connectMongo } from "../db/mongo.js";
import {
  COLECCIONES_SEMBRADAS,
  contarExistentes,
  sembrar,
  type OpcionesSemilla,
  type ReporteSemilla,
} from "./sembrar.js";
import { ESCALAS_DISPONIBLES, SEMILLA_POR_DEFECTO, type Escala } from "./volumenes.js";

/**
 * CLI del seed: `pnpm seed --scale=dev|full`.
 *
 * Es la herramienta que deja la base con datos sintéticos para trabajar y para
 * medir. Imprime los conteos comparados contra los volúmenes declarados en el
 * documento 01 y el checksum del dataset, que es la evidencia de que la
 * siembra es reproducible.
 *
 * Por defecto **no pisa** una base que ya tiene datos: hay que pedirlo con
 * `--reset`, porque sembrar encima de una base sembrada rompe los índices
 * unique.
 */

const AYUDA = `Uso: pnpm seed [opciones]

  --scale=dev|full   Escala del dataset (por defecto: dev)
  --seed=<entero>    Semilla del generador (por defecto: ${SEMILLA_POR_DEFECTO})
  --batch=<entero>   Documentos por inserción (por defecto: 1000)
  --reset            Vacía las colecciones antes de sembrar
  -h, --help         Muestra esta ayuda

Las escalas disponibles son: ${ESCALAS_DISPONIBLES.join(", ")}.`;

type Argumentos = OpcionesSemilla & { ayuda: boolean };

/** Lee los argumentos de la linea de comandos. */
function leerArgumentos(argumentos: string[]): Argumentos {
  let escala: Escala = "dev";
  let semilla = SEMILLA_POR_DEFECTO;
  let batch = 1_000;
  let reset = false;
  let ayuda = false;

  for (const argumento of argumentos) {
    if (argumento === "--reset") {
      reset = true;
      continue;
    }

    if (argumento === "-h" || argumento === "--help") {
      ayuda = true;
      continue;
    }

    const separador = argumento.indexOf("=");
    const nombre = separador === -1 ? argumento : argumento.slice(0, separador);
    const valor = separador === -1 ? undefined : argumento.slice(separador + 1);

    const siguiente = (): string => {
      if (valor !== undefined) {
        return valor;
      }

      const posicion = argumentos.indexOf(argumento);
      const encontrado = posicion === -1 ? undefined : argumentos[posicion + 1];

      if (encontrado === undefined) {
        throw new Error(`Falta el valor de ${nombre}`);
      }

      return encontrado;
    };

    if (nombre === "--scale") {
      escala = siguiente() as Escala;

      if (!ESCALAS_DISPONIBLES.includes(escala)) {
        throw new Error(
          `Escala desconocida: ${escala}. Las disponibles son: ${ESCALAS_DISPONIBLES.join(", ")}`,
        );
      }

      continue;
    }

    if (nombre === "--seed") {
      semilla = Number.parseInt(siguiente(), 10);

      if (!Number.isInteger(semilla)) {
        throw new Error(`La semilla debe ser un entero: ${siguiente()}`);
      }

      continue;
    }

    if (nombre === "--batch") {
      batch = Number.parseInt(siguiente(), 10);

      if (!Number.isInteger(batch) || batch < 1) {
        throw new Error(`El tamaño de lote debe ser un entero positivo: ${siguiente()}`);
      }

      continue;
    }

    throw new Error(`Opción desconocida: ${argumento}`);
  }

  return { escala, semilla, batch, reset, ayuda };
}

/** Formatea un numero con separador de miles. */
function formatear(valor: number): string {
  return valor.toLocaleString("es-CO");
}

/** Arma una tabla de texto plano con las columnas alineadas. */
function tabla(encabezados: string[], filas: string[][]): string {
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

/** Imprime el reporte de la siembra. */
function imprimirReporte(reporte: ReporteSemilla): void {
  const filas = reporte.comparacion.map((fila) => [
    fila.coleccion,
    formatear(fila.generado),
    fila.declarado === null ? "-" : formatear(fila.declarado),
    fila.porcentaje === null ? "-" : `${fila.porcentaje.toLocaleString("es-CO")} %`,
    fila.estado,
  ]);

  console.log("");
  console.log(`Seed Eventix · escala ${reporte.escala} · semilla ${reporte.semilla}`);
  console.log("");
  console.log(tabla(["colección", "generados", "declarados", "% declarado", "estado"], filas));
  console.log("");
  console.log(`checksum global: ${reporte.checksum_global}`);
  console.log(`duración: ${(reporte.duracion_ms / 1000).toFixed(2)} s`);
  console.log("");
}

async function main(): Promise<void> {
  const argumentos = leerArgumentos(process.argv.slice(2));

  if (argumentos.ayuda) {
    console.log(AYUDA);
    return;
  }

  const { client, db } = await connectMongo();

  try {
    const existentes = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map(
        (coleccion) => coleccion.name,
      ),
    );
    const faltantes = COLECCIONES_SEMBRADAS.filter((coleccion) => !existentes.has(coleccion));

    if (faltantes.length > 0) {
      throw new Error(
        `Faltan las colecciones ${faltantes.join(", ")}. Ejecuta \`pnpm db:setup\` primero.`,
      );
    }

    if (!argumentos.reset) {
      const existentes_ = await contarExistentes(db);

      if (existentes_ > 0) {
        throw new Error(
          `La base ya tiene ${formatear(existentes_)} documentos. Usa \`--reset\` para reemplazarlos.`,
        );
      }
    }

    const reporte = await sembrar(db, argumentos);

    imprimirReporte(reporte);
    logger.info(
      { escala: reporte.escala, semilla: reporte.semilla, checksum: reporte.checksum_global },
      "Seed completado",
    );
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "No se pudo sembrar el dataset");
  console.log("");
  console.log((error as Error).message);
  console.log("");
  console.log(AYUDA);
  process.exitCode = 1;
});
