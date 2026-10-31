import { config } from "../config.js";
import { connectMongo } from "../db/mongo.js";
import { crearRepositorios } from "../db/repos/index.js";
import { arrancarServidorDeMedicion } from "./servidor.js";
import { escalaDelDataset } from "./dataset.js";
import {
  BLOQUE_ACADEMICO,
  demostrarEsquema,
  leerArgumentos,
  type ResultadoEsquema,
} from "./esquema.js";

/**
 * Demostración del NFR-04 (`pnpm test:esquema`).
 *
 * Muestra, **con números**, que añadir un campo por tipo de evento no exige
 * migración ni downtime: el campo se escribe sobre un solo documento, el
 * almacén lo acepta sin que su validador conozca la forma nueva, la API sigue
 * sirviendo durante el cambio y el dataset sembrado queda exactamente como
 * estaba.
 *
 * La corrida **no puede dejar sucio el dataset sembrado**: restaura en un
 * `finally` el documento que tocó y, al terminar, compara su forma canónica y
 * los conteos de las seis colecciones con los que había antes. Si no lo
 * consigue, termina con código de salida 1.
 */

const AYUDA = `Uso: pnpm test:esquema [opciones]

  --intervalo-ms=<n>  Milisegundos entre peticiones del bucle de tráfico (por defecto: 5)
  --ayuda             Muestra esta ayuda

La demostración corre contra la base configurada (MONGODB_DB=${config.MONGODB_DB}).
Modifica un solo documento (un evento de tipo 'academico') y lo restaura al
terminar: el dataset sembrado tiene que quedar con los mismos conteos y con
el documento exactamente como estaba.`;

/**
 * Corre la demostración completa.
 *
 * El código de salida decide el veredicto: `1` si algún número no cuadra o si
 * el dataset no quedó intacto. Nunca da un falso verde.
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

    let resultado: ResultadoEsquema;

    try {
      resultado = await demostrarEsquema({
        base: servidor.base,
        db,
        intervaloTraficoMs: argumentos.intervaloTraficoMs,
      });
    } finally {
      await servidor.cerrar();
    }

    imprimir(resultado);

    if (!resultado.cumple) {
      for (const error of resultado.errores) {
        console.error(`FALLA: ${error}`);
      }

      process.exitCode = 1;
      return;
    }

    console.log("");
    console.log(
      "El NFR-04 se sostiene: el campo nuevo se añadió sin migración y sin downtime, y el dataset quedó intacto.",
    );
  } finally {
    await client.close();
  }
}

/** Imprime el informe de la corrida, con un número por evidencia. */
function imprimir(resultado: ResultadoEsquema): void {
  const conteos = Object.entries(resultado.conteosAntes);

  console.log("");
  console.log(`Demostración del NFR-04 · base ${config.MONGODB_DB}`);
  console.log(
    `dataset: ${conteos.map(([coleccion, conteo]) => `${conteo} ${coleccion}`).join(" · ")}`,
  );
  console.log(`escala declarada del dataset: ${escalaDelDataset(resultado.conteosAntes)}`);
  console.log("");

  console.log("1 · Sin migración");
  console.log(`   evento modificado: ${resultado.evento.nombre} (${resultado.evento.id})`);
  console.log(`   tipo de evento: ${resultado.evento.tipo_evento}`);
  console.log(
    `   evento temporal (lo creó la corrida): ${resultado.evento.temporal ? "sí" : "no"}`,
  );
  console.log(
    `   comandos de escritura emitidos: ${resultado.escrituraDirecta.comandos} (un updateOne sobre un _id)`,
  );
  console.log(
    `   escritura aceptada por el servidor: acknowledged=${resultado.escrituraDirecta.acknowledged}, matched=${resultado.escrituraDirecta.matchedCount}, modified=${resultado.escrituraDirecta.modifiedCount}`,
  );
  console.log(
    `   documentos de \`eventos\`: ${resultado.documentosEventosAntes} → ${resultado.documentosEventosDespues}`,
  );
  console.log(
    `   documentos con \`configuracion_evento.academico\`: ${resultado.documentosConBloqueAntes} → ${resultado.documentosConBloqueDespues}`,
  );
  console.log(
    `   el validador vivo del servidor declaraba el bloque: ${resultado.validadorDeclarabaElBloque ? "sí" : "no"}`,
  );
  console.log(
    `   el validador del servidor quedó igual: ${resultado.validadorSinCambios ? "sí" : "no"}`,
  );
  console.log("");

  console.log("2 · El almacén acepta el campo nuevo sin tocar el validador");
  console.log(
    `   escritura directa con el driver: ${resultado.escrituraDirecta.modifiedCount === 1 ? "aceptada" : "RECHAZADA"}`,
  );
  console.log("   el bloque escrito: " + `${JSON.stringify(BLOQUE_ACADEMICO)}`);
  console.log("");

  console.log("3 · Sin downtime");
  console.log(
    `   peticiones lanzadas: ${resultado.trafico.enviadas} · respuestas recibidas: ${resultado.trafico.peticiones} (${resultado.trafico.exitosas} 2xx, ${resultado.trafico.fallos} no-2xx)`,
  );
  console.log(
    `   peticiones lanzadas dentro de la ventana del cambio: ${resultado.peticionesDuranteElCambio}`,
  );
  console.log(
    `   respuestas por estado: ${Object.entries(resultado.trafico.estados)
      .map(([codigo, total]) => `${codigo}×${total}`)
      .join(", ")}`,
  );
  console.log("");

  console.log("4 · La API expone el campo nuevo");
  console.log(`   GET /api/eventos/{id}: ${resultado.lecturaApi.status}`);
  console.log(`   bloque en la respuesta: ${JSON.stringify(resultado.lecturaApi.bloque)}`);
  console.log("");

  console.log("5 · Coexistencia de dos formas en la misma colección");
  console.log(
    `   evento de otro tipo: ${resultado.eventoOtroTipo.nombre} (${resultado.eventoOtroTipo.id}) · tipo ${resultado.eventoOtroTipo.tipo_evento}`,
  );
  console.log(`   GET /api/eventos/{id}: ${resultado.coexistencia.status}`);
  console.log(`   bloque en la respuesta: ${JSON.stringify(resultado.coexistencia.bloque)}`);
  console.log("");

  console.log("6 · La API escribe el campo nuevo");
  console.log(
    `   PATCH sobre el evento académico: ${resultado.patchAcademico.status} · bloque ${JSON.stringify(resultado.patchAcademico.bloque)}`,
  );
  console.log(
    `   PATCH sobre el evento de otro tipo: ${resultado.patchOtroTipo.status} · ${resultado.patchOtroTipo.codigo ?? "(sin código)"} · ${resultado.patchOtroTipo.mensaje}`,
  );
  console.log("");

  console.log("7 · El dataset quedó intacto");
  console.log(
    `   documento restaurado: ${resultado.documentoRestaurado ? "sí" : "no"} · forma canónica igual: ${resultado.formaCanonicaIgual ? "sí" : "no"}`,
  );
  console.log(
    `   documentos con el bloque nuevo al terminar: ${resultado.documentosConBloqueRestaurados}`,
  );
  console.log(
    `   conteos de las seis colecciones iguales: ${resultado.conteosIguales ? "sí" : "no"}`,
  );

  for (const [coleccion, conteo] of Object.entries(resultado.conteosDespues)) {
    const antes = resultado.conteosAntes[coleccion] ?? 0;

    console.log(`   ${coleccion}: ${antes} → ${conteo}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
