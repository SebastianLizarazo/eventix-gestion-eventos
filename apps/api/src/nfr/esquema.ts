import { ObjectId, type Collection, type Db, type Document } from "mongodb";
import { eventoABson } from "../db/mapeo.js";
import { prepararEvento } from "../domain/schemas/index.js";
import { canonizar } from "../seed/checksum.js";
import { compararConteos, contarColecciones } from "./dataset.js";

/**
 * Demostración del NFR-04: **adición de campos por tipo de evento sin
 * migración y sin downtime** (documento 01 §4).
 *
 * El requisito se demuestra con **números**, no con afirmaciones. La corrida
 * hace, en este orden:
 *
 * 1. **Sin migración** — el campo nuevo (`configuracion_evento.academico`) se
 *    escribe con **una sola** actualización de **un** `_id`, directo con el
 *    driver (sin API, sin dominio, sin script). Se comprueba que el conteo de
 *    documentos de la colección no cambia, que **exactamente un** documento
 *    lleva el bloque y que el `$jsonSchema` vivo del servidor es **el mismo**
 *    antes y después (es decir: no hubo `collMod`, ni reindexado, ni reescritura
 *    de la colección).
 * 2. **El almacén acepta el campo que su validador no declara** — el
 *    `$jsonSchema` de MongoDB no usa `additionalProperties: false`, así que el
 *    servidor guarda el campo sin que nadie le haya enseñado la forma nueva.
 * 3. **Sin downtime** — mientras se aplica el cambio, un bucle de tráfico
 *    continuo golpea `GET /api/eventos/{id}`. Todas las respuestas tienen que
 *    ser 2xx: **cero** respuestas que no lo son.
 * 4. **La API lo expone** — la lectura devuelve el bloque nuevo.
 * 5. **Coexistencia** — un evento de **otro** tipo se lee igual, sin el bloque:
 *    las dos formas conviven en la misma colección.
 * 6. **La API lo escribe** — el `PATCH` con el bloque nuevo responde 200 y el
 *    bloque persiste; el mismo `PATCH` sobre un evento de otro tipo lo rechaza
 *    (4xx) por la regla del dominio.
 * 7. **El dataset queda intacto** — el documento modificado vuelve a estar
 *    **exactamente** como estaba (se compara su forma canónica antes y después)
 *    y los conteos de las seis colecciones son los mismos. La restauración
 *    ocurre en un `finally`: si algo falla a mitad, el dataset se deja igual
 *    y la corrida falla.
 *
 * La lógica vive aparte del I/O: `demostrarEsquema` es la corrida completa y
 * las utilidades que la sostienen (conteos, comparación, argumentos) son
 * puras, así que el test puede afirmar sin que el resultado dependa del tiempo
 * que tarda la máquina.
 */

/** Bloque académico que la demostración escribe. */
export const BLOQUE_ACADEMICO = {
  creditos: 4,
  certificado_url: "https://certificados.eventix.test/nfr-04.pdf",
} as const;

/** Bloque de configuración académica (la forma que viaja por la API). */
export type BloqueAcademico = {
  /** Créditos académicos que otorga el evento. */
  creditos?: number;
  /** URL del certificado que se emite al asistente. */
  certificado_url?: string;
};

/** Milisegundos entre peticiones del bucle de tráfico, por defecto. */
export const INTERVALO_TRAFICO_POR_DEFECTO = 2;

/**
 * Peticiones que el bucle de tráfico tiene que hacer antes de que empiece el
 * cambio.
 *
 * Sin este piso, el cambio podría completarse antes de que el bucle sirva
 * siquiera una petición: el tráfico tiene que estar **corriendo** cuando se
 * escribe el campo nuevo, no después.
 */
export const MINIMO_SOLICITUDES_ANTES = 20;

/** Peticiones que el bucle de tráfico tiene que hacer después del cambio. */
export const MINIMO_SOLICITUDES_DESPUES = 10;

/** Tipo de evento del documento que se modifica. */
export const TIPO_ACADEMICO = "academico";

