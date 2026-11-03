import { ObjectId, type Db } from "mongodb";
import { prepararEvento, prepararUsuario } from "../domain/schemas/index.js";
import type { Repositorios } from "../db/repos/index.js";
import { percentil } from "../reporting/medir.js";
import { compararConteos, contarColecciones } from "./dataset.js";

/**
 * Prueba de carga de compras (NFR-05): **cien compradores simultáneos** contra
 * un evento con **aforo cincuenta**.
 *
 * El requisito de negocio (documento 01 §4, NFR-05) es que *el inventario de
 * tickets debe ser consistentemente consistente: no se puede vender el mismo
 * asiento dos veces*. H6 ya lo probó a nivel de servicio (ocho compradores
 * contra un aforo de dos, en `tests/services/concurrencia.test.ts`); esta
 * unidad lo prueba **por HTTP**, que es el camino que de verdad usa el
 * cliente, y a la escala del criterio.
 *
 * Tres decisiones gobiernan el diseño:
 *
 * 1. **La descarga va por HTTP, contra la API montada en un puerto efímero**
 *    (`arrancarServidorDeMedicion`). Lo que el operador espera es la respuesta
 *    completa (ruta, validación, serialización y viaje a la base), no el
 *    trabajo interno de MongoDB.
 * 2. **La corrida no puede dejar sucio el dataset sembrado.** Todo lo que crea
 *    lleva el identificador de la corrida (correos, nombre del evento,
 *    referencias de pasarela) y lo borra en un `finally`: el dataset `full` es
 *    la evidencia de los demás hitos, así que dejarlo como estaba es parte del
 *    criterio de aceptación de la corrida, no un detalle.
 * 3. **La lógica vive aparte del I/O.** Las funciones que el test ejercita
 *    (argumentos, análisis de respuestas, medición, marcador) son puras: no
 *    tocan la red ni la base, así que se pueden afirmar sin que el resultado
 *    dependa del tiempo que tarda la máquina. Los tests **no afirman tiempos
 *    reales**: afirman los invariantes.
 */

/** Compradores simultáneos por defecto (la corrida oficial). */
export const COMPRADORES_POR_DEFECTO = 100;

/** Aforo del tipo de ticket por defecto (la corrida oficial). */
export const AFORO_POR_DEFECTO = 50;

/** Precio del ticket por defecto, en COP. */
export const PRECIO_POR_DEFECTO = 100_000;

/** Motivo que debe traer **todo** rechazo de la carga. */
export const MOTIVO_A_FORO_AGOTADO = "aforo_agotado";

/** Motivo con el que se contabiliza un rechazo sin motivo legible. */
export const MOTIVO_SIN_MOTIVO = "sin_motivo";

/** Motivo con el que se contabiliza una petición que ni siquiera llegó. */
export const MOTIVO_ERROR_DE_RED = "error_de_red";

/**
 * Identificadores del organizador y del lugar del evento de la carga.
 *
 * El evento es temporal y se borra al terminar, así que sus referencias no
 * tienen que apuntar a documentos reales: el modelo no impone claves foráneas
 * (el `$jsonSchema` del servidor no las puede expresar).
 */
const ORGANIZADOR = "66a8f1c0a1b2c3d4e5f60001";
const LUGAR = "66b8f1c0a1b2c3d4e5f60002";

/**
 * Ventana de venta del tipo de ticket de la carga: **abierta**.
 *
 * Una ventana en el pasado y otra en el futuro vale para siempre: la corrida
 * no puede fallar porque el reloj haya avanzado. La fecha del reloj no
 * importa: lo que importa es que la compra llegue a la reserva de cupo.
 */
const VENTA_INICIO = new Date("2020-01-01T00:00:00.000Z");
const VENTA_FIN = new Date("2099-12-31T23:59:59.999Z");

/** Fechas del evento de la carga (el evento no se valida contra el reloj). */
const EVENTO_INICIO = new Date("2026-12-01T16:00:00.000Z");
const EVENTO_FIN = new Date("2026-12-01T23:00:00.000Z");

/** Argumentos de la línea de comandos de la carga. */
export type ArgumentosCarga = {
  /** Compradores simultáneos de la ráfaga. */
  compradores: number;
  /** Aforo del tipo de ticket que se compra. */
  aforo: number;
  /** Precio del ticket, en COP. */
  precio: number;
  /** La corrida solo imprime la ayuda. */
  ayuda: boolean;
};

