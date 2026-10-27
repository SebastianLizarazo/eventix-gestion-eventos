/**
 * Normalización de valores derivados.
 *
 * `email_normalizado` es un valor **derivado y cerrado**: el esquema de
 * `usuarios` valida que el valor persistido sea exactamente el que produce esta
 * función, porque es la clave del índice unique.
 *
 * `slug` es un valor **derivado por defecto** pero no cerrado: si el evento
 * trae un slug explícito se respeta (una URL comercial puede no derivar del
 * nombre), y el esquema solo valida su formato. La unicidad la garantiza el
 * índice, no el documento.
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