/** Tipo de evento del documento con el que se demuestra la coexistencia. */
export const TIPO_MASIVO = "masivo";

/** Identificadores usados por el evento temporal (cuando el dataset no trae). */
const ORGANIZADOR_TEMPORAL = "66a80000000000000000a001";
const LUGAR_TEMPORAL = "66b00000000000000000a002";

/** Opciones de una corrida de demostración. */
export type OpcionesEsquema = {
  /** Base HTTP de la API (con el prefijo `/api`). */
  base: string;
  /** Base de datos donde vive el dataset. */
  db: Db;
  /** Milisegundos entre peticiones del bucle de tráfico. */
  intervaloTraficoMs?: number;
};

/** Argumentos de la línea de comandos de la demostración. */
export type ArgumentosEsquema = {
  /** Milisegundos entre peticiones del bucle de tráfico. */
  intervaloTraficoMs: number;
  /** La corrida solo imprime la ayuda. */
  ayuda: boolean;
};

/** Evento usado en la demostración. */
export type EventoDemo = {
  /** Identificador del documento. */
  id: string;
  /** Nombre del evento. */
  nombre: string;
  /** Tipo de evento. */
  tipo_evento: string;
  /** El evento lo creó la corrida: el dataset no traía uno del tipo. */
  temporal: boolean;
};

/** Escritura directa con el driver: el número de comandos y su resultado. */
export type EscrituraDirecta = {
  /** Comandos de escritura emitidos (tiene que ser 1). */
  comandos: number;
  /** El servidor了一样 confirmó la escritura. */
  acknowledged: boolean;
  /** Documentos que casaron con el filtro. */
  matchedCount: number;
  /** Documentos que quedaron modificados. */
  modifiedCount: number;
};

/** Lectura de un evento por la API. */
export type Lectura = {
  /** Estado HTTP de la respuesta. */
  status: number;
  /** Bloque académico de la respuesta (`null` si no viene). */
  bloque: BloqueAcademico | null;
};

/** Resultado de un `PATCH` que el dominio tiene que rechazar. */
export type PatchRechazado = {
  /** Estado HTTP de la respuesta. */
  status: number;
  /** Código de error del contrato único de la API. */
  codigo: string | null;
  /** Mensaje del error. */
  mensaje: string;
};

/** Conteos del bucle de tráfico. */
export type EstadoTrafico = {
  /** Peticiones lanzadas. */
  enviadas: number;
  /** Respuestas recibidas. */
  peticiones: number;
  /** Respuestas 2xx. */
  exitosas: number;
  /** Respuestas que no fueron 2xx. */
  fallos: number;
  /** Respuestas por estado HTTP. */
  estados: Record<string, number>;
  /** Errores de red (una petición que ni siquiera llegó al servidor). */
  errores: string[];
};

