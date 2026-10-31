import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { connectMongo } from "../db/mongo.js";
import { crearRepositorios } from "../db/repos/index.js";
import { arrancarServidorDeMedicion } from "./servidor.js";
import {
  MATRIZ_CRUD,
  formatearTabla,
  leerArgumentos,
  medirCrud,
  operacionesNoAplicables,
  resumenDeCarga,
  veredicto,
} from "./crud.js";
import { compararConteos, contarColecciones, escalaDelDataset, tabla } from "./dataset.js";

/**
 * Medición del p95 del CRUD (`pnpm test:perf`).
 *
 * Mide **por HTTP** las operaciones CRUD de las seis colecciones contra el
 * dataset que haya sembrado, y falla si alguna no cumple el umbral (200 ms
 * por defecto, el criterio de NFR-01 del documento 01 §4.2).
 *
 * La corrida **no puede dejar sucio el dataset sembrado**: todas las
 * escrituras van sobre documentos temporales que ella misma crea, y al
 * terminar comprueba que los conteos de las seis colecciones son los mismos
 * que antes. Si no lo son, la corrida falla.
 */

const AYUDA = `Uso: pnpm test:perf [opciones]

  --iteraciones=<n>   Iteraciones medidas por operación (por defecto: 20)
  --calentamiento=<n> Iteraciones de calentamiento (por defecto: 3)
  --umbral-ms=<n>     Umbral que debe cumplir cada operación (por defecto: 200)
  --ayuda              Muestra esta ayuda

La medición se hace contra la base configurada (MONGODB_DB=${config.MONGODB_DB}).
La corrida crea documentos temporales y los borra al terminar: el dataset
sembrado tiene que quedar con los mismos conteos que antes.`;

/**
 * Corre la medición completa.
 *
 * El código de salida decide el veredicto: `1` si alguna operación quedó
 * fuera del umbral o si el dataset sembrado no quedó intacto. Nunca da un
 * falso verde.
 */
async function main(): Promise<void> {
  const argumentos = leerArgumentos(process.argv.slice(2));

  if (argumentos.ayuda) {
    console.log(AYUDA);
    return;
  }

  const { client, db } = await connectMongo();

  try {
    const conteosAntes = await contarColecciones(db);
    const escala = escalaDelDataset(conteosAntes);

    console.log("");
    console.log(`Medición de CRUD · base ${config.MONGODB_DB} · escala ${escala}`);
    console.log(
      `dataset: ${conteosAntes.eventos} eventos · ${conteosAntes.usuarios} usuarios · ${conteosAntes.lugares} lugares · ${conteosAntes.tickets} tickets · ${conteosAntes.transacciones} transacciones · ${conteosAntes.auditoria_eventos} auditorías`,
    );

    if (escala !== "full") {
      console.log("");
      console.log(
        `AVISO: el dataset sembrado es de escala '${escala}', no 'full'. La evidencia del criterio de 200 ms exige la escala 'full'.`,
      );
    }

    const repos = crearRepositorios(db);
    const servidor = await arrancarServidorDeMedicion(repos, client);

    let resultado;

    try {
      resultado = await medirCrud({
        base: servidor.base,
        iteraciones: argumentos.iteraciones,
        calentamiento: argumentos.calentamiento,
        repos,
        db,
        correccion: randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase(),
      });
    } finally {
      await servidor.cerrar();
    }

    const conteosDespues = await contarColecciones(db);
    const comparacion = compararConteos(conteosAntes, conteosDespues);

    console.log("");
    console.log(`Medición NFR-01 (umbral ${argumentos.umbralMs} ms)`);
    console.log(formatearTabla(resultado.mediciones, argumentos.umbralMs));

    console.log("");
    console.log(imprimirNoAplicables());

    console.log("");
    console.log(
      "Diagnóstico (fuera del criterio NFR-01): listado sin filtro de la colección completa",
    );
    console.log(formatearTabla(resultado.diagnostico, argumentos.umbralMs));

    const resumen = resumenDeCarga(resultado.mediciones, argumentos.umbralMs);
    const resumenDiagnostico = resumenDeCarga(resultado.diagnostico, argumentos.umbralMs);

    console.log("");
    console.log(
      `${resumen.dentro} de ${resumen.total} operaciones CRUD quedan dentro del umbral de ${argumentos.umbralMs} ms.`,
    );
    console.log(
      `${resumenDiagnostico.dentro} de ${resumenDiagnostico.total} listados sin filtro quedan dentro del umbral de ${argumentos.umbralMs} ms.`,
    );

    console.log("");
    console.log("Conteos del dataset (antes → después)");
    console.log(formatearConteos(conteosAntes, conteosDespues));
    console.log(
      `Documentos temporales creados por la corrida: ${resultado.temporales} (borrados al terminar).`,
    );

    const errores: string[] = [];

    if (resumen.fuera > 0) {
      const fuera = resultado.mediciones.filter(
        (medicion) => veredicto(medicion, argumentos.umbralMs) === "FUERA",
      );

      errores.push(
        `${fuera.length} operación(es) superaron el umbral de ${argumentos.umbralMs} ms: ${fuera
          .map(
            (medicion) =>
              `${medicion.coleccion} · ${medicion.operacion} (p95 ${medicion.p95_ms} ms)`,
          )
          .join(", ")}`,
      );
    }

    if (!comparacion.iguales) {
      errores.push(
        `el dataset sembrado no quedó intacto: ${comparacion.diferencias
          .map(
            (diferencia) => `${diferencia.coleccion} ${diferencia.antes} → ${diferencia.despues}`,
          )
          .join(", ")}`,
      );
    }

    if (errores.length > 0) {
      for (const error of errores) {
        console.error(`FALLA: ${error}`);
      }

      process.exitCode = 1;
      return;
    }

    console.log("");
    console.log(
      `Las ${resumen.total} operaciones CRUD cumplen el umbral de ${argumentos.umbralMs} ms y el dataset sembrado quedó intacto.`,
    );
  } finally {
    await client.close();
  }
}

/** Imprime las operaciones que no aplican por contrato. */
function imprimirNoAplicables(): string {
  const lineas: string[] = [];

  for (const coleccion of MATRIZ_CRUD) {
    for (const noAplicable of operacionesNoAplicables(coleccion.nombre)) {
      lineas.push(`${coleccion.nombre} · ${noAplicable.operacion} · ${noAplicable.motivo}`);
    }
  }

  if (lineas.length === 0) {
    return "No hay operaciones que no apliquen por contrato.";
  }

  return ["Operaciones que no aplican por contrato:", ...lineas].join("\n");
}

/** Formatea la comparación de conteos (antes y después de la corrida). */
function formatearConteos(antes: Record<string, number>, despues: Record<string, number>): string {
  const encabezados = ["colección", "antes", "después"];
  const filas = Object.keys(antes).map((coleccion) => [
    coleccion,
    String(antes[coleccion] ?? 0),
    String(despues[coleccion] ?? 0),
  ]);

  return tabla(encabezados, filas);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
