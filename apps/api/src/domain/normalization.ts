/**
 * Normalización de valores derivados.
 *
 * Estas funciones son la única fuente de verdad de `email_normalizado` y `slug`:
 * los esquemas de dominio validan que el valor almacenado sea coherente con la
 * regla, y los documentos de ejemplo del documento 04 §3 pasan esa validación.
 */

/**
 * Normaliza un correo para usarlo como clave de búsqueda (índice unique).
 *
 * Regla del documento 04 §3.1: en minúsculas y sin puntos. Los puntos se
 * eliminan **solo de la parte local**: los del dominio son parte del nombre de
 * host y deben conservarse (`ana@mail.eventix.test`).
 */
export function normalizeEmail(email: string): string {
  const normalizado = email.trim().toLowerCase();
  const separador = normalizado.lastIndexOf("@");

  if (separador <= 0) {
    return normalizado;
  }

  const local = normalizado.slice(0, separador).replace(/\./g, "");
  const dominio = normalizado.slice(separador + 1);

  return `${local}@${dominio}`;
}

/**
 * Convierte un texto en slug: minúsculas, sin acentos y separadas por guiones.
 *
 * "Rock al Parque 2025" -> "rock-al-parque-2025"
 */
export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
