import type { Document } from "mongodb";
import type { output, ZodTypeAny } from "zod";
import type { Repositorios } from "../db/repos/index.js";
import { ESTADO_TRANSACCION } from "../domain/schemas/index.js";
import {
  cierreContableSchema,
  dashboardEventoSchema,
  type CierreContable,
  type DashboardEvento,
  type EstadoContable,
  type ResumenEstado,
} from "../domain/schemas/reporting.js";

/**
 * Servicio de reporting: las cuatro consultas operativas del prototipo.
 *
 * Vive **por encima** de los repositorios y no los modifica: los repositorios
 * leen documentos, y el reporting agrega. Por eso las agregaciones viven
 * aquí, sobre la colección que cada repositorio ya tiene abierta, en vez de
 * ampliar la superficie común de `base.ts` para un solo uso.
 *
 * Cada consulta sale de **una lectura** (una `find` o una `aggregate`): el
 * dashboard vive de una sola lectura sobre `eventos` (CB-1) porque el evento
 * embebe sus tipos de ticket y sus métricas.
 */

/** Rango del cierre contable: ambos extremos son inclusivos. */
export type OpcionesCierreContable = {
  desde?: Date;
  hasta?: Date;
};

/**
 * Preferencia de lectura para el reporting.
 *
 * CB-9: en el sistema legado la réplica de lectura estaba infrautilizada
 * porque el reporting se ejecutaba contra el primario. Con un replica set de
 * un solo nodo no hay réplica a la que leer, así que la preferencia **degrada al
 * primario sin error**: deja el camino preparado para cuando haya más nodos,
 * sin inventar una segunda topología.
 */
const PREFERENCIA_LECTURA = "secondaryPreferred" as const;

/** Los cinco estados del cierre, en texto. */
const ESTADOS = new Set<string>(ESTADO_TRANSACCION);

/**
 * Interpreta lo que devolvió una agregación.
 *
 * Si la forma no es la esperada, el fallo es **del servidor**, no del
 * cliente: por eso se lanza un error común (que sale como 500) y no una
 * validación de dominio (que saldría como 422 y culparía a quien pidió el
 * reporte).
 */
function interpretar<T extends ZodTypeAny>(
  esquema: T,
  datos: unknown,
  contexto: string,
): output<T> {
  const resultado = esquema.safeParse(datos);

  if (!resultado.success) {
    throw new Error(`El resultado de ${contexto} no tiene la forma esperada`);
  }

  return resultado.data;
}

/** Porcentaje de ocupación, con dos decimales. */
function porcentaje(parte: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.round((parte / total) * 10_000) / 100;
}

/** Los cinco estados del cierre, en cero. */
function estadosEnCero(): Record<EstadoContable, ResumenEstado> {
  const estados = {} as Record<EstadoContable, ResumenEstado>;

  for (const estado of ESTADO_TRANSACCION) {
    estados[estado] = { cantidad: 0, monto_cop: 0 };
  }

  return estados;
}

/** Fila de la agregación del cierre: un día y un estado. */
type FilaCierre = {
  _id: { dia: string; estado: string };
  cantidad: number;
  monto_cop: number;
};

/**
 * Transacciones que todavía no tienen fecha de confirmación.
 *
 * No son parte de ningún día del cierre, pero el cuadre tiene que poder
 * nombrarlas: un día con más cobros de los que aparecen no cuadra si no se
 * sabe qué quedó en el aire.
 */
async function pendientesSinConfirmar(repos: Repositorios): Promise<ResumenEstado> {
  const pipeline: Document[] = [
    { $match: { estado: "pendiente" } },
    { $group: { _id: null, cantidad: { $sum: 1 }, monto_cop: { $sum: "$monto_cop" } } },
  ];

  const filas = await repos.transacciones.coleccion
    .aggregate<{ cantidad: number; monto_cop: number }>(pipeline, {
      readPreference: PREFERENCIA_LECTURA,
    })
    .toArray();

  const fila = filas[0];

  return { cantidad: fila?.cantidad ?? 0, monto_cop: fila?.monto_cop ?? 0 };
}