/** Resultado completo de la demostración. */
export type ResultadoEsquema = {
  /** Evento modificado (el de tipo académico). */
  evento: EventoDemo;
  /** Evento de otro tipo (el que convive en la misma colección). */
  eventoOtroTipo: EventoDemo;
  /** Conteos de las seis colecciones antes de la corrida. */
  conteosAntes: Record<string, number>;
  /** Conteos de las seis colecciones al terminar. */
  conteosDespues: Record<string, number>;
  /** `true` cuando los conteos de las seis colecciones son los mismos. */
  conteosIguales: boolean;
  /** Documentos de `eventos` antes de la corrida. */
  documentosEventosAntes: number;
  /** Documentos de `eventos` al terminar. */
  documentosEventosDespues: number;
  /** Documentos que llevaban el bloque nuevo antes de la corrida. */
  documentosConBloqueAntes: number;
  /** Documentos que llevaban el bloque nuevo con el cambio aplicado. */
  documentosConBloqueDespues: number;
  /** Documentos que llevan el bloque nuevo al terminar (tiene que ser 0). */
  documentosConBloqueRestaurados: number;
  /** Cómo se escribió el campo nuevo. */
  escrituraDirecta: EscrituraDirecta;
  /** El validador vivo del servidor declaraba el bloque nuevo. */
  validadorDeclarabaElBloque: boolean;
  /** El validador vivo del servidor es el mismo antes y después. */
  validadorSinCambios: boolean;
  /** Conteos del bucle de tráfico. */
  trafico: EstadoTrafico;
  /** Peticiones lanzadas **dentro** de la ventana del cambio. */
  peticionesDuranteElCambio: number;
  /** Lectura por la API con el bloque ya escrito. */
  lecturaApi: Lectura;
  /** Lectura por la API del evento de otro tipo. */
  coexistencia: Lectura;
  /** `PATCH` con el bloque nuevo sobre el evento académico. */
  patchAcademico: Lectura;
  /** `PATCH` con el bloque nuevo sobre el evento de otro tipo. */
  patchOtroTipo: PatchRechazado;
  /** El documento volvió a existir y sin el bloque nuevo. */
  documentoRestaurado: boolean;
  /** La forma canónica del documento es la misma que antes de la corrida. */
  formaCanonicaIgual: boolean;
  /** Problemas encontrados (vacío cuando la demostración se sostiene). */
  errores: string[];
  /** `true` cuando no hay ningún problema: la demostración se sostiene. */
  cumple: boolean;
};

/**
 * Cuenta los documentos de `eventos` que llevan el bloque académico.
 *
 * La cuenta es la evidencia de "sin migración": si añadir el campo hubiera
 * reescrito la colección, el número de documentos con el bloque sería el
 * número de documentos de la colección.
 */
export async function contarDocumentosConBloque(db: Db): Promise<number> {
  return db
    .collection("eventos")
    .countDocuments({ "configuracion_evento.academico": { $exists: true } });
}

/** Lee los argumentos de la línea de comandos de la demostración. */
export function leerArgumentos(argumentos: readonly string[]): ArgumentosEsquema {
  const resultado: ArgumentosEsquema = {
    intervaloTraficoMs: INTERVALO_TRAFICO_POR_DEFECTO,
    ayuda: false,
  };

  for (const argumento of argumentos) {
    if (argumento === "--ayuda" || argumento === "-h" || argumento === "--help") {
      resultado.ayuda = true;
    } else if (argumento.startsWith("--intervalo-ms=")) {
      resultado.intervaloTraficoMs = Number(argumento.slice("--intervalo-ms=".length));
    } else {
      throw new Error(`Opción desconocida: ${argumento}`);
    }
  }

  if (!Number.isInteger(resultado.intervaloTraficoMs) || resultado.intervaloTraficoMs < 1) {
    throw new Error("--intervalo-ms debe ser un entero positivo");
  }

  return resultado;
}

/**
 * Corre la demostración completa del NFR-04.
 *
 * La corrida **no puede dejar sucio el dataset**: todo lo que toca lo
 * restaura en un `finally`, y al terminar compara la forma canónica del
 * documento modificado y los conteos de las seis colecciones con los que había
 * antes. Si algo no cuadra, los `errores` lo dicen y `cumple` es `false`.
 */
