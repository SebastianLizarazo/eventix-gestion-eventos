import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { connectMongo } from "../db/mongo.js";
import { crearRepositorios } from "../db/repos/index.js";
import { escalaDelDataset, tabla } from "./dataset.js";
import { MOTIVO_A_FORO_AGOTADO, cargar, leerArgumentos } from "./carga.js";
import { arrancarServidorDeMedicion } from "./servidor.js";

/**
 * Prueba de carga de compras (`pnpm test:carga`).
 *
 * Lanza **cien compradores simultáneos** contra un evento con **aforo
 * cincuenta**, por HTTP, y verifica el criterio de NFR-05 (documento 01 §4):
 * *el inventario de tickets debe ser consistentemente consistente: no se puede
 * vender el mismo asiento dos veces*.
 *
 * La corrida **no puede dejar sucio el dataset sembrado**: crea un evento, sus
 * compradores y las compras, y los borra al terminar. Al final comprueba que
 * los conteos de las seis colecciones son los mismos que antes. Si no lo son,
 * o si hubo una sobreventa, la corrida **falla con código de salida 1**: el
 * dataset `full` es la evidencia de los demás hitos y no se puede dejar sucio
 * ni dar un falso verde.
 */

const AYUDA = `Uso: pnpm test:carga [opciones]

  --compradores=<n>   Compradores simultáneos de la ráfaga (por defecto: 100)
  --aforo=<n>         Aforo del tipo de ticket (por defecto: 50)
  --precio=<n>        Precio del ticket en COP (por defecto: 100000)
  --ayuda              Muestra esta ayuda

La carga se hace por HTTP contra la base configurada (MONGODB_DB=${config.MONGODB_DB}).
La corrida crea un evento, sus compradores y las compras, y los borra al
terminar: el dataset sembrado tiene que quedar con los mismos conteos que
antes. Si queda sucio o hay una sobreventa, la corrida falla con código 1.`;

/**
 * Corre la carga completa.
 *
 * El código de salida decide el veredicto: `1` si hubo una sobreventa, si
 * algún rechazo no dijo `aforo_agotado`, si quedó algo huérfano, si los
 * contadores no cuadran o si el dataset sembrado no quedó intacto.
 */
async function main(): Promise<void> {
  const argumentos = leerArgumentos(process.argv.slice(2));

  if (argumentos.ayuda) {
    console.log(AYUDA);
    return;
  }

  const { client, db } = await connectMongo();

  try {
    const repos = crearRepositorios(db);
    const servidor = await arrancarServidorDeMedicion(repos, client);

    let resultado;

    try {
      resultado = await cargar({
        base: servidor.base,
        db,
        repos,
        compradores: argumentos.compradores,
        aforo: argumentos.aforo,
        precio: argumentos.precio,
        correccion: correccionDeCorrida(),
      });
    } finally {
      await servidor.cerrar();
    }

    const escala = escalaDelDataset(resultado.conteos_antes);

    console.log("");
    console.log(
      `Prueba de carga de compras (NFR-05) · base ${config.MONGODB_DB} · escala ${escala}`,
    );
    console.log(
      `dataset: ${resultado.conteos_antes.eventos ?? 0} eventos · ${resultado.conteos_antes.usuarios ?? 0} usuarios · ${resultado.conteos_antes.lugares ?? 0} lugares · ${resultado.conteos_antes.tickets ?? 0} tickets · ${resultado.conteos_antes.transacciones ?? 0} transacciones · ${resultado.conteos_antes.auditoria_eventos ?? 0} auditorías`,
    );
    console.log("");
    console.log(
      `Corrida ${resultado.correccion} · ${resultado.compradores} compradores simultáneos contra un aforo de ${resultado.aforo}`,
    );

    console.log("");
    console.log("Resultado de la ráfaga");
    console.log(
      tabla(
        ["medida", "valor"],
        [
          ["compras creadas (201)", String(resultado.exitosas)],
          ["compras rechazadas", String(resultado.rechazadas)],
          ["motivos del rechazo", describirMotivos(resultado.motivos)],
        ],
      ),
    );

    console.log("");
    console.log("Inventario (nada huérfano)");
    console.log(
      tabla(
        ["medida", "valor"],
        [
          ["tickets creados", String(resultado.tickets)],
          ["transacciones creadas", String(resultado.transacciones)],
          ["tickets sin su transacción", String(resultado.tickets_sin_transaccion)],
          ["transacciones sin su ticket", String(resultado.transacciones_sin_ticket)],
        ],
      ),
    );

    console.log("");
    console.log("Contadores del evento");
    console.log(
      tabla(
        ["medida", "valor"],
        [
          ["aforo vendido", `${resultado.aforo_vendido} / ${resultado.aforo}`],
          ["tickets vendidos (métricas)", String(resultado.tickets_vendidos_total)],
          ["ingresos (COP)", String(resultado.ingresos_cop)],
        ],
      ),
    );

    console.log("");
    console.log("Medición de la ráfaga");
    console.log(
      tabla(
        ["medida", "valor"],
        [
          ["peticiones", String(resultado.medicion.iteraciones)],
          ["duración total (ms)", String(resultado.medicion.duracion_ms)],
          ["throughput (ops/s)", String(resultado.medicion.throughput_ops_s)],
          ["latencia mínima (ms)", String(resultado.medicion.min_ms)],
          ["latencia p50 (ms)", String(resultado.medicion.p50_ms)],
          ["latencia p95 (ms)", String(resultado.medicion.p95_ms)],
          ["latencia máxima (ms)", String(resultado.medicion.max_ms)],
        ],
      ),
    );

    console.log("");
    console.log("Conteos del dataset (antes → después)");
    console.log(formatearConteos(resultado.conteos_antes, resultado.conteos_despues));

    if (resultado.errores.length > 0) {
      console.log("");

      for (const error of resultado.errores) {
        console.error(`FALLA: ${error}`);
      }

      process.exitCode = 1;
      return;
    }

    console.log("");
    console.log(
      `La carga no sobrevende: ${resultado.exitosas} compras creadas, ${resultado.rechazadas} rechazadas con "${MOTIVO_A_FORO_AGOTADO}", nada huérfano y el dataset sembrado quedó intacto.`,
    );
  } finally {
    await client.close();
  }
}

/**
 * Identificador de la corrida.
 *
 * Es lo que hace únicos los correos, el nombre del evento y las referencias de
 * pasarela: dos corridas seguidas no pueden chocar con un índice único.
 */
function correccionDeCorrida(): string {
  return randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** Describe el reparto de motivos de rechazo en una línea. */
function describirMotivos(motivos: Record<string, number>): string {
  const partes = Object.entries(motivos).map(([motivo, cantidad]) => `${motivo} (${cantidad})`);

  return partes.length === 0 ? "sin rechazos" : partes.join(", ");
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