/**
 * Identificador de la corrida.
 *
 * Todo lo que la corrida crea lleva este identificador: es lo que permite
 * borrar lo que creó sin depender de listas en memoria, y lo que hace que dos
 * corridas no choquen con un índice único.
 */
export type Marcador = {
  /** Identificador de la corrida, en mayúsculas. */
  correccion: string;
  /** Prefijo de los correos de los compradores (en minúsculas: así se persisten). */
  prefijoEmail: string;
  /** Prefijo de las referencias de pasarela de la corrida. */
  prefijoReferencia: string;
  /** Pasarela de la corrida: única por corrida. */
  pasarela: string;
  /** Nombre del evento de la corrida. */
  nombreEvento: string;
  /** Slug del evento de la corrida (único por corrida). */
  slugEvento: string;
};

/** Respuesta de una compra por HTTP. */
export type RespuestaCompra = {
  /** Estado HTTP (201 = compra creada, 409 = compra rechazada). */
  status: number;
  /** Cuerpo de la respuesta (ya interpretado como JSON, si se pudo). */
  cuerpo: unknown;
  /** Latencia de la petición completa, en milisegundos. */
  latencia_ms: number;
};

/** Análisis de las respuestas de la ráfaga. */
export type AnalisisRespuestas = {
  /** Compras creadas (201). */
  exitosas: number;
  /** Compras rechazadas (todo lo que no fue 201). */
  rechazadas: number;
  /** Motivos de rechazo, con la cantidad de cada uno. */
  motivos: Record<string, number>;
  /** Latencias de todas las peticiones de la ráfaga. */
  latencias_ms: number[];
};

/** Medición de la ráfaga de compras. */
export type MedicionCarga = {
  /** Peticiones medidas. */
  iteraciones: number;
  /** Duración total de la ráfaga, en milisegundos. */
  duracion_ms: number;
  /** Operaciones por segundo de la ráfaga. */
  throughput_ops_s: number;
  /** Latencia mínima, en milisegundos. */
  min_ms: number;
  /** Latencia mediana, en milisegundos. */
  p50_ms: number;
  /** Latencia del percentil 95, en milisegundos. */
  p95_ms: number;
  /** Latencia máxima, en milisegundos. */
  max_ms: number;
};

/** Opciones de una corrida de carga. */
export type OpcionesCarga = {
  /** Base HTTP de la API (con el prefijo `/api`). */
  base: string;
  /** Base de datos donde se prepara y se limpia la corrida. */
  db: Db;
  /** Repositorios de las seis colecciones. */
  repos: Repositorios;
  /** Número de compradores simultáneos. */
  compradores: number;
  /** Aforo del tipo de ticket. */
  aforo: number;
  /** Precio del ticket, en COP. */
  precio: number;
  /** Identificador de la corrida (hace únicos los valores de los índices únicos). */
  correccion: string;
};

/** Inventario que dejó la corrida, para comprobar que no quedó huérfano nada. */
export type InventarioCarga = {
  /** Tickets emitidos por la corrida. */
  tickets: number;
  /** Transacciones confirmadas por la corrida. */
  transacciones: number;
  /** Tickets sin su transacción. */
  ticketsSinTransaccion: number;
  /** Transacciones sin su ticket. */
  transaccionesSinTicket: number;
};

/** Contadores del evento de la carga. */
export type ContadoresCarga = {
  /** Aforo total del tipo de ticket. */
  aforoTotal: number;
  /** Aforo vendido del tipo de ticket. */
  aforoVendido: number;
  /** Tickets vendidos según las métricas del evento. */
  ticketsVendidosTotal: number;
  /** Ingresos registrados en las métricas del evento, en COP. */
  ingresosCop: number;
};