export async function demostrarEsquema(opciones: OpcionesEsquema): Promise<ResultadoEsquema> {
  const db = opciones.db;
  const coleccion = db.collection("eventos");
  const intervalo = opciones.intervaloTraficoMs ?? INTERVALO_TRAFICO_POR_DEFECTO;
  const errores: string[] = [];

  const conteosAntes = await contarColecciones(db);
  const documentosEventosAntes = await coleccion.countDocuments({});
  const documentosConBloqueAntes = await contarDocumentosConBloque(db);
  const validadorAntes = await leerValidador(db);

  const evento = await buscarEvento(coleccion, TIPO_ACADEMICO);
  const eventoOtroTipo = await buscarEventoDeOtroTipo(coleccion, evento.id);
  const temporales = [evento, eventoOtroTipo]
    .filter((item) => item.temporal)
    .map((item) => item.id);

  const original = await coleccion.findOne({ _id: new ObjectId(evento.id) });

  if (!original) {
    throw new Error(`No se pudo leer el evento ${evento.id} para la demostración`);
  }

  const canonicoAntes = canonizar(original);
  const trafico = await iniciarTrafico(opciones.base, evento.id, intervalo);

  let escrituraDirecta: EscrituraDirecta = {
    comandos: 0,
    acknowledged: false,
    matchedCount: 0,
    modifiedCount: 0,
  };
  let comandosEscritos = 0;
  let documentosConBloqueDespues = documentosConBloqueAntes;
  let lecturaApi: Lectura = { status: 0, bloque: null };
  let coexistencia: Lectura = { status: 0, bloque: null };
  let patchAcademico: Lectura = { status: 0, bloque: null };
  let patchOtroTipo: PatchRechazado = { status: 0, codigo: null, mensaje: "" };
  let documentoRestaurado = false;
  let formaCanonicaIgual = false;
  let peticionesDuranteElCambio = 0;

  try {
    // 0. El tráfico tiene que estar **corriendo** antes del cambio: sin este
    // piso, el cambio podría completarse antes de que el bucle sirva una
    // sola petición y la evidencia de "sin downtime" sería vacía.
    await esperarSolicitudes(trafico, MINIMO_SOLICITUDES_ANTES);

    const enviadasAntesDelCambio = trafico.estado.enviadas;

    // 1. La escritura: **una** actualización de **un** `_id`, con el driver.
    comandosEscritos += 1;

    const escrita = await coleccion.updateOne(
      { _id: new ObjectId(evento.id) },
      { $set: { "configuracion_evento.academico": { ...BLOQUE_ACADEMICO } } },
    );

    escrituraDirecta = {
      comandos: comandosEscritos,
      acknowledged: escrita.acknowledged,
      matchedCount: escrita.matchedCount,
      modifiedCount: escrita.modifiedCount,
    };

    documentosConBloqueDespues = await contarDocumentosConBloque(db);

    // 2. La API expone el bloque nuevo.
    lecturaApi = await leerEvento(opciones.base, evento.id);

    // 3. Coexistencia: el evento de otro tipo se lee igual, sin el bloque.
    coexistencia = await leerEvento(opciones.base, eventoOtroTipo.id);

    // 4. La API escribe el bloque nuevo.
    patchAcademico = await editarConBloque(opciones.base, evento.id);

    // 5. Y lo rechaza en un evento de otro tipo.
    patchOtroTipo = await editarConBloqueRechazado(opciones.base, eventoOtroTipo.id);

    peticionesDuranteElCambio = trafico.estado.enviadas - enviadasAntesDelCambio;

    // Y el tráfico sigue después del cambio: la API no se cayó al escribir.
    await esperarSolicitudes(trafico, trafico.estado.enviadas + MINIMO_SOLICITUDES_DESPUES);
  } finally {
    await trafico.detener();

    // El dataset vuelve a estar como estaba: se restaura el documento
    // entero (no solo el bloque), porque el `PATCH` de la API también mueve
    // `actualizado_en` y `_v`.
    await coleccion.replaceOne({ _id: new ObjectId(evento.id) }, original);

    const restaurado = await coleccion.findOne({ _id: new ObjectId(evento.id) });

    documentoRestaurado =
      restaurado !== null && !("academico" in ((restaurado.configuracion_evento ?? {}) as object));
    formaCanonicaIgual = restaurado !== null && canonizar(restaurado) === canonicoAntes;

    // Los eventos temporales que la corrida pudo crear también se borran: el
    // dataset tiene que quedar con los mismos conteos que antes.
    if (temporales.length > 0) {
      await coleccion.deleteMany({ _id: { $in: temporales.map((id) => new ObjectId(id)) } });
    }
  }

  const conteosDespues = await contarColecciones(db);
  const comparacion = compararConteos(conteosAntes, conteosDespues);
  const documentosEventosDespues = await coleccion.countDocuments({});
  const documentosConBloqueRestaurados = await contarDocumentosConBloque(db);
  const validadorDespues = await leerValidador(db);
  const validadorSinCambios = validadorAntes.forma === validadorDespues.forma;

  comprobar({
    errores,
    trafico: trafico.estado,
    peticionesDuranteElCambio,
    escrituraDirecta,
    documentosEventosAntes,
    documentosEventosDespues,
    documentosConBloqueAntes,
    documentosConBloqueDespues,
    documentosConBloqueRestaurados,
    lecturaApi,
    coexistencia,
    patchAcademico,
    patchOtroTipo,
    documentoRestaurado,
    formaCanonicaIgual,
    conteosIguales: comparacion.iguales,
    diferenciasConteos: comparacion.diferencias,
    validadorSinCambios,
  });

  return {
    evento,
    eventoOtroTipo,
    conteosAntes,
    conteosDespues,
    conteosIguales: comparacion.iguales,
    documentosEventosAntes,
    documentosEventosDespues,
    documentosConBloqueAntes,
    documentosConBloqueDespues,
    documentosConBloqueRestaurados,
    escrituraDirecta,
    validadorDeclarabaElBloque: validadorAntes.declarabaElBloque,
    validadorSinCambios,
    trafico: trafico.estado,
    peticionesDuranteElCambio,
    lecturaApi,
    coexistencia,
    patchAcademico,
    patchOtroTipo,
    documentoRestaurado,
    formaCanonicaIgual,
    errores,
    cumple: errores.length === 0,
  };
}