/** Crea el servicio de reporting sobre los repositorios de la aplicación. */
export function crearServicioReporting(repos: Repositorios) {
  return {
    /**
     * Dashboard live de un evento.
     *
     * **Una sola lectura**: el documento del evento ya trae los tipos de
     * ticket (con su aforo) y las métricas, así que la ocupación se calcula
     * en memoria. Devuelve `null` si el evento no existe.
     */
    async dashboardDeEvento(eventoId: string): Promise<DashboardEvento | null> {
      const evento = await repos.eventos.obtenerPorId(eventoId);

      if (!evento) {
        return null;
      }

      const tipos_ticket = evento.tipos_ticket.map((tipo) => ({
        tipo_ticket_id: tipo._id,
        nombre: tipo.nombre,
        precio_cop: tipo.precio_cop,
        aforo_total: tipo.aforo_total,
        aforo_vendido: tipo.aforo_vendido,
        ocupacion_pct: porcentaje(tipo.aforo_vendido, tipo.aforo_total),
      }));

      const aforo_total = tipos_ticket.reduce((suma, tipo) => suma + tipo.aforo_total, 0);
      const aforo_vendido = tipos_ticket.reduce((suma, tipo) => suma + tipo.aforo_vendido, 0);

      return interpretar(
        dashboardEventoSchema,
        {
          evento_id: evento._id,
          nombre: evento.nombre,
          slug: evento.slug,
          estado: evento.estado,
          fecha_inicio: evento.fecha_inicio,
          fecha_fin: evento.fecha_fin,
          metricas: {
            tickets_vendidos_total: evento.metricas_evento?.tickets_vendidos_total ?? 0,
            ingresos_cop: evento.metricas_evento?.ingresos_cop ?? 0,
            ultima_actualizacion: evento.metricas_evento?.ultima_actualizacion ?? null,
          },
          tipos_ticket,
          aforo_total,
          aforo_vendido,
          ocupacion_pct: porcentaje(aforo_vendido, aforo_total),
        },
        "el dashboard del evento",
      );
    },

    /**
     * Cierre contable diario.
     *
     * Agrupa las transacciones **confirmadas** por día (en UTC) y por estado.
     * Las pendientes no entran en ningún día —no tienen fecha de
     * confirmación— y salen aparte, para que el cuadre no las mezcle con lo
     * que ya está liquidado.
     */
    async cierreContable(opciones: OpcionesCierreContable): Promise<CierreContable> {
      const desde = opciones.desde;
      const hasta = opciones.hasta;

      const condicion: Record<string, unknown> = { confirmada_en: { $type: "date" } };

      if (desde || hasta) {
        condicion.confirmada_en = {
          $type: "date",
          ...(desde ? { $gte: desde } : {}),
          ...(hasta ? { $lte: hasta } : {}),
        };
      }

      const pipeline: Document[] = [
        { $match: condicion },
        {
          $group: {
            _id: {
              dia: {
                $dateToString: { format: "%Y-%m-%d", date: "$confirmada_en", timezone: "UTC" },
              },
              estado: "$estado",
            },
            cantidad: { $sum: 1 },
            monto_cop: { $sum: "$monto_cop" },
          },
        },
        { $sort: { "_id.dia": 1 } },
      ];

      const [filas, pendientes] = await Promise.all([
        repos.transacciones.coleccion
          .aggregate<FilaCierre>(pipeline, { readPreference: PREFERENCIA_LECTURA })
          .toArray(),
        pendientesSinConfirmar(repos),
      ]);

      const porDia = new Map<string, Record<EstadoContable, ResumenEstado>>();

      for (const fila of filas) {
        const dia = fila._id?.dia;
        const estado = fila._id?.estado;

        // El estado lo restringen el dominio y el validator del servidor: un
        // estado desconocido no puede estar guardado, así que se ignora en
        // vez de inventar uno nuevo.
        if (!dia || !estado || !ESTADOS.has(estado)) {
          continue;
        }

        const delDia = porDia.get(dia) ?? estadosEnCero();
        delDia[estado as EstadoContable].cantidad += fila.cantidad ?? 0;
        delDia[estado as EstadoContable].monto_cop += fila.monto_cop ?? 0;
        porDia.set(dia, delDia);
      }

      const dias = [...porDia.entries()].map(([dia, por_estado]) => ({
        dia,
        por_estado,
        neto_cop: por_estado.aprobada.monto_cop - por_estado.reembolsada.monto_cop,
      }));

      const totales = dias.reduce(
        (acumulado, dia) => ({
          cantidad:
            acumulado.cantidad +
            Object.values(dia.por_estado).reduce((suma, estado) => suma + estado.cantidad, 0),
          monto_cop:
            acumulado.monto_cop +
            Object.values(dia.por_estado).reduce((suma, estado) => suma + estado.monto_cop, 0),
          neto_cop: acumulado.neto_cop + dia.neto_cop,
        }),
        { cantidad: 0, monto_cop: 0, neto_cop: 0 },
      );

      return interpretar(
        cierreContableSchema,
        {
          desde: desde ? desde.toISOString() : null,
          hasta: hasta ? hasta.toISOString() : null,
          dias,
          pendientes_sin_confirmar: pendientes,
          totales,
        },
        "el cierre contable",
      );
    },
  };
}

/** El tipo del servicio, para quien lo consume desde la capa HTTP. */
export type ServicioReporting = ReturnType<typeof crearServicioReporting>;