/** Resultado completo de una corrida de carga. */
export type ResultadoCarga = {
  /** Identificador de la corrida. */
  correccion: string;
  /** Evento de la carga. */
  evento_id: string;
  /** Tipo de ticket comprado. */
  tipo_ticket_id: string;
  /** Compradores de la ráfaga. */
  compradores: number;
  /** Aforo del tipo de ticket. */
  aforo: number;
  /** Precio del ticket, en COP. */
  precio: number;
  /** Compras creadas. */
  exitosas: number;
  /** Compras rechazadas. */
  rechazadas: number;
  /** Motivos de rechazo, con la cantidad de cada uno. */
  motivos: Record<string, number>;
  /** Tickets emitidos por la corrida. */
  tickets: number;
  /** Transacciones confirmadas por la corrida. */
  transacciones: number;
  /** Tickets sin su transacción. */
  tickets_sin_transaccion: number;
  /** Transacciones sin su ticket. */
  transacciones_sin_ticket: number;
  /** Aforo vendido del tipo de ticket. */
  aforo_vendido: number;
  /** Tickets vendidos según las métricas del evento. */
  tickets_vendidos_total: number;
  /** Ingresos registrados en las métricas del evento, en COP. */
  ingresos_cop: number;
  /** Medición de la ráfaga. */
  medicion: MedicionCarga;
  /** Conteos de las seis colecciones antes de la corrida. */
  conteos_antes: Record<string, number>;
  /** Conteos de las seis colecciones al terminar. */
  conteos_despues: Record<string, number>;
  /** `true` cuando los conteos de las seis colecciones son los mismos. */
  conteos_iguales: boolean;
  /** Problemas encontrados (vacío cuando la corrida se sostiene). */
  errores: string[];
  /** `true` cuando no hay ningún problema: la corrida se sostiene. */
  cumple: boolean;
};

/**
 * Construye el identificador de la corrida.
 *
 * Cada valor único del modelo (el correo del usuario, el slug del evento, el
 * par (`pasarela`, `referencia_pasarela`) de la transacción) lleva la
 * corrección de la corrida: dos corridas no pueden chocar con un índice único
 * y la limpieza puede reconocer sus documentos sin depender de listas en
 * memoria.
 */
export function crearMarcador(correccion: string): Marcador {
  const sufijo = correccion.toUpperCase();
  const inferior = sufijo.toLowerCase();

  return {
    correccion: sufijo,
    prefijoEmail: `nfr-carga-${inferior}-`,
    prefijoReferencia: `CARGA-${sufijo}-`,
    pasarela: `nfr-carga-${sufijo}`,
    nombreEvento: `Evento de carga NFR-05 ${sufijo}`,
    slugEvento: `nfr-carga-${inferior}`,
  };
}

/**
 * Lee los argumentos de la línea de comandos de la carga.
 *
 * Los valores por defecto son los de la corrida oficial: cien compradores
 * contra un aforo de cincuenta.
 */
export function leerArgumentos(argumentos: readonly string[]): ArgumentosCarga {
  const resultado: ArgumentosCarga = {
    compradores: COMPRADORES_POR_DEFECTO,
    aforo: AFORO_POR_DEFECTO,
    precio: PRECIO_POR_DEFECTO,
    ayuda: false,
  };

  for (const argumento of argumentos) {
    if (argumento === "--ayuda" || argumento === "-h" || argumento === "--help") {
      resultado.ayuda = true;
    } else if (argumento.startsWith("--compradores=")) {
      resultado.compradores = Number(argumento.slice("--compradores=".length));
    } else if (argumento.startsWith("--aforo=")) {
      resultado.aforo = Number(argumento.slice("--aforo=".length));
    } else if (argumento.startsWith("--precio=")) {
      resultado.precio = Number(argumento.slice("--precio=".length));
    } else {
      throw new Error(`Opción desconocida: ${argumento}`);
    }
  }

  if (!Number.isInteger(resultado.compradores) || resultado.compradores < 1) {
    throw new Error("--compradores debe ser un entero positivo");
  }

  if (!Number.isInteger(resultado.aforo) || resultado.aforo < 0) {
    throw new Error("--aforo debe ser un entero no negativo");
  }

  if (!Number.isInteger(resultado.precio) || resultado.precio < 0) {
    throw new Error("--precio debe ser un entero no negativo");
  }

  return resultado;
}

/**
 * Analiza las respuestas de la ráfaga.
 *
 * Una compra creada es la que responde **201**; todo lo demás es un rechazo.
 * El motivo específico vive en `error.detalles[0].codigo` (el `error.codigo`
 * dice la familia: 404/409/422), así que un rechazo con `aforo_agotado` y un
 * rechazo con `venta_no_iniciada` no se pueden confundir.
 */
