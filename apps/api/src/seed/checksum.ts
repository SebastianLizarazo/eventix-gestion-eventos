import { createHash } from "node:crypto";

/**
 * Checksum canónico del dataset.
 *
 * El checksum es la **evidencia de reproducibilidad** del seed (criterio de
 * S8): dos corridas con la misma semilla tienen que producir el mismo
 * checksum, y el script lo imprime para que cualquiera pueda comprobarlo.
 *
 * La serialización es canónica — claves ordenadas, fechas en ISO, campos
 * indefinidos fuera — para que el checksum dependa del **contenido** y no del
 * orden en que el motor construyó el objeto.
 */

/** Convierte un valor a su forma canónica (recursiva). */
function canonizarValor(valor: unknown): unknown {
  if (valor instanceof Date) {
    return valor.toISOString();
  }

  if (Array.isArray(valor)) {
    return valor.map(canonizarValor);
  }

  if (valor !== null && typeof valor === "object") {
    const entradas = Object.entries(valor as Record<string, unknown>)
      .filter(([, interno]) => interno !== undefined)
      .sort(([izquierda], [derecha]) => (izquierda < derecha ? -1 : izquierda > derecha ? 1 : 0));

    return Object.fromEntries(entradas.map(([clave, interno]) => [clave, canonizarValor(interno)]));
  }

  return valor;
}

/** Serializa un valor en su forma canónica. */
export function canonizar(valor: unknown): string {
  return JSON.stringify(canonizarValor(valor));
}

/** Checksum acumulativo de una secuencia de documentos. */
export class Checksum {
  private readonly resumen = createHash("sha256");

  /** Agrega un documento al checksum. */
  agregar(documento: unknown): void {
    this.resumen.update(canonizar(documento));
    this.resumen.update("\n");
  }

  /** Cierra el checksum y devuelve su hexadecimal. */
  finalizar(): string {
    return this.resumen.digest("hex");
  }
}
