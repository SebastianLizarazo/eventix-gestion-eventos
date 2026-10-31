import { ObjectId, type Db } from "mongodb";
import type { Repositorios } from "../db/repos/index.js";
import { resumir } from "../reporting/medir.js";
import { COLECCIONES_MEDIDAS, tabla } from "./dataset.js";

/**
 * Medición del p95 de las operaciones CRUD (NFR-01).
 *
 * El criterio de aceptación del documento 01 §4.2 es que **las consultas CRUD
 * simples responden en menos de 200 ms** con el dataset `full`. Esta unidad
 * mide lo que el cliente espera: la respuesta HTTP completa (ruta, validación,
 * serialización y viaje a la base), no el trabajo interno de MongoDB.
 *
 * Tres decisiones gobiernan el diseño:
 *
 * 1. **La medición no ensucia el dataset sembrado.** Toda escritura va sobre
 *    documentos temporales que crea la propia corrida y que borra al salir.
 *    El dataset `full` es la evidencia de los demás hitos: dejarlo como estaba
 *    es parte del criterio de aceptación de la corrida, no un detalle.
 * 2. **Las operaciones se miden por HTTP, de extremo a extremo**, contra la
 *    API montada en un puerto efímero (`arrancarServidorDeMedicion`).
 * 3. **La lógica vive aparte del I/O.** Las funciones que el test ejercita
 *    (matriz, veredicto, resumen, tabla, argumentos) son puras: no tocan la
 *    red ni la base, así que se pueden afirmar sin que el resultado dependa
 *    del tiempo que tarda la máquina.
 */

/** Operaciones CRUD que la matriz mide. */
export type OperacionCrud = "listado" | "lectura" | "alta" | "edicion" | "baja";

/** Veredicto de una operación frente al umbral del criterio. */
export type Veredicto = "dentro" | "FUERA";

/** Definición de una colección en la matriz de medición. */
export type ColeccionCrud = {
  /** Nombre de la colección en MongoDB. */
  nombre: string;
  /** Ruta pública del recurso (la que ve el cliente). */
  ruta: string;
  /** El recurso es append-only: la edición y la baja no aplican (405). */
  soloLectura: boolean;
  /**
   * Consulta de listado que mide la operación `listado`.
   *
   * Es el **patrón de query que el modelo indexa** (documento 04 §4): el
   * catálogo de eventos publicados, los organizadores, los lugares de una
   * ciudad, los tickets de un evento y el historial de compras de un usuario.
   * Medir el listado completo de una colección de 520.000 documentos sin
   * filtro no es una consulta CRUD simple: es un escaneo con ordenamiento
   * bloqueante sobre un acceso que el modelo no indexa (por eso se reporta
   * aparte, como diagnóstico).
   */
  consultaListado: (ids: IdsMedicion) => string;
};

/** Identificadores reales tomados de la base para las lecturas y los filtros. */
export type IdsMedicion = {
  /** Identificador de un evento sembrado. */
  evento: string;
  /** Identificador de un usuario sembrado. */
  usuario: string;
  /** Identificador de un lugar sembrado. */
  lugar: string;
  /** Identificador de un ticket sembrado. */
  ticket: string;
  /** Identificador de una transacción sembrada. */
  transaccion: string;
  /** Identificador de un tipo de ticket del evento de referencia. */
  tipoTicket: string;
  /** Ciudad del lugar de referencia (el filtro de lugares la usa). */
  ciudad: string;
};

/** Resumen de los tiempos de una operación CRUD. */
export type MedicionCrud = {
  /** Colección medida. */
  coleccion: string;
  /** Operación medida. */
  operacion: OperacionCrud;
  /** Iteraciones medidas (sin contar el calentamiento). */
  iteraciones: number;
  min_ms: number;
  p50_ms: number;
  p95_ms: number;
  max_ms: number;
};

/** Operación que no aplica a una colección, con el motivo. */
export type OperacionNoAplicable = {
  /** Operación que no aplica. */
  operacion: OperacionCrud;
  /** Por qué no aplica. */
  motivo: string;
};

