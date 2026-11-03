import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { IDS } from "../../domain/fixtures.js";
import { DOCUMENTOS_EJEMPLO } from "../../domain/documentos-ejemplo.js";
import {
  auditoriaABson,
  eventoABson,
  lugarABson,
  ticketABson,
  transaccionABson,
  usuarioABson,
} from "../../../src/db/mapeo.js";
import {
  auditoriaSchema,
  eventoSchema,
  lugarSchema,
  ticketSchema,
  transaccionSchema,
  usuarioSchema,
  type Auditoria,
  type Evento,
  type Lugar,
  type Ticket,
  type Transaccion,
  type Usuario,
} from "../../../src/domain/schemas/index.js";
import { ErrorIdInvalido } from "../../../src/domain/errors.js";
import { validar } from "../../../src/domain/validar.js";

/**
 * Mapper dominio ⟷ BSON (tarea T3.1).
 *
 * El modelo persiste las referencias como `objectId` (documento 04 §3), así que
 * el documento que entrega el dominio no se puede escribir tal cual.
 */

describe("T3.1 · mapper dominio → BSON", () => {
  const usuario = validar(usuarioSchema, DOCUMENTOS_EJEMPLO.usuarios) as Usuario;
  const lugar = validar(lugarSchema, DOCUMENTOS_EJEMPLO.lugares) as Lugar;
  const evento = validar(eventoSchema, DOCUMENTOS_EJEMPLO.eventos) as Evento;
  const ticket = validar(ticketSchema, DOCUMENTOS_EJEMPLO.tickets) as Ticket;
  const transaccion = validar(transaccionSchema, DOCUMENTOS_EJEMPLO.transacciones) as Transaccion;
  const auditoria = validar(auditoriaSchema, DOCUMENTOS_EJEMPLO.auditoria_eventos) as Auditoria;

  it("convierte el _id y las referencias de un evento a ObjectId", () => {
    const bson = eventoABson(evento);

    expect(bson._id).toBeInstanceOf(ObjectId);
    expect(bson._id.toHexString()).toBe(IDS.evento);
    expect(bson.organizador_id).toBeInstanceOf(ObjectId);
    expect(bson.organizador_id.toHexString()).toBe(IDS.usuario);
    expect(bson.lugar_id).toBeInstanceOf(ObjectId);
    expect(bson.lugar_id.toHexString()).toBe(IDS.lugar);
  });

  it("convierte los identificadores embebidos de un evento (tipos de ticket y promociones)", () => {
    const bson = eventoABson(evento);
    const [tipo] = bson.tipos_ticket;
    const [promocion] = bson.promociones;

    expect(tipo?._id).toBeInstanceOf(ObjectId);
    expect(tipo?._id.toHexString()).toBe(IDS.tipoTicket1);
    expect(promocion?.aplica_a_tipo_ticket_ids[0]).toBeInstanceOf(ObjectId);
    expect(promocion?.aplica_a_tipo_ticket_ids[0]?.toHexString()).toBe(IDS.tipoTicket1);
  });

  it("convierte las referencias del snapshot de un ticket", () => {
    const bson = ticketABson(ticket);

    expect(bson.evento_id).toBeInstanceOf(ObjectId);
    expect(bson.comprado_por_usuario_id).toBeInstanceOf(ObjectId);
    expect(bson.snapshot_tipo_ticket.tipo_ticket_id).toBeInstanceOf(ObjectId);
    expect(bson.asistente_snapshot.usuario_id).toBeInstanceOf(ObjectId);
    expect(bson.transaccion_id).toBeInstanceOf(ObjectId);
    expect(bson.transaccion_id.toHexString()).toBe(IDS.transaccion);
  });

  it("convierte las referencias de una transacción y de una auditoría", () => {
    const bsonTransaccion = transaccionABson(transaccion);
    const bsonAuditoria = auditoriaABson(auditoria);

    expect(bsonTransaccion.usuario_id).toBeInstanceOf(ObjectId);
    expect(bsonTransaccion.ticket_id).toBeInstanceOf(ObjectId);
    expect(bsonAuditoria.actor_id).toBeInstanceOf(ObjectId);
    expect(bsonAuditoria.sujeto_id).toBeInstanceOf(ObjectId);
  });

  it("convierte el _id de las colecciones sin referencias", () => {
    expect(usuarioABson(usuario)._id).toBeInstanceOf(ObjectId);
    expect(lugarABson(lugar)._id).toBeInstanceOf(ObjectId);
  });

  it("mantiene las fechas como Date de JavaScript", () => {
    const bson = eventoABson(evento);

    expect(bson.fecha_inicio).toBeInstanceOf(Date);
    expect(bson.fecha_inicio.toISOString()).toBe(evento.fecha_inicio.toISOString());
    expect(bson.creado_en).toBeInstanceOf(Date);
  });

  it("omite las claves cuyo valor es undefined en lugar de mandarlas como null", () => {
    const sinDescripcion = { ...evento };
    delete sinDescripcion.descripcion;
    delete sinDescripcion.metricas_evento;

    const bson = eventoABson(sinDescripcion);

    expect("descripcion" in bson).toBe(false);
    expect("metricas_evento" in bson).toBe(false);
    expect(bson.descripcion).toBeUndefined();
  });

  it("revierte a dominio un documento mapeado a BSON (ida y vuelta estable)", () => {
    const idaYVuelta = validar(eventoSchema, eventoABson(evento), "evento") as Evento;

    expect(idaYVuelta).toEqual(evento);
    expect(idaYVuelta._id).toBe(IDS.evento);
    expect(idaYVuelta.tipos_ticket[0]?._id).toBe(IDS.tipoTicket1);
    expect(idaYVuelta.promociones[0]?.aplica_a_tipo_ticket_ids).toEqual([IDS.tipoTicket1]);
  });

  it("rechaza un identificador que no es hexadecimal válido", () => {
    const invalido = { ...evento, lugar_id: "no-es-un-objectid" };

    expect(() => eventoABson(invalido)).toThrow(ErrorIdInvalido);
  });
});
