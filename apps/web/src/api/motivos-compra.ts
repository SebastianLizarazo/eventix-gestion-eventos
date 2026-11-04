/**
 * Diagnóstico de los errores de la compra.
 *
 * La API responde con el formato único de error: `error.codigo` dice **la
 * familia** del fallo (404 `no_encontrado`, 409 `conflicto`, 422 `validacion`)
 * y el motivo exacto viaja en `detalles[0].codigo` —los nueve motivos de
 * `MotivoCompra` y los seis del motor de promociones.
 *
 * La interfaz decide por código y nunca por mensaje (spec S6): el texto puede
 * cambiar sin que nadie avise, el motivo no.
 */

import { esErrorApi } from "./errores";

/** Los nueve motivos por los que una compra no puede concretarse. */
export type MotivoCompra =
  | "evento_no_encontrado"
  | "evento_no_vendible"
  | "tipo_ticket_no_encontrado"
  | "venta_no_iniciada"
  | "venta_cerrada"
  | "usuario_no_encontrado"
  | "promocion_no_aplica"
  | "aforo_agotado"
  | "compra_de_otro_comprador";

/** Los seis motivos por los que una promoción no se puede aplicar. */
export type MotivoPromocion =
  | "inexistente"
  | "inactiva"
  | "fuera_de_vigencia"
  | "usos_agotados"
  | "no_aplica_al_tipo"
  | "2x1_sin_ticket_previo";

/** Cualquier motivo que puede viajar en el detalle de un error de compra. */
export type MotivoErrorCompra = MotivoCompra | MotivoPromocion;

/** La familia del error: el estado con el que responde la API. */
export type FamiliaErrorCompra = "no_encontrado" | "conflicto" | "validacion";

/** Lo que la pantalla necesita saber para explicar el fallo. */
export type DiagnosticoCompra = {
  /** La familia del error. */
  familia: FamiliaErrorCompra;
  /** El motivo exacto, cuando se conoce. */
  motivo: MotivoErrorCompra | null;
  /** El título en español que explica el motivo. */
  titulo: string;
};

/**
 * El título de cada motivo, en español.
 *
 * El título dice **qué pasó**, no lo repite: la API ya manda el mensaje, y lo
 * que la pantalla añade es la razón que un lector entiende sin leer el log
 * del servidor.
 */
const TITULO_MOTIVO: Record<MotivoErrorCompra, string> = {
  evento_no_encontrado: "El evento no existe",
  evento_no_vendible: "El evento no está publicado",
  tipo_ticket_no_encontrado: "El tipo de ticket no pertenece al evento",
  venta_no_iniciada: "La venta de este tipo de ticket todavía no ha abierto",
  venta_cerrada: "La venta de este tipo de ticket ya se cerró",
  usuario_no_encontrado: "El usuario no existe",
  promocion_no_aplica: "La promoción no se puede aplicar",
  aforo_agotado: "No quedan entradas de este tipo de ticket",
  compra_de_otro_comprador: "La referencia ya corresponde a otra compra",
  inexistente: "La promoción no existe",
  inactiva: "La promoción está inactiva",
  fuera_de_vigencia: "La promoción está fuera de su vigencia",
  usos_agotados: "La promoción ya no tiene usos disponibles",
  no_aplica_al_tipo: "La promoción no aplica al tipo de ticket elegido",
  "2x1_sin_ticket_previo": "El 2×1 necesita un ticket previo del mismo tipo",
};

/**
 * El título de cada familia, para cuando el motivo no se conoce.
 *
 * Es el plan B: la API puede mandar un motivo que esta interfaz todavía no
 * conoce (o un detalle de validación de Zod, cuyo código es el de la regla y
 * no el del dominio). En ese caso se explica la familia, que sí se conoce.
 */
const TITULO_FAMILIA: Record<FamiliaErrorCompra, string> = {
  no_encontrado: "No se encontró lo que la compra pedía",
  conflicto: "La compra no se puede concretar",
  validacion: "La compra no es válida",
};

/** Las familias que puede tener un error de compra. */
const FAMILIAS: readonly FamiliaErrorCompra[] = ["no_encontrado", "conflicto", "validacion"];

/** ¿El código es una familia de error de compra? */
function esFamilia(valor: string): valor is FamiliaErrorCompra {
  return (FAMILIAS as readonly string[]).includes(valor);
}

/** ¿El código es un motivo que esta interfaz conoce? */
function esMotivoConocido(valor: string): valor is MotivoErrorCompra {
  return Object.hasOwn(TITULO_MOTIVO, valor);
}

/**
 * Lee el diagnóstico de un error de compra.
 *
 * Devuelve `null` cuando el error no es de la API (un fallo de transporte se
 * explica con su propio aviso) o cuando su código no es una familia de
 * compra: inventar un diagnóstico sería mentirle a quien mira la pantalla.
 */
export function diagnosticoDeCompra(error: unknown): DiagnosticoCompra | null {
  if (!esErrorApi(error)) {
    return null;
  }

  if (!esFamilia(error.codigo)) {
    return null;
  }

  const codigo = error.detalles?.[0]?.codigo;
  const motivo = codigo !== undefined && esMotivoConocido(codigo) ? codigo : null;

  return {
    familia: error.codigo,
    motivo,
    titulo: motivo === null ? TITULO_FAMILIA[error.codigo] : TITULO_MOTIVO[motivo],
  };
}