export function analizarRespuestas(respuestas: readonly RespuestaCompra[]): AnalisisRespuestas {
  const motivos: Record<string, number> = {};
  let exitosas = 0;
  let rechazadas = 0;

  for (const respuesta of respuestas) {
    if (respuesta.status === 201) {
      exitosas += 1;
      continue;
    }

    rechazadas += 1;

    const motivo = motivoDe(respuesta.cuerpo) ?? MOTIVO_SIN_MOTIVO;

    motivos[motivo] = (motivos[motivo] ?? 0) + 1;
  }

  return {
    exitosas,
    rechazadas,
    motivos,
    latencias_ms: respuestas.map((respuesta) => respuesta.latencia_ms),
  };
}

/**
 * Mide la ráfaga: duración, throughput y percentiles.
 *
 * El percentil es el de `src/reporting/medir.ts` (rango más cercano): con cien
 * muestras, el p95 es la 95ª más lenta, no un valor interpolado que nadie
 * midió.
 */
export function medirCarga(latencias: readonly number[], duracionMs: number): MedicionCarga {
  const segundos = duracionMs / 1000;

  return {
    iteraciones: latencias.length,
    duracion_ms: redondear(duracionMs),
    throughput_ops_s: segundos > 0 ? redondear(latencias.length / segundos) : 0,
    min_ms: latencias.length > 0 ? redondear(Math.min(...latencias)) : 0,
    p50_ms: redondear(percentil(latencias, 50)),
    p95_ms: redondear(percentil(latencias, 95)),
    max_ms: latencias.length > 0 ? redondear(Math.max(...latencias)) : 0,
  };
}

/**
 * Corre la carga completa.
 *
 * La limpieza está en un `finally`: aunque la ráfaga o la comprobación fallen,
 * la corrida deja la base como estaba. Al terminar compara los conteos de las
 * seis colecciones con los que había antes: si no coinciden, la corrida
 * **falla** (el dataset sembrado no se puede dejar sucio).
 */
export async function cargar(opciones: OpcionesCarga): Promise<ResultadoCarga> {
  const marcador = crearMarcador(opciones.correccion);
  const conteosAntes = await contarColecciones(opciones.db);
  const observacion = await observarCorrida(opciones, marcador);
  const conteosDespues = await contarColecciones(opciones.db);
  const comparacion = compararConteos(conteosAntes, conteosDespues);
  const errores = comprobarInvariantes(
    opciones,
    observacion,
    comparacion.iguales,
    comparacion.diferencias,
  );

  return {
    correccion: marcador.correccion,
    evento_id: observacion.eventoId,
    tipo_ticket_id: observacion.tipoTicketId,
    compradores: opciones.compradores,
    aforo: opciones.aforo,
    precio: opciones.precio,
    exitosas: observacion.analisis.exitosas,
    rechazadas: observacion.analisis.rechazadas,
    motivos: observacion.analisis.motivos,
    tickets: observacion.inventario.tickets,
    transacciones: observacion.inventario.transacciones,
    tickets_sin_transaccion: observacion.inventario.ticketsSinTransaccion,
    transacciones_sin_ticket: observacion.inventario.transaccionesSinTicket,
    aforo_vendido: observacion.contadores.aforoVendido,
    tickets_vendidos_total: observacion.contadores.ticketsVendidosTotal,
    ingresos_cop: observacion.contadores.ingresosCop,
    medicion: observacion.medicion,
    conteos_antes: conteosAntes,
    conteos_despues: conteosDespues,
    conteos_iguales: comparacion.iguales,
    errores,
    cumple: errores.length === 0,
  };
}

/** Lo que la corrida observa, antes de limpiar. */
type Observacion = {
  eventoId: string;
  tipoTicketId: string;
  analisis: AnalisisRespuestas;
  inventario: InventarioCarga;
  contadores: ContadoresCarga;
  medicion: MedicionCarga;
};

/**
 * Prepara la corrida, dispara la ráfaga y observa el resultado.
 *
 * La limpieza va en un `finally`: si algo falla a mitad (una petición que
 * explota, una lectura que falla), la base queda como estaba y el error sube.
 */