/** Datos que la comprobación final necesita para decidir si la corrida falla. */
type DatosComprobacion = {
  errores: string[];
  trafico: EstadoTrafico;
  peticionesDuranteElCambio: number;
  escrituraDirecta: EscrituraDirecta;
  documentosEventosAntes: number;
  documentosEventosDespues: number;
  documentosConBloqueAntes: number;
  documentosConBloqueDespues: number;
  documentosConBloqueRestaurados: number;
  lecturaApi: Lectura;
  coexistencia: Lectura;
  patchAcademico: Lectura;
  patchOtroTipo: PatchRechazado;
  documentoRestaurado: boolean;
  formaCanonicaIgual: boolean;
  conteosIguales: boolean;
  diferenciasConteos: { coleccion: string; antes: number; despues: number }[];
  validadorSinCambios: boolean;
};

/** Anota cada incumplimiento del criterio como un error de la corrida. */
function comprobar(datos: DatosComprobacion): void {
  if (datos.escrituraDirecta.comandos !== 1) {
    datos.errores.push(
      `la escritura del campo nuevo no fue una sola operación (comandos: ${datos.escrituraDirecta.comandos})`,
    );
  }

  if (!datos.escrituraDirecta.acknowledged || datos.escrituraDirecta.matchedCount !== 1) {
    datos.errores.push("el servidor no aceptó la escritura directa del campo nuevo");
  }

  if (datos.documentosEventosDespues !== datos.documentosEventosAntes) {
    datos.errores.push(
      `el conteo de documentos de \`eventos\` cambió (${datos.documentosEventosAntes} → ${datos.documentosEventosDespues})`,
    );
  }

  if (datos.documentosConBloqueDespues !== 1) {
    datos.errores.push(
      `el bloque nuevo no quedó en exactamente un documento (quedó en ${datos.documentosConBloqueDespues})`,
    );
  }

  if (datos.documentosConBloqueRestaurados !== 0) {
    datos.errores.push(
      `quedaron ${datos.documentosConBloqueRestaurados} documento(s) con el bloque nuevo después de restaurar`,
    );
  }

  if (!datos.validadorSinCambios) {
    datos.errores.push("el validador del servidor cambió durante la corrida (hubo migración)");
  }

  if (datos.trafico.fallos > 0) {
    datos.errores.push(
      `el tráfico en vivo tuvo ${datos.trafico.fallos} respuesta(s) que no fueron 2xx`,
    );
  }

  if (datos.trafico.peticiones === 0) {
    datos.errores.push("el bucle de tráfico no hizo ninguna petición");
  }

  if (datos.peticionesDuranteElCambio === 0) {
    datos.errores.push("no hubo tráfico mientras se aplicaba el cambio");
  }

  if (datos.lecturaApi.status !== 200 || datos.lecturaApi.bloque === null) {
    datos.errores.push("la API no expuso el bloque nuevo en la lectura del evento");
  }

  if (datos.coexistencia.status !== 200 || datos.coexistencia.bloque !== null) {
    datos.errores.push("el evento de otro tipo no se leyó igual, sin el bloque nuevo");
  }

  if (datos.patchAcademico.status !== 200 || datos.patchAcademico.bloque === null) {
    datos.errores.push("la API no aceptó el bloque nuevo en la edición del evento académico");
  }

  if (datos.patchOtroTipo.status < 400 || datos.patchOtroTipo.status >= 500) {
    datos.errores.push(
      `la API no rechazó el bloque nuevo en un evento de otro tipo (respondió ${datos.patchOtroTipo.status})`,
    );
  }

  if (!datos.documentoRestaurado) {
    datos.errores.push("el documento modificado no quedó restaurado");
  }

  if (!datos.formaCanonicaIgual) {
    datos.errores.push("el documento modificado no quedó exactamente como estaba");
  }

  if (!datos.conteosIguales) {
    datos.errores.push(
      `los conteos de las seis colecciones no quedaron iguales: ${datos.diferenciasConteos
        .map((diferencia) => `${diferencia.coleccion} ${diferencia.antes} → ${diferencia.despues}`)
        .join(", ")}`,
    );
  }
}

