import { normalizarCodigo } from "../domain/normalization.js";
import type { Promocion } from "../domain/schemas/index.js";

/**
 * Motor de promociones (spec S9, tarea T6.2).
 *
 * Decide **si una promoción se aplica a una compra** y **cuánto paga el
 * ticket**. Las reglas que decide son las del documento 04 §3.3:
 *
 * 1. **La promoción tiene que existir** en el evento y tener ese código.
 * 2. **Tiene que estar activa** y dentro de su ventana de vigencia.
 * 3. **Tiene que tener usos disponibles**: `usos_maximos` es el tope y
 *    `usos_realizados` el contador que lleva el sistema.
 * 4. **Tiene que aplicar al tipo de ticket** que se compra
 *    (`aplica_a_tipo_ticket_ids`).
 * 5. El **precio** depende del tipo: `porcentaje` y `early_bird` descuentan un
 *    porcentaje, y `2x1` deja el ticket gratis.
 *
 * Cuando el cliente pide una promoción y esta no se puede aplicar, la
 * evaluación **falla**: no se cobra el precio completo en silencio. Un ticket
 * comprado sin promoción se compra sin Promotion (sin `promocion_codigo`).
 */

/** Motivos por los que una promoción no se aplica. */
export type MotivoPromocion =
  | "inexistente"
  | "inactiva"
  | "fuera_de_vigencia"
  | "usos_agotados"
  | "no_aplica_al_tipo"
  | "2x1_sin_ticket_previo";

/** Contexto de la evaluación: qué se está comprando y cuándo. */
export type ContextoPromocion = {
  /** Momento de la compra (el reloj del servidor). */
  ahora: Date;
  /** Precio del tipo de ticket antes de la promoción. */
  precioBase: number;
  /** Tipo de ticket que se compra. */
  tipoTicketId: string;
  /**
   * Si el comprador ya tiene un ticket de ese tipo en ese evento.
   *
   * Solo lo necesita el `2x1` (el segundo ticket de la pareja es el gratis),
   * así que es una consulta **perezosa**: no se hace si no hay una `2x1` en
   * juego.
   */
  yaComproEsteTipo: () => Promise<boolean>;
};

/** Resultado de evaluar una promoción. */
export type EvaluacionPromocion = {
  /** Si la promoción se aplica a esta compra. */
  aplicada: boolean;
  /** Motivo de la no aplicación (`null` cuando sí se aplica). */
  motivo: MotivoPromocion | null;
  /** Mensaje legible, para el error y para el registro. */
  mensaje: string;
  /** Precio final del ticket. */
  precio: number;
  /** La promoción aplicada (`null` cuando no se aplica). */
  promocion: Promocion | null;
};

/** Compra sin promoción: se paga el precio del tipo de ticket. */
function sinPromocion(precioBase: number, mensaje: string): EvaluacionPromocion {
  return { aplicada: false, motivo: null, mensaje, precio: precioBase, promocion: null };
}

/** La promoción no se puede aplicar: se explica por qué. */
function noAplica(
  motivo: MotivoPromocion,
  mensaje: string,
  precioBase: number,
): EvaluacionPromocion {
  return { aplicada: false, motivo, mensaje, precio: precioBase, promocion: null };
}

/**
 * Evalúa la promoción de una compra.
 *
 * @param promociones promociones embebidas en el evento.
 * @param codigo código pedido por el cliente (opcional).
 * @param contexto qué se compra y cuándo.
 */
export async function evaluarPromocion(
  promociones: readonly Promocion[],
  codigo: string | undefined,
  contexto: ContextoPromocion,
): Promise<EvaluacionPromocion> {
  const { ahora, precioBase, tipoTicketId } = contexto;

  if (codigo === undefined || codigo.length === 0) {
    return sinPromocion(precioBase, "La compra se realiza sin promoción");
  }

  const buscada = normalizarCodigo(codigo);
  const promocion = promociones.find((candidate) => candidate.codigo === buscada);

  if (!promocion) {
    return noAplica("inexistente", `La promoción ${buscada} no existe en este evento`, precioBase);
  }

  if (!promocion.activo) {
    return noAplica("inactiva", `La promoción ${promocion.codigo} no está activa`, precioBase);
  }

  if (ahora < promocion.vigencia_inicio || ahora > promocion.vigencia_fin) {
    return noAplica(
      "fuera_de_vigencia",
      `La promoción ${promocion.codigo} no está vigente`,
      precioBase,
    );
  }

  if (promocion.usos_maximos !== undefined && promocion.usos_realizados >= promocion.usos_maximos) {
    return noAplica(
      "usos_agotados",
      `La promoción ${promocion.codigo} ya agotó sus usos`,
      precioBase,
    );
  }

  if (!promocion.aplica_a_tipo_ticket_ids.includes(tipoTicketId)) {
    return noAplica(
      "no_aplica_al_tipo",
      `La promoción ${promocion.codigo} no aplica al tipo de ticket comprado`,
      precioBase,
    );
  }

  // `2x1`: el segundo ticket de la pareja se paga gratis. La pareja es del
  // mismo comprador, del mismo tipo y del mismo evento.
  if (promocion.tipo === "2x1") {
    if (!(await contexto.yaComproEsteTipo())) {
      return noAplica(
        "2x1_sin_ticket_previo",
        `La promoción ${promocion.codigo} aplica desde el segundo ticket del mismo tipo`,
        precioBase,
      );
    }

    return {
      aplicada: true,
      motivo: null,
      mensaje: `Promoción ${promocion.codigo} aplicada (2x1)`,
      precio: 0,
      promocion,
    };
  }

  // `porcentaje` y `early_bird`: los dos descuentan un porcentaje. Se
  // diferencia el `early_bird` por su ventana de vigencia y por su cupo de
  // usos, no por la cuenta.
  const precio = Math.round((precioBase * (100 - promocion.valor)) / 100);

  return {
    aplicada: true,
    motivo: null,
    mensaje: `Promoción ${promocion.codigo} aplicada`,
    precio,
    promocion,
  };
}