/** Agregado que decide el código de salida de la corrida. */
export type ResumenCarga = {
  /** Operaciones medidas. */
  total: number;
  /** Operaciones dentro del umbral. */
  dentro: number;
  /** Operaciones fuera del umbral. */
  fuera: number;
  /** `true` cuando ninguna operación quedó fuera: el criterio se cumple. */
  cumple: boolean;
};

/** Argumentos de la línea de comandos de la medición. */
export type ArgumentosCrud = {
  /** Iteraciones medidas por operación. */
  iteraciones: number;
  /** Iteraciones de calentamiento (no se miden). */
  calentamiento: number;
  /** Umbral del criterio de aceptación, en milisegundos. */
  umbralMs: number;
  /** La corrida solo imprime la ayuda. */
  ayuda: boolean;
};

/** Iteraciones medidas por operación, por defecto. */
export const ITERACIONES_POR_DEFECTO = 20;

/** Iteraciones de calentamiento (no se miden), por defecto. */
export const CALENTAMIENTO_POR_DEFECTO = 3;

/** Umbral de NFR-01 para una consulta CRUD simple, en milisegundos. */
export const UMBRAL_POR_DEFECTO = 200;

/** Operaciones de una colección editable, en el orden de la matriz. */
const OPERACIONES: readonly OperacionCrud[] = ["listado", "lectura", "alta", "edicion", "baja"];

/** Operaciones de una colección append-only: sin edición ni baja. */
const OPERACIONES_APPEND_ONLY: readonly OperacionCrud[] = ["listado", "lectura", "alta"];

/**
 * Matriz de medición: las seis colecciones y las operaciones que aplican.
 *
 * `auditoria_eventos` es **append-only** (documento 04 §3.6): se lee y se
 * añade, pero no se modifica ni se borra. El router responde 405 a `PATCH` y
 * a `DELETE`, así que la edición y la baja **no aplican por contrato**: no
 * son un fallo del criterio y por eso no se miden.
 */
export const MATRIZ_CRUD: readonly ColeccionCrud[] = [
  {
    nombre: "eventos",
    ruta: "/api/eventos",
    soloLectura: false,
    consultaListado: () => "/api/eventos?estado=publicado",
  },
  {
    nombre: "usuarios",
    ruta: "/api/usuarios",
    soloLectura: false,
    consultaListado: () => "/api/usuarios?tipo_usuario=organizador",
  },
  {
    nombre: "lugares",
    ruta: "/api/lugares",
    soloLectura: false,
    consultaListado: (ids) => `/api/lugares?ciudad=${encodeURIComponent(ids.ciudad)}&activo=true`,
  },
  {
    nombre: "tickets",
    ruta: "/api/tickets",
    soloLectura: false,
    consultaListado: (ids) => `/api/tickets?evento_id=${ids.evento}`,
  },
  {
    nombre: "transacciones",
    ruta: "/api/transacciones",
    soloLectura: false,
    consultaListado: (ids) => `/api/transacciones?usuario_id=${ids.usuario}`,
  },
  {
    nombre: "auditoria_eventos",
    ruta: "/api/auditoria",
    soloLectura: true,
    consultaListado: (ids) => `/api/auditoria?actor_id=${ids.usuario}`,
  },
];

/** Devuelve la definición de la colección, o falla si no existe. */
function coleccionDe(coleccion: string): ColeccionCrud {
  const definicion = MATRIZ_CRUD.find((item) => item.nombre === coleccion);

  if (!definicion) {
    throw new Error(`Colección desconocida: ${coleccion}`);
  }

  return definicion;
}

/**
 * Operaciones que aplican a una colección.
 *
 * La auditoría se queda con listado, lectura y alta: es append-only y el
 * router responde 405 a la edición y a la baja.
 */
export function operacionesDe(coleccion: string): readonly OperacionCrud[] {
  const definicion = coleccionDe(coleccion);

  return definicion.soloLectura ? OPERACIONES_APPEND_ONLY : OPERACIONES;
}

/**
 * Operaciones que **no** aplican a una colección, con su motivo.
 *
 * No es un fallo del criterio de NFR-01: es el contrato del recurso. Por eso
 * se declaran con su motivo en vez de medirse y salir como `FUERA`.
 */
