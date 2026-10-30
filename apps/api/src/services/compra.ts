import { createHash } from "node:crypto";
import { MongoServerError, ObjectId, type ClientSession, type MongoClient } from "mongodb";
import { logger } from "../logger.js";
import { toObjectId } from "../domain/ids.js";
import { ErrorCompra } from "../domain/errors.js";
import { validar } from "../domain/validar.js";
import {
  entradaCompraSchema,
  prepararAuditoria,
  ticketSchema,
  transaccionSchema,
  type EntradaCompra,
  type Ticket,
  type Transaccion,
} from "../domain/schemas/index.js";
import type { Repositorios } from "../db/repos/index.js";
import { evaluarPromocion } from "./promociones.js";

/**
 * Servicio de compra (spec S9, tarea T6.1): el flujo crítico de comprar un
 * ticket, con la sintaxis real del pseudocódigo del documento 04 §6.
 *
 * **La compra es una transacción de MongoDB.** Dentro de ella:
 *
 * 1. Se comprueba la **idempotencia**: el par (`pasarela`,
 *    `referencia_pasarela`) identifica el cargo, y si ya existe una compra
 *    viva con esa referencia se devuelve la que ya se hizo (sin cobrar dos
 *    veces ni ocupar cupo dos veces).
 * 2. Se **reserva el cupo de forma atómica**: el `aforo_vendido` del tipo de
 *    ticket solo se suma si el tipo todavía tiene cupo, y esa condición vive
 *    en el filtro de la actualización (no en el código), así que dos compras
 *    simultáneas del último ticket no pueden venderlo dos veces.
 * 3. Se **escriben el ticket y la transacción**, que son las dos mitades del
 *    mismo hecho.
 * 4. Se **suman los contadores** que el sistema es dueño: las métricas del
 *    evento, el uso de la promoción y las estadísticas del comprador.
 *
 * La transacción garantiza que **una compra fallida no deja nada**: si algo
 * falla, no queda ticket, ni transacción, ni cupo consumido, ni métricas
 * sumadas.
 *
 * La **auditoría se escribe fuera de la transacción** (documento 04 §3.6): el
 * rastro es append-only y está separado del tráfico transaccional, así que su
 * escritura nunca puede tumbar una compra ya cobrada.
 */

/** Resultado de una compra. */
export type ResultadoCompra = {
  /** El ticket emitido. */
  ticket: Ticket;
  /** La transacción del cargo. */
  transaccion: Transaccion;
  /** `true` cuando la compra ya existía (reintento con la misma referencia). */
  idempotente: boolean;
  /** Código de la promoción aplicada (`null` si la compra fue sin promoción). */
  promocion_codigo: string | null;
};

/** Superficie del servicio de compra. */
export type ServicioCompra = {
  /** Compra un ticket de forma transaccional. */
  comprar(entrada: EntradaCompra): Promise<ResultadoCompra>;
};

/**
 * Crea el servicio de compra.
 *
 * @param cliente cliente de MongoDB (de él salen las sesiones de transacción).
 * @param repos repositorios de las seis colecciones.
 */
export function crearServicioCompra(cliente: MongoClient, repos: Repositorios): ServicioCompra {
  return {
    async comprar(entrada) {
      const datos = validar(entradaCompraSchema, entrada, "compra");
      const ahora = new Date();
      const session = cliente.startSession();

      let resultado: ResultadoCompra;

      try {
        resultado = await session.withTransaction(() =>
          ejecutarCompra(repos, datos, ahora, session),
        );
      } catch (error) {
        // Carrera de idempotencia: otra compra con la misma referencia ganó y
        // su inserción chocó con el índice único. Esa compra es la válida.
        if (!esClaveDuplicada(error)) {
          throw error;
        }

        const existente = await leerCompraPorReferencia(repos, datos);

        if (!existente) {
          throw error;
        }

        resultado = existente;
      } finally {
        await session.endSession();
      }

      await registrarAuditoria(repos, resultado, ahora);

      return resultado;
    },
  };
}