async function observarCorrida(opciones: OpcionesCarga, marcador: Marcador): Promise<Observacion> {
  let eventoId = "";

  try {
    const evento = await crearEvento(opciones, marcador);
    eventoId = evento.eventoId;

    const compradores = await crearCompradores(opciones, marcador);
    const disparo = await dispararCompras(opciones, marcador, evento, compradores);

    const analisis = analizarRespuestas(disparo.respuestas);
    const inventario = await leerInventario(opciones.db, evento.eventoId, marcador.pasarela);
    const contadores = await leerContadores(opciones.repos, evento.eventoId, evento.tipoTicketId);
    const medicion = medirCarga(analisis.latencias_ms, disparo.duracion_ms);

    return {
      eventoId: evento.eventoId,
      tipoTicketId: evento.tipoTicketId,
      analisis,
      inventario,
      contadores,
      medicion,
    };
  } finally {
    await limpiarCorrida(opciones.db, marcador, eventoId);
  }
}

/**
 * Crea el evento de la carga: publicado, público y con **un** tipo de ticket
 * de aforo `aforo` y precio `precio`.
 *
 * La ventana de venta del tipo de ticket está **abierta** (una fecha en el
 * pasado y otra en el futuro): la corrida no puede fallar porque el reloj haya
 * avanzado.
 */
async function crearEvento(
  opciones: OpcionesCarga,
  marcador: Marcador,
): Promise<{ eventoId: string; tipoTicketId: string }> {
  const tipoTicketId = new ObjectId().toHexString();

  const evento = prepararEvento({
    nombre: marcador.nombreEvento,
    slug: marcador.slugEvento,
    tipo_evento: "masivo",
    descripcion: `Evento temporal de la prueba de carga NFR-05 (${marcador.correccion})`,
    estado: "publicado",
    visibilidad: "publico",
    fecha_inicio: EVENTO_INICIO,
    fecha_fin: EVENTO_FIN,
    organizador_id: ORGANIZADOR,
    lugar_id: LUGAR,
    tags: ["nfr-carga"],
    tipos_ticket: [
      {
        _id: tipoTicketId,
        nombre: "General",
        precio_cop: opciones.precio,
        aforo_total: opciones.aforo,
        aforo_vendido: 0,
        restricciones: { venta_inicio: VENTA_INICIO, venta_fin: VENTA_FIN },
      },
    ],
  });

  const eventoId = await opciones.repos.eventos.insertar(evento);

  return { eventoId, tipoTicketId };
}

/**
 * Crea los compradores de la corrida.
 *
 * Cada uno es un usuario distinto, con un correo que lleva la corrección de la
 * corrida: el índice único de `usuarios.email_normalizado` los distingue de
 * cualquier otra corrida.
 */
async function crearCompradores(opciones: OpcionesCarga, marcador: Marcador): Promise<string[]> {
  const ids: string[] = [];

  for (let indice = 0; indice < opciones.compradores; indice += 1) {
    const usuario = prepararUsuario({
      email: `${marcador.prefijoEmail}${indice}@eventix.test`,
      nombre: `Comprador ${indice} (${marcador.correccion})`,
      documento_identidad: `NFR-${marcador.correccion}-${indice}`,
      tipo_usuario: ["asistente"],
    });

    ids.push(await opciones.repos.usuarios.insertar(usuario));
  }

  return ids;
}

/**
 * Dispara la ráfaga: **todas** las compras a la vez.
 *
 * Las peticiones se lanzan sin esperar la respuesta de las anteriores: la
 * prueba es de concurrencia real, así que los compradores entran al mismo
 * tiempo (no por tandas). Cada comprador lleva su `referencia_pasarela`, que es
 * la clave de idempotencia del cargo: son únicas, así que ninguna compra puede
 * ser el reintento de otra.
 */
async function dispararCompras(
  opciones: OpcionesCarga,
  marcador: Marcador,
  evento: { eventoId: string; tipoTicketId: string },
  compradores: readonly string[],
): Promise<{ respuestas: RespuestaCompra[]; duracion_ms: number }> {
  const inicio = performance.now();

  const promesas = compradores.map((comprador, indice) =>
    comprarPorHttp(opciones.base, {
      evento_id: evento.eventoId,
      tipo_ticket_id: evento.tipoTicketId,
      usuario_id: comprador,
      asistente_id: comprador,
      metodo_pago: "tarjeta_credito",
      pasarela: marcador.pasarela,
      referencia_pasarela: `${marcador.prefijoReferencia}${indice}`,
    }),
  );

  const respuestas = await Promise.all(promesas);
  const duracion_ms = performance.now() - inicio;

  return { respuestas, duracion_ms };
}

