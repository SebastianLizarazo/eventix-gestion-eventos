/**
 * Medición de la latencia de las consultas de reporting.
 *
 * El criterio de aceptación del documento 01 §7.1 es que **las cuatro consultas
 * responden en menos de 2 s con el dataset `full`**. Esta módulo mide lo que
 * el cliente espera: el tiempo de la respuesta HTTP completa (ruta, serializac
 * ión y viaje a la base), no solo el trabajo dentro de MongoDB.
 *
 * El percentil se calcula por **rango más cercano** (nearest rank): con pocas
 * iteraciones, un percentil interpolado inventaría valores que nadie midió.
 */

/** Resumen de los tiempos de una consulta. */
export type Medicion = {
  /** Nombre legible de la consulta. */
  nombre: string;
  /** Ruta que se golpeó, con la base ya montada. */
  ruta: string;
  /** Iteraciones medidas (sin contar el calentamiento). */
  iteraciones: number;
  min_ms: number;
  p50_ms: number;
  p95_ms: number;
  max_ms: number;
};

/** Opciones de una medición. */
export type OpcionesMedicion = {
  /** Base HTTP donde vive la API (con el prefijo `/api`). */
  base: string;
  /** Iteraciones medidas por consulta. */
  iteraciones: number;
  /** Iteraciones de calentamiento (no se miden). */
  calentamiento: number;
};

/** Redondea a dos decimales: más precisión no dice nada aquí. */
function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Percentil por rango más cercano.
 *
 * Para `n` valores ordenados, el percentil `p` es el valor en la posición
 * `ceil(p/100 * n)`. Con 20 muestras, el p95 es la 19ª: la segunda más lenta.
 */
export function percentil(valores: readonly number[], percentilBuscado: number): number {
  if (valores.length === 0) {
    return 0;
  }

  const ordenados = [...valores].sort((a, b) => a - b);
  const rango = Math.ceil((percentilBuscado / 100) * ordenados.length);
  const indice = Math.min(Math.max(rango - 1, 0), ordenados.length - 1);

  return ordenados[indice] ?? 0;
}

/** Resume los tiempos medidos de una consulta. */
export function resumir(nombre: string, ruta: string, tiempos: readonly number[]): Medicion {
  return {
    nombre,
    ruta,
    iteraciones: tiempos.length,
    min_ms: tiempos.length === 0 ? 0 : redondear(Math.min(...tiempos)),
    p50_ms: redondear(percentil(tiempos, 50)),
    p95_ms: redondear(percentil(tiempos, 95)),
    max_ms: tiempos.length === 0 ? 0 : redondear(Math.max(...tiempos)),
  };
}

/**
 * Golpea una ruta y se come el cuerpo.
 *
 * El cuerpo se lee entero a propósito: una respuesta que no se consume deja la
 * conexión abierta y la siguiente medición mide el arranque de la conexión,
 * no la consulta.
 */
async function consultar(base: string, ruta: string): Promise<void> {
  const respuesta = await fetch(`${base}${ruta}`);
  const cuerpo = await respuesta.text();

  if (respuesta.status !== 200) {
    throw new Error(`La consulta ${ruta} respondió ${respuesta.status}: ${cuerpo.slice(0, 200)}`);
  }
}

/**
 * Mide una consulta: calienta, mide y devuelve el resumen.
 *
 * El calentamiento importa: la primera petición de una consulta paga el plan
 * de ejecución y el caché de WiredTiger en frío, y no es lo que el operador
 * vive en operación.
 */
export async function medirConsulta(
  nombre: string,
  ruta: string,
  opciones: OpcionesMedicion,
): Promise<Medicion> {
  for (let vuelta = 0; vuelta < opciones.calentamiento; vuelta += 1) {
    await consultar(opciones.base, ruta);
  }

  const tiempos: number[] = [];

  for (let vuelta = 0; vuelta < opciones.iteraciones; vuelta += 1) {
    const inicio = performance.now();
    await consultar(opciones.base, ruta);
    tiempos.push(performance.now() - inicio);
  }

  return resumir(nombre, ruta, tiempos);
}