/**
 * La compra, dentro de la transacción.
 *
 * Las lecturas y las escrituras comparten la sesión: así todas ven el mismo
 * estado y todas se confirman o se deshacen juntas.
 */
async function ejecutarCompra(
  repos: Repositorios,
  entrada: EntradaCompra,
  ahora: Date,
  session: ClientSession,
): Promise<ResultadoCompra> {
  // 1. Idempotencia: si el cargo ya existe, se devuelve la compra ya hecha.
  const previa = await leerCompraPorReferencia(repos, entrada, session);

  if (previa) {
    return previa;
  }

  // 2. El evento y el tipo de ticket que se compra.
  const evento = await repos.eventos.obtenerPorId(entrada.evento_id, { session });

  if (!evento) {
    throw new ErrorCompra("evento_no_encontrado", `El evento ${entrada.evento_id} no existe`);
  }

  if (evento.estado !== "publicado") {
    throw new ErrorCompra("evento_no_vendible", `El evento ${evento.nombre} no está publicado`);
  }

  const tipo = evento.tipos_ticket.find((candidate) => candidate._id === entrada.tipo_ticket_id);

  if (!tipo) {
    throw new ErrorCompra(
      "tipo_ticket_no_encontrado",
      `El tipo de ticket ${entrada.tipo_ticket_id} no pertenece al evento ${evento.nombre}`,
    );
  }

  // 3. La ventana de venta del tipo de ticket.
  const ventana = tipo.restricciones;

  if (ventana.venta_inicio && ahora < ventana.venta_inicio) {
    throw new ErrorCompra("venta_no_iniciada", `La venta de ${tipo.nombre} todavía no ha abierto`);
  }

  if (ventana.venta_fin && ahora > ventana.venta_fin) {
    throw new ErrorCompra("venta_cerrada", `La venta de ${tipo.nombre} ya se cerró`);
  }

  // 4. Quién paga y quién asiste.
  const comprador = await repos.usuarios.obtenerPorId(entrada.usuario_id, { session });

  if (!comprador) {
    throw new ErrorCompra("usuario_no_encontrado", `El usuario ${entrada.usuario_id} no existe`);
  }

  const asistente =
    entrada.asistente_id === entrada.usuario_id
      ? comprador
      : await repos.usuarios.obtenerPorId(entrada.asistente_id, { session });

  if (!asistente) {
    throw new ErrorCompra(
      "usuario_no_encontrado",
      `El asistente ${entrada.asistente_id} no existe`,
    );
  }

  // 5. La promoción (si la pidió el cliente).
  const evaluacion = await evaluarPromocion(evento.promociones, entrada.promocion_codigo, {
    ahora,
    precioBase: tipo.precio_cop,
    tipoTicketId: tipo._id,
    yaComproEsteTipo: () => yaComproEsteTipo(repos, entrada, session),
  });

  // Sin promoción no hay nada que fallar: el motivo viene vacío y el ticket se
  // paga a su precio. Con una promoción pedida que no se puede aplicar, la
  // compra **falla**: no se cobra el precio completo en silencio.
  if (!evaluacion.aplicada && evaluacion.motivo !== null) {
    throw new ErrorCompra("promocion_no_aplica", evaluacion.mensaje);
  }

  const precio = evaluacion.precio;

  // 6. La reserva del cupo: una sola escritura, condicionada al cupo que hay.
  //
  // La condición (el tipo tiene cupo) vive **en el filtro**: si dos compras
  // del último ticket corren a la vez, la que pierde no actualiza nada y la
  // transacción se deshace. El `$` posicional es el del elemento que cumple el
  // `$elemMatch`, así que el incremento cae en el tipo de ticket comprado.
  const reservado = await repos.eventos.actualizarConFiltro(
    {
      _id: toObjectId(entrada.evento_id),
      estado: "publicado",
      tipos_ticket: {
        $elemMatch: {
          _id: toObjectId(tipo._id),
          aforo_vendido: { $lt: tipo.aforo_total },
        },
      },
    },
    {
      $inc: {
        "tipos_ticket.$.aforo_vendido": 1,
        "metricas_evento.tickets_vendidos_total": 1,
        "metricas_evento.ingresos_cop": precio,
      },
      $set: { "metricas_evento.ultima_actualizacion": ahora },
    },
    { session },
  );

  if (!reservado) {
    throw new ErrorCompra("aforo_agotado", `No quedan entradas de ${tipo.nombre}`);
  }

  // 7. El contador de usos de la promoción, también condicionado: si la
  //    promoción se agotó entre la lectura y la escritura, la compra se
  //    deshace y el cupo queda libre.
  if (evaluacion.promocion) {
    const usos = await repos.eventos.actualizarConFiltro(
      {
        _id: toObjectId(entrada.evento_id),
        promociones: {
          $elemMatch: {
            codigo: evaluacion.promocion.codigo,
            ...(evaluacion.promocion.usos_maximos === undefined
              ? {}
              : { usos_realizados: { $lt: evaluacion.promocion.usos_maximos } }),
          },
        },
      },
      { $inc: { "promociones.$.usos_realizados": 1 } },
      { session },
    );

    if (!usos) {
      throw new ErrorCompra(
        "promocion_no_aplica",
        `La promoción ${evaluacion.promocion.codigo} ya no tiene usos disponibles`,
      );
    }
  }

  // 8. El ticket y la transacción: las dos mitades del mismo hecho.
  const ticketId = new ObjectId().toHexString();
  const transaccionId = new ObjectId().toHexString();

  const ticket = validar(
    ticketSchema,
    {
      _id: ticketId,
      codigo_qr: codigoQr(entrada),
      estado: "emitido",
      evento_id: entrada.evento_id,
      comprado_por_usuario_id: entrada.usuario_id,
      snapshot_tipo_ticket: {
        tipo_ticket_id: tipo._id,
        nombre: tipo.nombre,
        precio_cop: tipo.precio_cop,
      },
      asistente_snapshot: {
        usuario_id: asistente._id ?? entrada.asistente_id,
        nombre: asistente.nombre,
        documento_identidad: asistente.documento_identidad,
        email: asistente.email,
      },
      precio_pagado_cop: precio,
      ...(evaluacion.promocion ? { promocion_aplicada_codigo: evaluacion.promocion.codigo } : {}),
      transaccion_id: transaccionId,
      emitido_en: ahora,
      revalidaciones: [],
      _v: 0,
    },
    "ticket",
  );

  const transaccion = validar(
    transaccionSchema,
    {
      _id: transaccionId,
      usuario_id: entrada.usuario_id,
      ticket_id: ticketId,
      monto_cop: precio,
      moneda: "COP",
      metodo_pago: entrada.metodo_pago,
      pasarela: entrada.pasarela,
      estado: "aprobada",
      referencia_pasarela: entrada.referencia_pasarela,
      creada_en: ahora,
      confirmada_en: ahora,
    },
    "transacción",
  );

  await repos.tickets.insertar(ticket, { session });
  await repos.transacciones.insertar(transaccion, { session });

  // 9. Las estadísticas del comprador: también son del sistema.
  await repos.usuarios.actualizarConFiltro(
    { _id: toObjectId(entrada.usuario_id) },
    {
      $inc: {
        "estadisticas.tickets_comprados": 1,
        "estadisticas.ltv_cop": precio,
      },
    },
    { session },
  );

  return {
    ticket,
    transaccion,
    idempotente: false,
    promocion_codigo: evaluacion.promocion?.codigo ?? null,
  };
}