/**
 * Compra un ticket por HTTP y mide la latencia de la respuesta completa.
 *
 * Un error de red **no** se pierde: se cuenta como un rechazo más, con su
 * motivo, para que la corrida lo reporte en vez de perder una de las voces del
 * veredicto.
 */
async function comprarPorHttp(
  base: string,
  cuerpo: Record<string, unknown>,
): Promise<RespuestaCompra> {
  const inicio = performance.now();

  try {
    const respuesta = await fetch(`${base}/compras`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    });

    const texto = await respuesta.text();
    const latencia_ms = performance.now() - inicio;

    let cuerpoLeido: unknown = texto;

    try {
      cuerpoLeido = texto.length > 0 ? JSON.parse(texto) : undefined;
    } catch {
      cuerpoLeido = texto;
    }

    return { status: respuesta.status, cuerpo: cuerpoLeido, latencia_ms };
  } catch (error) {
    const latencia_ms = performance.now() - inicio;
    const mensaje = error instanceof Error ? error.message : String(error);

    return {
      status: 0,
      cuerpo: { error: { codigo: MOTIVO_ERROR_DE_RED, mensaje } },
      latencia_ms,
    };
  }
}

/**
 * Lee el inventario que dejó la corrida y cuenta los huérfanos.
 *
 * Un ticket sin su transacción y una transacción sin su ticket son las dos
 * formas que puede tomar una compra a medias: la prueba exige que no haya
 * ninguna.
 */
async function leerInventario(
  db: Db,
  eventoId: string,
  pasarela: string,
): Promise<InventarioCarga> {
  const tickets = await db
    .collection("tickets")
    .find({ evento_id: new ObjectId(eventoId) })
    .toArray();
  const transacciones = await db.collection("transacciones").find({ pasarela }).toArray();

  const idsTicket = new Set(tickets.map((ticket) => String(ticket._id)));
  const idsTransaccion = new Set(transacciones.map((transaccion) => String(transaccion._id)));

  const ticketsSinTransaccion = tickets.filter(
    (ticket) => !ticket.transaccion_id || !idsTransaccion.has(String(ticket.transaccion_id)),
  ).length;

  const transaccionesSinTicket = transacciones.filter(
    (transaccion) => !transaccion.ticket_id || !idsTicket.has(String(transaccion.ticket_id)),
  ).length;

  return {
    tickets: tickets.length,
    transacciones: transacciones.length,
    ticketsSinTransaccion,
    transaccionesSinTicket,
  };
}

/** Lee los contadores que la compra actualizó en el evento. */
async function leerContadores(
  repos: Repositorios,
  eventoId: string,
  tipoTicketId: string,
): Promise<ContadoresCarga> {
  const evento = await repos.eventos.obtenerPorId(eventoId);
  const tipo = evento?.tipos_ticket.find((candidato) => candidato._id === tipoTicketId);

  return {
    aforoTotal: tipo?.aforo_total ?? 0,
    aforoVendido: tipo?.aforo_vendido ?? 0,
    ticketsVendidosTotal: evento?.metricas_evento?.tickets_vendidos_total ?? 0,
    ingresosCop: evento?.metricas_evento?.ingresos_cop ?? 0,
  };
}

/**
 * Borra todo lo que creó la corrida.
 *
 * La limpieza no depende de listas en memoria: cada documento se reconoce por
 * el identificador de la corrida (el correo del comprador, la pasarela de la
 * transacción, la referencia de la auditoría) o por el evento de la corrida.
 * Si el evento llegó a crearse, se borra también (y con él sus tickets).
 */
async function limpiarCorrida(db: Db, marcador: Marcador, eventoId: string): Promise<void> {
  if (eventoId) {
    const id = new ObjectId(eventoId);

    await db.collection("tickets").deleteMany({ evento_id: id });
    await db.collection("eventos").deleteMany({ _id: id });
    await db.collection("auditoria_eventos").deleteMany({ "metadata.evento_id": eventoId });
  }

  await db.collection("auditoria_eventos").deleteMany({
    "metadata.referencia_pasarela": { $regex: `^${escapar(marcador.prefijoReferencia)}` },
  });

  await db.collection("transacciones").deleteMany({ pasarela: marcador.pasarela });

  await db
    .collection("usuarios")
    .deleteMany({ email_normalizado: { $regex: `^${escapar(marcador.prefijoEmail)}` } });
}