export function operacionesNoAplicables(coleccion: string): readonly OperacionNoAplicable[] {
  const definicion = coleccionDe(coleccion);

  if (!definicion.soloLectura) {
    return [];
  }

  const motivo =
    "no aplica por contrato: la colección es append-only y la API responde 405 a la edición y a la baja";

  return [
    { operacion: "edicion", motivo },
    { operacion: "baja", motivo },
  ];
}

/** Veredicto de una operación frente al umbral del criterio. */
export function veredicto(medicion: MedicionCrud, umbralMs: number): Veredicto {
  return medicion.p95_ms <= umbralMs ? "dentro" : "FUERA";
}

/**
 * Agregado de una corrida: decide el código de salida de la medición.
 *
 * El CLI no puede dar un falso verde: si una sola operación quedó fuera del
 * umbral, `cumple` es `false` y la corrida termina con código 1.
 */
export function resumenDeCarga(
  mediciones: readonly MedicionCrud[],
  umbralMs: number,
): ResumenCarga {
  const dentro = mediciones.filter((medicion) => veredicto(medicion, umbralMs) === "dentro").length;

  return {
    total: mediciones.length,
    dentro,
    fuera: mediciones.length - dentro,
    cumple: dentro === mediciones.length,
  };
}

/**
 * Tabla de resultados de la medición.
 *
 * Las columnas son las del criterio: colección, operación, iteraciones, el
 * mínimo, la mediana, el p95, el máximo y el veredicto contra el umbral.
 */
export function formatearTabla(mediciones: readonly MedicionCrud[], umbralMs: number): string {
  const encabezados = [
    "colección",
    "operación",
    "iteraciones",
    "min ms",
    "p50 ms",
    "p95 ms",
    "max ms",
    "veredicto",
  ];

  const filas = mediciones.map((medicion) => [
    medicion.coleccion,
    medicion.operacion,
    String(medicion.iteraciones),
    String(medicion.min_ms),
    String(medicion.p50_ms),
    String(medicion.p95_ms),
    String(medicion.max_ms),
    veredicto(medicion, umbralMs),
  ]);

  return tabla(encabezados, filas);
}

