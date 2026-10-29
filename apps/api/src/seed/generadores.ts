import {
  eventoSchema,
  lugarSchema,
  prepararEvento,
  prepararLugar,
  prepararUsuario,
  usuarioSchema,
  type Evento,
  type Lugar,
  type Usuario,
} from "../domain/schemas/index.js";
import { datosUsuario, type Plan } from "./plan.js";
import type { DocumentoConId } from "../db/mapeo.js";

/**
 * Generación de documentos del seed a partir del plan.
 *
 * Los documentos se validan **contra el dominio** antes de devolverse: el seed
 * no puede escribir en la base algo que la API no aceptaría, así que un error
 * de generación falla aquí y no como un `Document failed validation` del
 * servidor.
 *
 * Todos los documentos se construyen con las funciones `preparar*` del dominio
 * (que derivan `email_normalizado`, `slug` y las marcas de tiempo) para no
 * duplicar esas reglas fuera de su sitio.
 */

/** Fecha base de creación: fija, para que el dataset sea reproducible. */
const FECHA_CREACION_BASE = new Date("2022-06-01T00:00:00.000Z");

/** Genera los lugares del dataset. */
export function generarLugares(plan: Plan): Lugar[] {
  return plan.lugares.map((lugar) =>
    lugarSchema.parse({
      ...prepararLugar(
        {
          nombre: lugar.nombre,
          direccion: lugar.direccion,
          ciudad: lugar.ciudad,
          pais: lugar.pais,
          capacidad_total: lugar.capacidad_total,
          geometria: lugar.geometria,
          salas: lugar.salas,
          activo: lugar.activo,
        },
        lugar.creado_en,
      ),
      _id: lugar.id,
    }),
  );
}

/** Genera los usuarios del dataset, con sus estadísticas ya contabilizadas. */
export function generarUsuarios(plan: Plan): Usuario[] {
  const usuarios: Usuario[] = [];

  for (let indice = 0; indice < plan.volumenes.usuarios; indice += 1) {
    const datos = datosUsuario(plan.semilla, indice, plan.nOrganizadores);
    const tickets = plan.ticketsPorUsuario[indice] ?? 0;

    const usuario = prepararUsuario(
      {
        email: datos.email,
        nombre: datos.nombre,
        telefono: datos.telefono,
        documento_identidad: datos.documento_identidad,
        tipo_usuario: datos.es_organizador ? ["asistente", "organizador"] : ["asistente"],
        fecha_nacimiento: datos.fecha_nacimiento,
        preferencias: {
          newsletter: indice % 3 === 0,
          idioma: "es-CO",
          canal_notif: indice % 4 === 0 ? ["email"] : [],
        },
        estadisticas: {
          eventos_asistidos: tickets > 0 ? 1 : 0,
          tickets_comprados: tickets,
          ltv_cop: plan.ingresosPorUsuario[indice] ?? 0,
        },
      },
      new Date(FECHA_CREACION_BASE.getTime() + indice * 60_000),
    );

    usuarios.push(usuarioSchema.parse({ ...usuario, _id: datos.id }));
  }

  return usuarios;
}

/** Genera los eventos del dataset, con sus contadores ya contabilizados. */
export function generarEventos(plan: Plan): Evento[] {
  return plan.eventos.map((evento) => {
    const creadoEn = new Date(FECHA_CREACION_BASE.getTime() + evento.indice * 3_600_000);

    const preparado = prepararEvento(
      {
        slug: evento.slug,
        nombre: evento.nombre,
        tipo_evento: evento.tipo_evento,
        descripcion: evento.descripcion,
        fecha_inicio: evento.fecha_inicio,
        fecha_fin: evento.fecha_fin,
        estado: evento.estado,
        visibilidad: evento.visibilidad,
        organizador_id: evento.organizador_id,
        lugar_id: evento.lugar_id,
        categorias: evento.categorias,
        configuracion_evento: evento.configuracion,
        tipos_ticket: evento.tipos.map((tipo) => ({
          _id: tipo.id,
          nombre: tipo.nombre,
          precio_cop: tipo.precio_cop,
          aforo_total: tipo.aforo_total,
          aforo_vendido: tipo.aforo_vendido,
          restricciones: tipo.restricciones,
        })),
        promociones: evento.promociones.map((promocion) => ({
          codigo: promocion.codigo,
          tipo: promocion.tipo,
          valor: promocion.valor,
          aplica_a_tipo_ticket_ids: promocion.aplica_a_tipo_ticket_ids,
          vigencia_inicio: promocion.vigencia_inicio,
          vigencia_fin: promocion.vigencia_fin,
          usos_maximos: promocion.usos_maximos,
          usos_realizados: promocion.usos_realizados,
          activo: promocion.activo,
        })),
        metricas_evento: {
          tickets_vendidos_total: evento.ticketsVendidos,
          ingresos_cop: evento.ingresos_cop,
          ultima_actualizacion: creadoEn,
        },
        tags: evento.tags,
      },
      creadoEn,
    );

    return eventoSchema.parse({ ...preparado, _id: evento.id });
  });
}
