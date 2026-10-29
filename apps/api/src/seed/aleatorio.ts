import { createHash } from "node:crypto";

/**
 * Aleatoriedad determinista para el seed.
 *
 * El generador es un PRNG con estado (mulberry32): la **misma semilla produce
 * siempre la misma secuencia**, y una semilla distinta produce otra. No se usa
 * `Math.random()` en ningún punto del seed, porque el criterio de aceptación de
 * S8 es que dos corridas con la misma semilla produzcan el mismo dataset.
 *
 * Cada "namespace" (colección, evento, índice) recibe su propio flujo: el
 * stream de un evento no depende de cuántos eventos se generaron antes, así
 * que el dataset no cambia si el orden de generación cambia.
 */

/** Fuente de números aleatorios reproducible. */
export type Generador = {
  /** Flotante en `[0, 1)`. */
  decimal(): number;
  /** Entero en `[min, max]`, ambos incluidos. */
  entero(min: number, max: number): number;
  /** `true` con la probabilidad indicada. */
  booleano(probabilidad: number): boolean;
  /** Elemento al azar de una lista no vacía. */
  elegir<T>(valores: readonly T[]): T;
};

/** PRNG mulberry32: rápido, sin estado global y con un ciclo largo. */
function mulberry32(semilla: number): () => number {
  let estado = semilla >>> 0;

  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Deriva una semilla numérica de la semilla del seed y un namespace.
 *
 * El namespace se serializa con `JSON.stringify` para que dos combinaciones
 * distintas nunca produzcan la misma cadena (`["a|b"]` y `["a","b"]`).
 */
export function derivarSemilla(semilla: number, ...partes: (string | number)[]): number {
  const resumen = createHash("sha256")
    .update(JSON.stringify([semilla, ...partes]))
    .digest();

  return resumen.readUInt32BE(0);
}

/** Crea un generador reproducible para un namespace concreto. */
export function crearGenerador(semilla: number, ...partes: (string | number)[]): Generador {
  const siguiente = mulberry32(derivarSemilla(semilla, ...partes));

  return {
    decimal: () => siguiente(),
    entero: (min, max) => min + Math.floor(siguiente() * (max - min + 1)),
    booleano: (probabilidad) => siguiente() < probabilidad,
    elegir: <T>(valores: readonly T[]): T => {
      if (valores.length === 0) {
        throw new Error("No se puede elegir un elemento de una lista vacía");
      }

      return valores[Math.floor(siguiente() * valores.length)] as T;
    },
  };
}

/**
 * Identificador estable derivado de la semilla y del namespace.
 *
 * El seed no usa `ObjectId` nativo porque su componente aleatorio haría que
 * dos corridas del seed no coincidieran. El identificador tiene la misma forma
 * (24 hexadecimales) para que el dominio y los índices unique no noten la
 * diferencia.
 */
export function idDeterminista(semilla: number, ...partes: (string | number)[]): string {
  return createHash("sha256")
    .update(JSON.stringify([semilla, ...partes]))
    .digest("hex")
    .slice(0, 24);
}

/** Fecha aleatoria dentro de un intervalo cerrado `[desde, hasta]`. */
export function fechaEnRango(generador: Generador, desde: Date, hasta: Date): Date {
  const inicio = desde.getTime();
  const fin = hasta.getTime();

  return new Date(inicio + Math.floor(generador.decimal() * (fin - inicio + 1)));
}

/** Suma una cantidad de días a una fecha. */
export function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * 86_400_000);
}

/** Suma una cantidad de horas a una fecha. */
export function sumarHoras(fecha: Date, horas: number): Date {
  return new Date(fecha.getTime() + horas * 3_600_000);
}