/** Busca un evento del tipo pedido; si no hay, crea uno temporal. */
async function buscarEvento(coleccion: Collection<Document>, tipo: string): Promise<EventoDemo> {
  const documento = await coleccion.findOne({ tipo_evento: tipo });

  if (documento) {
    return {
      id: documento._id.toHexString(),
      nombre: String(documento.nombre),
      tipo_evento: String(documento.tipo_evento),
      temporal: false,
    };
  }

  return crearTemporal(coleccion, tipo);
}

/** Busca un evento de **otro** tipo al que el bloque académico no aplique. */
async function buscarEventoDeOtroTipo(
  coleccion: Collection<Document>,
  excludeId: string,
): Promise<EventoDemo> {
  const documento = await coleccion.findOne({
    tipo_evento: TIPO_MASIVO,
    _id: { $ne: new ObjectId(excludeId) },
  });

  if (documento) {
    return {
      id: documento._id.toHexString(),
      nombre: String(documento.nombre),
      tipo_evento: String(documento.tipo_evento),
      temporal: false,
    };
  }

  const cualquiera = await coleccion.findOne({ _id: { $ne: new ObjectId(excludeId) } });

  if (cualquiera) {
    return {
      id: cualquiera._id.toHexString(),
      nombre: String(cualquiera.nombre),
      tipo_evento: String(cualquiera.tipo_evento),
      temporal: false,
    };
  }

  return crearTemporal(coleccion, TIPO_MASIVO);
}

/**
 * Crea un evento temporal para la demostración.
 *
 * Solo pasa cuando el dataset no trae ningún evento del tipo pedido: el
 * resultado lo dice (`temporal: true`) para que nadie confunda la
 * demostración sobre un evento real con la de un documento de mentira.
 */
async function crearTemporal(coleccion: Collection<Document>, tipo: string): Promise<EventoDemo> {
  const evento = prepararEvento({
    nombre: `Evento ${tipo} temporal del NFR-04`,
    descripcion: "Documento temporal de la demostración del NFR-04",
    tipo_evento: tipo,
    estado: "publicado",
    visibilidad: "publico",
    fecha_inicio: new Date("2026-06-01T14:00:00Z"),
    fecha_fin: new Date("2026-06-01T20:00:00Z"),
    organizador_id: ORGANIZADOR_TEMPORAL,
    lugar_id: LUGAR_TEMPORAL,
  });

  const insertado = await coleccion.insertOne(
    eventoABson({ ...evento, _id: new ObjectId().toHexString() }),
  );

  return {
    id: insertado.insertedId.toHexString(),
    nombre: evento.nombre,
    tipo_evento: tipo,
    temporal: true,
  };
}