/**
 * Comprueba los invariantes de la corrida y anota cada incumplimiento.
 *
 * La lista de errores es el veredicto: vacía significa que la corrida se
 * sostiene (cero sobreventas, cero huérfanos, contadores que cuadran y
 * dataset intacto).
 */
function comprobarInvariantes(
  opciones: OpcionesCarga,
  observacion: Observacion,
  conteosIguales: boolean,
  diferencias: { coleccion: string; antes: number; despues: number }[],
): string[] {
  const errores: string[] = [];
  const { analisis, inventario, contadores } = observacion;
  // Cada comprador compra **un** ticket: las ventas no pueden pasar del aforo
  // ni de los compradores que hay. Con más compradores que aforo (la corrida
  // oficial) sobran compradores y tienen que ser rechazados.
  const esperados = Math.min(opciones.aforo, opciones.compradores);
  const rechazadosEsperados = opciones.compradores - esperados;

  if (analisis.exitosas !== esperados) {
    errores.push(
      `las compras creadas fueron ${analisis.exitosas} (esperadas ${esperados}: el aforo es ${opciones.aforo})`,
    );
  }

  if (analisis.rechazadas !== rechazadosEsperados) {
    errores.push(
      `las compras rechazadas fueron ${analisis.rechazadas} (esperadas ${rechazadosEsperados})`,
    );
  }

  const otrosMotivos = Object.entries(analisis.motivos).filter(
    ([motivo]) => motivo !== MOTIVO_A_FORO_AGOTADO,
  );

  if (otrosMotivos.length > 0) {
    errores.push(
      `hay rechazos con un motivo distinto de "${MOTIVO_A_FORO_AGOTADO}": ${otrosMotivos
        .map(([motivo, cantidad]) => `${motivo} (${cantidad})`)
        .join(", ")}`,
    );
  }

  if (inventario.tickets !== esperados) {
    errores.push(`se crearon ${inventario.tickets} tickets (esperados ${esperados})`);
  }

  if (inventario.transacciones !== esperados) {
    errores.push(`se crearon ${inventario.transacciones} transacciones (esperadas ${esperados})`);
  }

  if (inventario.ticketsSinTransaccion > 0) {
    errores.push(
      `hay ${inventario.ticketsSinTransaccion} ticket(s) sin su transacción (compra a medias)`,
    );
  }

  if (inventario.transaccionesSinTicket > 0) {
    errores.push(
      `hay ${inventario.transaccionesSinTicket} transacción(es) sin su ticket (compra a medias)`,
    );
  }

  if (contadores.aforoVendido !== esperados) {
    errores.push(
      `el aforo vendido del tipo de ticket es ${contadores.aforoVendido} (esperado ${esperados})`,
    );
  }

  if (contadores.aforoVendido > contadores.aforoTotal) {
    errores.push(
      `SOBREVENTA: el aforo vendido (${contadores.aforoVendido}) supera el aforo total (${contadores.aforoTotal})`,
    );
  }

  if (contadores.ticketsVendidosTotal !== esperados) {
    errores.push(
      `las métricas del evento dicen ${contadores.ticketsVendidosTotal} tickets vendidos (esperados ${esperados})`,
    );
  }

  const ingresosEsperados = esperados * opciones.precio;

  if (contadores.ingresosCop !== ingresosEsperados) {
    errores.push(
      `los ingresos del evento son ${contadores.ingresosCop} COP (esperados ${ingresosEsperados})`,
    );
  }

  if (!conteosIguales) {
    errores.push(
      `el dataset sembrado no quedó intacto: ${diferencias
        .map((diferencia) => `${diferencia.coleccion} ${diferencia.antes} → ${diferencia.despues}`)
        .join(", ")}`,
    );
  }

  return errores;
}

/**
 * El motivo específico de un rechazo.
 *
 * Vive en `error.detalles[0].codigo`; el `error.codigo` dice la familia
 * (404/409/422). Si no hay detalle, el código de la familia es el motivo
 * (`sin_motivo` cuando tampoco hay ese).
 */
function motivoDe(cuerpo: unknown): string | null {
  const error = (
    cuerpo as { error?: { codigo?: string; detalles?: { codigo?: string }[] } } | null | undefined
  )?.error;

  return error?.detalles?.[0]?.codigo ?? error?.codigo ?? null;
}

/** Redondea a dos decimales: más precisión no dice nada aquí. */
function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Escapa los caracteres que tienen un significado dentro de una expresión regular. */
function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