/** Lee los argumentos de la línea de comandos de la medición. */
export function leerArgumentos(argumentos: readonly string[]): ArgumentosCrud {
  const resultado: ArgumentosCrud = {
    iteraciones: ITERACIONES_POR_DEFECTO,
    calentamiento: CALENTAMIENTO_POR_DEFECTO,
    umbralMs: UMBRAL_POR_DEFECTO,
    ayuda: false,
  };

  for (const argumento of argumentos) {
    if (argumento === "--ayuda" || argumento === "-h" || argumento === "--help") {
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

/**
 * Consulta de listado que mide la operación `listado` de una colección.
 *
 * Es el patrón de query que el modelo indexa (documento 04 §4).
 */
export function rutaDeListado(coleccion: string, ids: IdsMedicion): string {
  return coleccionDe(coleccion).consultaListado(ids);
}

/**
 * Cuerpo de un alta, válido según el dominio.
 *
 * Los valores que el modelo declara únicos (el `slug` del evento, el correo
 * del usuario, el `codigo_qr` del ticket y la `referencia_pasarela` de la
 * transacción) llevan la corrección de la corrida: por eso dos iteraciones
 * nunca chocan con un índice único.
 */
export function cuerpoDeAlta(
  coleccion: string,
  ids: IdsMedicion,
  correccion: string,
): Record<string, unknown> {
  const sufijo = correccion.toUpperCase();

  switch (coleccion) {
    case "eventos":
      return {
        nombre: `Evento NFR ${sufijo}`,
        slug: `nfr-crud-${sufijo.toLowerCase()}`,
        tipo_evento: "corporativo",
        descripcion: `Documento temporal de la medición NFR-01 (${sufijo})`,
        fecha_inicio: "2026-01-01T00:00:00.000Z",
        fecha_fin: "2026-01-02T00:00:00.000Z",
        estado: "borrador",
        visibilidad: "privado",
        organizador_id: ids.usuario,
        lugar_id: ids.lugar,
        categorias: ["nfr-crud"],
        tags: ["nfr-crud"],
      };

    case "usuarios":
      return {
        email: `nfr-crud-${sufijo.toLowerCase()}@example.test`,
        nombre: `Usuario NFR ${sufijo}`,
        telefono: "3001234567",
        documento_identidad: `NFR-${sufijo}`,
        tipo_usuario: ["asistente"],
      };

    case "lugares":
      return {
        nombre: `Lugar NFR ${sufijo}`,
        direccion: "Calle 1 # 2-3",
        ciudad: ids.ciudad,
        pais: "CO",
        capacidad_total: 100,
        geometria: { type: "Point", coordinates: [-74.072, 4.711] },
      };

    case "tickets":
      return {
        codigo_qr: `NFR-CRUD-${sufijo}`,
        estado: "emitido",
        evento_id: ids.evento,
        comprado_por_usuario_id: ids.usuario,
        snapshot_tipo_ticket: {
          tipo_ticket_id: ids.tipoTicket,
          nombre: "General",
          precio_cop: 1000,
        },
        asistente_snapshot: {
          usuario_id: ids.usuario,
          nombre: `Usuario NFR ${sufijo}`,
          documento_identidad: `NFR-${sufijo}`,
          email: `nfr-crud-${sufijo.toLowerCase()}@example.test`,
        },
        precio_pagado_cop: 1000,
      };

    case "transacciones":
      return {
        usuario_id: ids.usuario,
        ticket_id: ids.ticket,
        monto_cop: 1000,
        moneda: "COP",
        metodo_pago: "tarjeta_credito",
        pasarela: "nfr-crud",
        estado: "pendiente",
        referencia_pasarela: `NFR-CRUD-${sufijo}`,
      };

    case "auditoria_eventos":
      return {
        actor_id: ids.usuario,
        actor_rol: "sistema",
        accion: "nfr.crud.medicion",
        sujeto_tipo: "evento",
        sujeto_id: ids.evento,
        metadata: { origen: "nfr-crud", correccion: sufijo },
      };

    default:
      throw new Error(`Colección desconocida: ${coleccion}`);
  }
}

/**
 * Cuerpo de una edición.
 *
 * Se edita **un solo campo** y siempre el mismo: la operación `edicion`
 * repite la edición sobre un mismo documento temporal, así que el campo tiene
 * que poder recibir el mismo valor varias veces sin invalidar el documento.
 */
export function cuerpoDeEdicion(coleccion: string, correccion: string): Record<string, unknown> {
  const sufijo = correccion.toUpperCase();

  switch (coleccion) {
    case "eventos":
      return { descripcion: `Editado por la medición NFR-01 (${sufijo})` };

    case "usuarios":
      return { nombre: `Usuario NFR editado ${sufijo}` };

    case "lugares":
      return { capacidad_total: 100 };

    case "tickets":
      return { precio_pagado_cop: 1001 };

    case "transacciones":
      return { monto_cop: 1001 };

    default:
      throw new Error(`La colección ${coleccion} no admite edición`);
  }
}

/** Opciones de una corrida de medición. */
export type OpcionesMedicionCrud = {
  /** Base HTTP de la API (con el prefijo `/api`). */
  base: string;
  /** Iteraciones medidas por operación. */
  iteraciones: number;
  /** Iteraciones de calentamiento (no se miden). */
  calentamiento: number;
  /** Repositorios de la base sembrada (para buscar identificadores reales). */
  repos: Repositorios;
  /** Base de datos donde se limpian los documentos temporales. */
  db: Db;
  /** Corrección de la corrida: hace únicos los valores de los índices únicos. */
  correccion: string;
};

/** Resultado de una corrida de medición. */
export type ResultadoMedicionCrud = {
  /** Mediciones de las operaciones que aplican (el criterio de NFR-01). */
  mediciones: MedicionCrud[];
  /** Listados sin filtro: diagnóstico, fuera del veredicto del criterio. */
  diagnostico: MedicionCrud[];
  /** Documentos temporales que creó la corrida (ya borrados al salir). */
  temporales: number;
};

/**
 * Corre la medición completa de las seis colecciones.
 *
 * Todas las escrituras van sobre documentos temporales que crea la propia
 * corrida, y la corrida los borra al terminar (aunque algo falle a mitad):
 * el dataset sembrado tiene que quedar exactamente como estaba.
 */
export async function medirCrud(opciones: OpcionesMedicionCrud): Promise<ResultadoMedicionCrud> {
  const ids = await buscarIds(opciones.repos);
  const mediciones: MedicionCrud[] = [];
  const diagnostico: MedicionCrud[] = [];
  const temporales = crearTemporales();

  try {
    for (const coleccion of MATRIZ_CRUD) {
      await medirColeccion(coleccion, ids, opciones, mediciones, temporales);
    }

    await medirListadosSinFiltro(opciones, diagnostico);
  } finally {
    await borrarTemporales(opciones.db, temporales);
  }

  return {
    mediciones,
    diagnostico,
    temporales: temporales.creados,
  };
}

/** Documentos temporales que la corrida creó y tiene que borrar al salir. */
type Temporales = {
  /** Identificadores de los documentos temporales, por colección. */
  ids: Map<string, string[]>;
  /** Cuántos documentos creó la corrida. */
  creados: number;
};

/** Prepara el registro de los documentos temporales de la corrida. */
function crearTemporales(): Temporales {
  return {
    ids: new Map<string, string[]>(COLECCIONES_MEDIDAS.map((coleccion) => [coleccion, []])),
    creados: 0,
  };
}

/** Mide las cinco operaciones (o las que apliquen) de una colección. */
async function medirColeccion(
  coleccion: ColeccionCrud,
  ids: IdsMedicion,
  opciones: OpcionesMedicionCrud,
  mediciones: MedicionCrud[],
  temporales: Temporales,
): Promise<void> {
  const nombre = coleccion.nombre;

  // 1. Listado: el patrón de query que el modelo indexa.
  const rutaListado = coleccion.consultaListado(ids);

  mediciones.push(
    await medirOperacion(nombre, "listado", rutaListado, opciones, async () => {
      await consultar(opciones.base, rutaListado, "GET");
    }),
  );

  // 2. Lectura por id: un documento real de la colección.
  const idLectura =
    nombre === "auditoria_eventos"
      ? await crearTemporal(nombre, ids, `${opciones.correccion}-lectura`, opciones, temporales)
      : idDeLectura(nombre, ids);

  const rutaLectura = `${coleccion.ruta}/${idLectura}`;

  mediciones.push(
    await medirOperacion(nombre, "lectura", rutaLectura, opciones, async () => {
      await consultar(opciones.base, rutaLectura, "GET");
    }),
  );

  // 3. Alta: cada iteración crea un documento (se miden los POST).
  let contadorAlta = 0;

  mediciones.push(
    await medirOperacion(nombre, "alta", coleccion.ruta, opciones, async () => {
      contadorAlta += 1;
      const correccion = `${opciones.correccion}-alta-${contadorAlta}`;
      const cuerpo = cuerpoDeAlta(nombre, ids, correccion);
      const respuesta = await consultar(opciones.base, coleccion.ruta, "POST", cuerpo);

      registrarTemporal(nombre, idDeRespuesta(respuesta), temporales);
    }),
  );

  const operaciones = operacionesDe(nombre);

  // 4. Edición: se edita repetidamente un mismo documento temporal.
  if (operaciones.includes("edicion")) {
    const correccion = `${opciones.correccion}-edicion`;
    const idEdicion = await crearTemporal(nombre, ids, correccion, opciones, temporales);
    const rutaEdicion = `${coleccion.ruta}/${idEdicion}`;
    const cuerpoEdicion = cuerpoDeEdicion(nombre, correccion);

    mediciones.push(
      await medirOperacion(nombre, "edicion", rutaEdicion, opciones, async () => {
        await consultar(opciones.base, rutaEdicion, "PATCH", cuerpoEdicion);
      }),
    );
  }

  // 5. Baja: los documentos a borrar se crean sin medir; se mide solo el DELETE.
  if (operaciones.includes("baja")) {
    const idsBaja: string[] = [];

    for (let vuelta = 0; vuelta < opciones.iteraciones + opciones.calentamiento; vuelta += 1) {
      idsBaja.push(
        await crearTemporal(
          nombre,
          ids,
          `${opciones.correccion}-baja-${vuelta}`,
          opciones,
          temporales,
        ),
      );
    }

    let pendiente = 0;

    mediciones.push(
      await medirOperacion(nombre, "baja", `${coleccion.ruta}/{id}`, opciones, async () => {
        const id = idsBaja[pendiente];
        pendiente += 1;

        if (!id) {
          throw new Error(`No quedan documentos temporales para borrar en ${nombre}`);
        }

        await consultar(opciones.base, `${coleccion.ruta}/${id}`, "DELETE");
      }),
    );
  }
}

/**
 * Mide el listado **sin filtro** de cada colección.
 *
 * No es parte del criterio de NFR-01: es el acceso que el modelo no indexa
 * (documento 04 §4 declara los índices por patrón de query). Se reporta como
 * diagnóstico para que la diferencia sea visible y no para exigirle un
 * veredicto que el criterio no pide.
 */
async function medirListadosSinFiltro(
  opciones: OpcionesMedicionCrud,
  diagnostico: MedicionCrud[],
): Promise<void> {
  for (const coleccion of MATRIZ_CRUD) {
    const ruta = coleccion.ruta;

    diagnostico.push(
      await medirOperacion(coleccion.nombre, "listado", ruta, opciones, async () => {
        await consultar(opciones.base, ruta, "GET");
      }),
    );
  }
}

/**
 * Mide una operación: calienta, mide y devuelve el resumen.
 *
 * El calentamiento importa: la primera petición paga el plan de ejecución y
 * el caché de WiredTiger en frío, y no es lo que el operador vive en
 * operación. En la baja, el calentamiento consume documentos temporales
 * también: por eso se crean uno por iteración **más** los del calentamiento.
 */
async function medirOperacion(
  coleccion: string,
  operacion: OperacionCrud,
  ruta: string,
  opciones: OpcionesMedicionCrud,
  ejecutar: () => Promise<void>,
): Promise<MedicionCrud> {
  for (let vuelta = 0; vuelta < opciones.calentamiento; vuelta += 1) {
    await ejecutar();
  }

  const tiempos: number[] = [];

  for (let vuelta = 0; vuelta < opciones.iteraciones; vuelta += 1) {
    const inicio = performance.now();
    await ejecutar();
    tiempos.push(performance.now() - inicio);
  }

  const resumen = resumir(`${coleccion} · ${operacion}`, ruta, tiempos);

  return {
    coleccion,
    operacion,
    iteraciones: resumen.iteraciones,
    min_ms: resumen.min_ms,
    p50_ms: resumen.p50_ms,
    p95_ms: resumen.p95_ms,
    max_ms: resumen.max_ms,
  };
}

/** Identificador real que se usa para la lectura por id de cada colección. */
function idDeLectura(coleccion: string, ids: IdsMedicion): string {
  switch (coleccion) {
    case "eventos":
      return ids.evento;
    case "usuarios":
      return ids.usuario;
    case "lugares":
      return ids.lugar;
    case "tickets":
      return ids.ticket;
    case "transacciones":
      return ids.transaccion;
    default:
      throw new Error(`La colección ${coleccion} no tiene documento de lectura`);
  }
}

/** Busca los identificadores reales que la medición necesita. */
async function buscarIds(repos: Repositorios): Promise<IdsMedicion> {
  const evento = await repos.eventos.obtenerUno({});
  const usuario = await repos.usuarios.obtenerUno({});
  const lugar = await repos.lugares.obtenerUno({});
  const ticket = await repos.tickets.obtenerUno({});
  const transaccion = await repos.transacciones.obtenerUno({});

  const idEvento = idDe(evento, "eventos");
  const idUsuario = idDe(usuario, "usuarios");
  const idLugar = idDe(lugar, "lugares");
  const idTicket = idDe(ticket, "tickets");
  const idTransaccion = idDe(transaccion, "transacciones");
  const tipoTicket = evento?.tipos_ticket?.[0]?._id;

  if (!tipoTicket) {
    throw new Error(
      "El evento de referencia no tiene tipos de ticket: siembra el dataset antes de medir",
    );
  }

  return {
    evento: idEvento,
    usuario: idUsuario,
    lugar: idLugar,
    ticket: idTicket,
    transaccion: idTransaccion,
    tipoTicket,
    ciudad: lugar?.ciudad ?? "Bogotá",
  };
}

/** Extrae el identificador de un documento, o falla si la colección está vacía. */
function idDe(documento: { _id?: string } | null, coleccion: string): string {
  if (!documento?._id) {
    throw new Error(`La colección ${coleccion} está vacía: siembra el dataset antes de medir`);
  }

  return documento._id;
}

/** Crea un documento temporal (sin medir) y devuelve su identificador. */
async function crearTemporal(
  coleccion: string,
  ids: IdsMedicion,
  correccion: string,
  opciones: OpcionesMedicionCrud,
  temporales: Temporales,
): Promise<string> {
  const definicion = coleccionDe(coleccion);
  const cuerpo = cuerpoDeAlta(coleccion, ids, correccion);
  const respuesta = await consultar(opciones.base, definicion.ruta, "POST", cuerpo);
  const id = idDeRespuesta(respuesta);

  registrarTemporal(coleccion, id, temporales);

  return id;
}

/** Anota un documento temporal para borrarlo al terminar la corrida. */
function registrarTemporal(coleccion: string, id: string, temporales: Temporales): void {
  const lista = temporales.ids.get(coleccion);

  if (lista) {
    lista.push(id);
  }

  temporales.creados += 1;
}

/** Borra los documentos temporales que creó la corrida. */
async function borrarTemporales(db: Db, temporales: Temporales): Promise<void> {
  for (const [coleccion, ids] of temporales.ids) {
    if (ids.length === 0) {
      continue;
    }

    await db.collection(coleccion).deleteMany({ _id: { $in: ids.map((id) => new ObjectId(id)) } });

    ids.length = 0;
  }
}

/** Extrae el identificador del documento creado por una respuesta de alta. */
function idDeRespuesta(respuesta: RespuestaHttp): string {
  const cuerpo = respuesta.cuerpo as { _id?: unknown } | undefined;
  const id = cuerpo?._id;

  if (typeof id !== "string" || id.length === 0) {
    throw new Error(
      `La respuesta del alta no trae el identificador del documento: ${JSON.stringify(cuerpo)}`,
    );
  }

  return id;
}

/** Respuesta HTTP de la medición. */
type RespuestaHttp = {
  status: number;
  cuerpo: unknown;
};

/**
 * Golpea la API y se come el cuerpo.
 *
 * El cuerpo se lee entero a propósito: una respuesta que no se consume deja
 * la conexión abierta y la siguiente medición mide el arranque de la
 * conexión, no la operación.
 */
async function consultar(
  base: string,
  ruta: string,
  metodo: string,
  cuerpo?: unknown,
): Promise<RespuestaHttp> {
  const respuesta = await fetch(urlDe(base, ruta), {
    method: metodo,
    ...(cuerpo === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) }),
  });

  const texto = await respuesta.text();

  if (!respuesta.ok) {
    throw new Error(`El ${metodo} ${ruta} respondió ${respuesta.status}: ${texto.slice(0, 200)}`);
  }

  let parsed: unknown;

  try {
    parsed = texto.length > 0 ? JSON.parse(texto) : undefined;
  } catch {
    parsed = texto;
  }

  return { status: respuesta.status, cuerpo: parsed };
}

/**
 * Arma la URL de una petición.
 *
 * La base del servidor de medición ya trae el prefijo `/api` (`.../api`) y la
 * matriz declara la ruta pública (`/api/eventos`): sin quitar el prefijo, la
 * URL quedaría duplicada (`/api/api/eventos`).
 */
function urlDe(base: string, ruta: string): string {
  const prefijo = "/api";
  const relativa = ruta.startsWith(prefijo) ? ruta.slice(prefijo.length) : ruta;

  return `${base}${relativa}`;
}
