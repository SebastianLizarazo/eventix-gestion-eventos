/**
 * Errores tipados del dominio.
 *
 * La capa de aplicación lanza estas excepciones; el middleware de errores de la
 * capa HTTP las traduce a un formato único. Cada error lleva un `codigo` estable
 * para que el contrato de error no dependa del texto del mensaje.
 */

/** Error base del dominio. */
export class ErrorDominio extends Error {
  readonly codigo: string;

  constructor(codigo: string, mensaje: string) {
    super(mensaje);
    this.name = new.target.name;
    this.codigo = codigo;
  }
}

/** Detalle de un campo que incumplió una regla de validación. */
export type CampoError = {
  /** Ruta del campo dentro del documento (ej. `tipos_ticket.0.aforo_vendido`). */
  campo: string;
  /** Mensaje legible de la regla incumplida. */
  mensaje: string;
  /** Código de la regla (mismo vocabulario que Zod). */
  codigo?: string;
};

/** Fallo de validación de esquema o de regla de negocio, con detalle por campo. */
export class ErrorValidacion extends ErrorDominio {
  readonly campos: CampoError[];

  constructor(campos: CampoError[], mensaje = "La validación falló") {
    super("VALIDACION", mensaje);
    this.campos = campos;
  }

  /** Devuelve el primer error asociado a un campo, si existe. */
  campo(nombre: string): CampoError | undefined {
    return this.campos.find((campo) => campo.campo === nombre);
  }
}

/** Valor que no puede convertirse a un ObjectId de MongoDB. */
export class ErrorIdInvalido extends ErrorDominio {
  readonly valor: string;

  constructor(valor: string, tipo = "ObjectId") {
    super("ID_INVALIDO", `Valor inválido para ${tipo}: ${valor}`);
    this.valor = valor;
  }
}

/**
 * Motivos por los que una compra no puede concretarse.
 *
 * Son **vocabulario estable**: el cliente decide con el motivo, no leyendo el
 * mensaje. La capa HTTP los traduce a su estado cuando exista el endpoint de
 * compra; mientras tanto son el contrato del servicio.
 */
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

/**
 * Error del flujo de compra: una regla de negocio impide concretarla.
 *
 * La compra se resuelve **dentro de una transacción**: cuando esta excepción
 * sale de la transacción, no queda ticket, ni transacción, ni cupo consumido.
 */
export class ErrorCompra extends ErrorDominio {
  readonly motivo: MotivoCompra;
  /**
   * Detalle opcional con el motivo **más específico** del fallo.
   *
   * El motivo dice qué paso ("la promoción no aplica"); el detalle dice
   * exactamente cuál ("se agotaron sus usos"). La capa HTTP lleva el detalle
   * al cliente en `detalles[0].codigo`, que es donde el cliente decide.
   */
  readonly detalle?: CampoError;

  constructor(motivo: MotivoCompra, mensaje: string, detalle?: CampoError) {
    super(motivo, mensaje);
    this.motivo = motivo;
    this.detalle = detalle;
  }
}