/** Validador vivo del servidor para `eventos`, con su forma canónica. */
type ValidadorVivo = {
  /** El validador declara el bloque `configuracion_evento.academico`. */
  declarabaElBloque: boolean;
  /** Forma canónica del validador (para compararlo antes y después). */
  forma: string;
};

/** Lee el validador vivo de la colección `eventos`. */
async function leerValidador(db: Db): Promise<ValidadorVivo> {
  try {
    const opciones = (await db.collection("eventos").options()) as { validator?: Document };
    const validator = opciones.validator;
    const declaracion = (
      validator?.$jsonSchema as
        | { properties?: { configuracion_evento?: { properties?: { academico?: unknown } } } }
        | undefined
    )?.properties?.configuracion_evento?.properties?.academico;

    return {
      declarabaElBloque: declaracion !== undefined,
      forma: canonizar(validator ?? null),
    };
  } catch {
    return { declarabaElBloque: false, forma: "" };
  }
}

/** Lectura de un evento por la API, con el bloque académico si viene. */
async function leerEvento(base: string, id: string): Promise<Lectura> {
  const respuesta = await consultar(base, `/eventos/${id}`, "GET");

  return { status: respuesta.status, bloque: bloqueDe(respuesta.cuerpo) };
}

/** `PATCH` con el bloque académico sobre un evento. */
async function editarConBloque(base: string, id: string): Promise<Lectura> {
  const actual = await consultar(base, `/eventos/${id}`, "GET");
  const respuesta = await consultar(base, `/eventos/${id}`, "PATCH", {
    configuracion_evento: { ...configuracionDe(actual.cuerpo), academico: { ...BLOQUE_ACADEMICO } },
  });

  return { status: respuesta.status, bloque: bloqueDe(respuesta.cuerpo) };
}

/** `PATCH` con el bloque académico sobre un evento de otro tipo (debe fallar). */
async function editarConBloqueRechazado(base: string, id: string): Promise<PatchRechazado> {
  const actual = await consultar(base, `/eventos/${id}`, "GET");
  const respuesta = await consultar(base, `/eventos/${id}`, "PATCH", {
    configuracion_evento: { ...configuracionDe(actual.cuerpo), academico: { ...BLOQUE_ACADEMICO } },
  });

  const error = (respuesta.cuerpo as { error?: { codigo?: string; mensaje?: string } } | null)
    ?.error;

  return {
    status: respuesta.status,
    codigo: error?.codigo ?? null,
    mensaje: error?.mensaje ?? "",
  };
}

/** Respuesta HTTP de la demostración. */
type RespuestaApi = {
  status: number;
  cuerpo: unknown;
};

/**
 * Golpea la API y lee el cuerpo entero.
 *
 * El cuerpo se consume siempre: una respuesta sin leer deja la conexión
 * abierta y la siguiente petición mide el arranque de la conexión, no la
 * operación.
 */
async function consultar(
  base: string,
  ruta: string,
  metodo: string,
  cuerpo?: unknown,
): Promise<RespuestaApi> {
  const respuesta = await fetch(urlDe(base, ruta), {
    method: metodo,
    ...(cuerpo === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) }),
  });

  const texto = await respuesta.text();
  let cuerpoLeido: unknown = undefined;

  try {
    cuerpoLeido = texto.length > 0 ? JSON.parse(texto) : undefined;
  } catch {
    cuerpoLeido = texto;
  }

  return { status: respuesta.status, cuerpo: cuerpoLeido };
}

