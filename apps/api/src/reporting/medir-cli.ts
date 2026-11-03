import type { AddressInfo } from "node:net";
import type { Logger } from "pino";
import { createApp } from "../app.js";
import { config } from "../config.js";
import { connectMongo } from "../db/mongo.js";
import { crearRepositorios } from "../db/repos/index.js";
import { ESCALAS, type Escala } from "../seed/volumenes.js";
import { medirConsulta, type Medicion } from "./medir.js";

/**
 * Medición de la latencia del reporting (`pnpm perf:reporting`).
 *
 * Mide las cuatro consultas de `/api/reportes` **por HTTP**, contra el
 * dataset que haya sembrado, y falla si alguna no cumple el umbral (2 s por
 * defecto, el criterio del documento 01 §7.1).
 *
 * La medición es de extremo a extremo a propósito: el criterio dice "responden
 * en menos de 2 s", y lo que el operador espera es la respuesta HTTP completa,
 * no el trabajo interno de la agregación.
 */

const AYUDA = `Uso: pnpm perf:reporting [opciones]

  --iteraciones=<n>   Iteraciones medidas por consulta (por defecto: 20)
  --calentamiento=<n> Iteraciones de calentamiento (por defecto: 3)
  --umbral-ms=<n>     Umbral que debe cumplir cada consulta (por defecto: 2000)

La medición se hace contra la base configurada (MONGODB_DB=${config.MONGODB_DB}).`;

/** Iteraciones medidas por consulta. */
const ITERACIONES_POR_DEFECTO = 20;

/** Iteraciones de calentamiento (no se miden). */
const CALENTAMIENTO_POR_DEFECTO = 3;

/** Umbral del criterio de aceptación, en milisegundos. */
const UMBRAL_POR_DEFECTO = 2_000;

type Argumentos = {
  iteraciones: number;
  calentamiento: number;
  umbralMs: number;
  ayuda: boolean;
};

/** Lee los argumentos de la linea de comandos. */
function leerArgumentos(argumentos: string[]): Argumentos {
  const resultado: Argumentos = {
    iteraciones: ITERACIONES_POR_DEFECTO,
    calentamiento: CALENTAMIENTO_POR_DEFECTO,
    umbralMs: UMBRAL_POR_DEFECTO,
    ayuda: false,
  };

  for (const argumento of argumentos) {
    if (argumento === "-h" || argumento === "--help") {
      resultado.ayuda = true;
    } else if (argumento.startsWith("--iteraciones=")) {
      resultado.iteraciones = Number(argumento.slice("--iteraciones=".length));
    } else if (argumento.startsWith("--calentamiento=")) {
      resultado.calentamiento = Number(argumento.slice("--calentamiento=".length));
    } else if (argumento.startsWith("--umbral-ms=")) {
      resultado.umbralMs = Number(argumento.slice("--umbral-ms=".length));
    } else {
      throw new Error(`Opción desconocida: ${argumento}`);
    }
  }

  if (!Number.isInteger(resultado.iteraciones) || resultado.iteraciones < 1) {
    throw new Error("--iteraciones debe ser un entero positivo");
  }

  if (!Number.isInteger(resultado.calentamiento) || resultado.calentamiento < 0) {
    throw new Error("--calentamiento debe ser un entero no negativo");
  }

  if (!Number.isFinite(resultado.umbralMs) || resultado.umbralMs <= 0) {
    throw new Error("--umbral-ms debe ser un número positivo");
  }

  return resultado;
}

/** Formatea una tabla de texto plano con las columnas alineadas. */
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

/** Cuenta los documentos de las colecciones que el reporting consulta. */
async function contarDataset(
  db: Awaited<ReturnType<typeof connectMongo>>["db"],
): Promise<Record<string, number>> {
  const conteos: Record<string, number> = {};

  for (const coleccion of ["eventos", "tickets", "transacciones", "usuarios"]) {
    conteos[coleccion] = await db.collection(coleccion).countDocuments({});
  }

  return conteos;
}

/** Reconoce la escala del dataset sembrado comparando con los volúmenes declarados. */
function escalaDelDataset(conteos: Record<string, number>): Escala | "desconocida" {
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

async function main(): Promise<void> {
  const argumentos = leerArgumentos(process.argv.slice(2));

  if (argumentos.ayuda) {
    console.log(AYUDA);
    return;
  }

  const { client, db } = await connectMongo();

  try {
    const conteos = await contarDataset(db);
    const escala = escalaDelDataset(conteos);

    console.log("");
    console.log(`Medición de reporting · base ${config.MONGODB_DB} · escala ${escala}`);
    console.log(
      `dataset: ${conteos.eventos} eventos · ${conteos.tickets} tickets · ${conteos.transacciones} transacciones · ${conteos.usuarios} usuarios`,
    );

    if (escala !== "full") {
      console.log("");
      console.log(
        `AVISO: el dataset sembrado es de escala '${escala}', no 'full'. La evidencia del criterio de 2 s exige la escala 'full'.`,
      );
    }

    const repos = crearRepositorios(db);

    // El evento con más ventas: es el que tiene occupancy y asistentes que
    // medir, no uno vacío.
    const [evento] = await repos.eventos.masVendidos(1);

    if (!evento) {
      throw new Error("No hay eventos en la base: siembra el dataset antes de medir");
    }

    const app = createApp({
      checkMongo: async () => true,
      version: config.NODE_ENV,
      startedAt: Date.now(),
      repos,
      cliente: client,
      logger: { info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger,
    });

    const servidor = app.listen(0);
    const puerto = (servidor.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${puerto}/api`;

    const consultas = [
      { nombre: "Dashboard live", ruta: `/reportes/eventos/${evento._id}/dashboard` },
      { nombre: "Cierre contable", ruta: "/reportes/cierre-contable" },
      { nombre: "Ranking de vendidos", ruta: "/reportes/mas-vendidos?limite=10" },
      { nombre: "Exportación de asistentes", ruta: `/reportes/asistentes/${evento._id}?limit=50` },
    ];

    const mediciones: Medicion[] = [];

    for (const consulta of consultas) {
      const medicion = await medirConsulta(consulta.nombre, consulta.ruta, {
        base,
        iteraciones: argumentos.iteraciones,
        calentamiento: argumentos.calentamiento,
      });

      mediciones.push(medicion);
      console.log(`  ${consulta.nombre}: p95 ${medicion.p95_ms} ms`);
    }

    await new Promise<void>((resolver) => servidor.close(() => resolver()));

    console.log("");
    console.log(
      tabla(
        ["consulta", "iteraciones", "min ms", "p50 ms", "p95 ms", "max ms", "veredicto"],
        mediciones.map((medicion) => [
          medicion.nombre,
          String(medicion.iteraciones),
          String(medicion.min_ms),
          String(medicion.p50_ms),
          String(medicion.p95_ms),
          String(medicion.max_ms),
          medicion.p95_ms <= argumentos.umbralMs ? "dentro" : "FUERA",
        ]),
      ),
    );
    console.log("");

    const fuera = mediciones.filter((medicion) => medicion.p95_ms > argumentos.umbralMs);

    if (fuera.length > 0) {
      console.error(
        `${fuera.length} consulta(s) superaron el umbral de ${argumentos.umbralMs} ms: ${fuera.map((m) => m.nombre).join(", ")}`,
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      `Las ${mediciones.length} consultas cumplen el umbral de ${argumentos.umbralMs} ms.`,
    );
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