/**
 * Compra viva de una referencia de pasarela.
 *
 * "Viva" es la que representa un cargo pendiente o cobrado: la misma
 * semántica del índice parcial `transacciones_pasarela_referencia_parcial`. Un
 * intento rechazado o anulado no bloquea un reintento con la misma
 * referencia.
 */
async function leerCompraPorReferencia(
  repos: Repositorios,
  entrada: EntradaCompra,
  session?: ClientSession,
): Promise<ResultadoCompra | null> {
  const opciones = session ? { session } : undefined;

  const transaccion = await repos.transacciones.obtenerUno(
    {
      pasarela: entrada.pasarela.trim(),
      referencia_pasarela: entrada.referencia_pasarela.trim(),
      estado: { $in: ["pendiente", "aprobada"] },
    },
    opciones,
  );

  if (!transaccion?._id) {
    return null;
  }

  const ticket = await repos.tickets.obtenerUno(
    { transaccion_id: toObjectId(transaccion._id) },
    opciones,
  );

  if (!ticket) {
    return null;
  }

  return {
    ticket,
    transaccion,
    idempotente: true,
    promocion_codigo: ticket.promocion_aplicada_codigo ?? null,
  };
}

/** Si el comprador ya tiene un ticket de ese tipo en ese evento. */
async function yaComproEsteTipo(
  repos: Repositorios,
  entrada: EntradaCompra,
  session: ClientSession,
): Promise<boolean> {
  const total = await repos.tickets.contar(
    {
      evento_id: toObjectId(entrada.evento_id),
      comprado_por_usuario_id: toObjectId(entrada.usuario_id),
      "snapshot_tipo_ticket.tipo_ticket_id": toObjectId(entrada.tipo_ticket_id),
      estado: { $ne: "anulado" },
    },
    { session },
  );

  return total > 0;
}