/**
 * Arma la URL de una petición.
 *
 * La base del servidor de medición ya trae el prefijo `/api`: sin quitarlo, la
 * URL quedaría duplicada (`/api/api/eventos`).
 */
function urlDe(base: string, ruta: string): string {
  const prefijo = "/api";
  const relativa = ruta.startsWith(prefijo) ? ruta.slice(prefijo.length) : ruta;

  return `${base}${relativa}`;
}

/** Bloque académico de un cuerpo de la API (`null` si no viene). */
function bloqueDe(cuerpo: unknown): BloqueAcademico | null {
  const configuracion = (
    cuerpo as { configuracion_evento?: { academico?: unknown } } | null | undefined
  )?.configuracion_evento;
  const bloque = configuracion?.academico;

  if (!bloque || typeof bloque !== "object") {
    return null;
  }

  return bloque as BloqueAcademico;
}

/** Configuración de un cuerpo de la API (objeto plano, o vacío). */
function configuracionDe(cuerpo: unknown): Record<string, unknown> {
  const configuracion = (
    cuerpo as { configuracion_evento?: Record<string, unknown> } | null | undefined
  )?.configuracion_evento;

  if (!configuracion || typeof configuracion !== "object") {
    return {};
  }

  return { ...configuracion };
}

/** Bucle de tráfico en vivo, con su forma de parar. */
type TraficoVivo = {
  /** Conteos del bucle. */
  estado: EstadoTrafico;
  /** Detiene el bucle y espera a la petición en curso. */
  detener: () => Promise<void>;
};

/**
 * Levanta el bucle de tráfico continuo.
 *
 * El bucle golpea la API cada pocos milisegundos y cuenta las respuestas que
 * no son 2xx: **cero** es el criterio de "sin downtime".
 *
 * Las peticiones se lanzan **sin esperar la respuesta**: así el tráfico sigue
 * corriendo *mientras* se escribe el campo nuevo (si el bucle esperara cada
 * respuesta, habría intervalos sin tráfico justo en el momento que hay que
 * demostrar). Las respuestas se cuentan cuando llegan, y al parar el bucle se
 * esperan todas para no perder ninguna en el recuento.
 */
async function iniciarTrafico(base: string, id: string, intervaloMs: number): Promise<TraficoVivo> {
  const estado: EstadoTrafico = {
    enviadas: 0,
    peticiones: 0,
    exitosas: 0,
    fallos: 0,
    estados: {},
    errores: [],
  };

  const pendientes = new Set<Promise<void>>();
  let activo = true;

  const medir = async (): Promise<void> => {
    try {
      const respuesta = await fetch(urlDe(base, `/eventos/${id}`));

      await respuesta.text();
      estado.peticiones += 1;

      const codigo = String(respuesta.status);
      estado.estados[codigo] = (estado.estados[codigo] ?? 0) + 1;

      if (respuesta.ok) {
        estado.exitosas += 1;
      } else {
        estado.fallos += 1;
      }
    } catch (error) {
      estado.peticiones += 1;
      estado.fallos += 1;
      estado.errores.push(error instanceof Error ? error.message : String(error));
    }
  };

  const bucle = async (): Promise<void> => {
    while (activo) {
      const peticion = medir();

      pendientes.add(peticion);
      void peticion.finally(() => {
        pendientes.delete(peticion);
      });

      estado.enviadas += 1;

      await esperar(intervaloMs);
    }
  };

  const pendiente = bucle();

  return {
    estado,
    detener: async () => {
      activo = false;
      await pendiente;
      await Promise.all([...pendientes]);
    },
  };
}

/** Espera a que el bucle de tráfico haya lanzado al menos `minimo` peticiones. */
async function esperarSolicitudes(trafico: TraficoVivo, minimo: number): Promise<void> {
  const limite = Date.now() + 10_000;

  while (trafico.estado.enviadas < minimo && Date.now() < limite) {
    await esperar(2);
  }
}

/** Espera un tiempo dado (en milisegundos). */
function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => {
    setTimeout(resolver, ms);
  });
}