/**
 * Código QR del ticket.
 *
 * Se **deriva de la referencia del cargo**: la compra es de un ticket y el
 * cargo es uno, así que el código sale del mismo par que identifica el cargo.
 * Así una compra repetida con la misma referencia produce el mismo código (y
 * el índice único `tickets_codigo_qr_unique` lo protege).
 */
export function codigoQr(entrada: EntradaCompra): string {
  const huella = createHash("sha256")
    .update(`${entrada.pasarela}|${entrada.referencia_pasarela}`)
    .digest("hex")
    .slice(0, 24)
    .toUpperCase();

  return `EVX-${huella}`;
}

/**
 * El rastro de auditoría de la compra, **fuera de la transacción**.
 *
 * El documento 04 §3.6 separa el rastro del tráfico transaccional: la
 * auditoría se escribe cuando la compra ya está confirmada, y si su escritura
 * falla la compra **no** se deshace (el cargo ya ocurrió) pero el fallo queda
 * registrado en el log.
 */
async function registrarAuditoria(
  repos: Repositorios,
  resultado: ResultadoCompra,
  ahora: Date,
): Promise<void> {
  const ticketId = resultado.ticket._id;
  const transaccionId = resultado.transaccion._id;

  if (!ticketId || !transaccionId) {
    logger.warn("La compra no tiene identificadores: no se puede auditar");
    return;
  }

  try {
    const comprador = await repos.usuarios.obtenerPorId(resultado.ticket.comprado_por_usuario_id);

    const auditoria = prepararAuditoria(
      {
        actor_id: resultado.ticket.comprado_por_usuario_id,
        actor_rol: comprador?.tipo_usuario.includes("organizador") ? "organizador" : "asistente",
        accion: "compra.ticket_emitido",
        sujeto_tipo: "ticket",
        sujeto_id: ticketId,
        metadata: {
          evento_id: resultado.ticket.evento_id,
          transaccion_id: transaccionId,
          monto_cop: resultado.transaccion.monto_cop,
          pasarela: resultado.transaccion.pasarela,
          referencia_pasarela: resultado.transaccion.referencia_pasarela,
          ...(resultado.promocion_codigo ? { promocion_codigo: resultado.promocion_codigo } : {}),
        },
      },
      ahora,
    );

    await repos.auditoria.insertar(auditoria);
  } catch (error) {
    logger.error({ err: error }, "No se pudo registrar la auditoría de la compra");
  }
}

/** ¿El error es la violación de un índice único? */
function esClaveDuplicada(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000;
}
