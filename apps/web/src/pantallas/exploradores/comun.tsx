import type { FiltrosLista } from "@/api/hooks";

/**
 * Lo que las cuatro tablas de solo lectura tienen en común.
 *
 * Los exploradores de usuarios, tickets, transacciones y auditoría se leen
 * igual: un formulario de filtros, una tabla y una paginación. Lo que cambia
 * entre ellos son los campos del filtro —los del contrato de cada colección—,
 * así que lo común vive aquí y lo propio vive en cada pantalla.
 */

/** Las clases del control de filtro: los campos se ven igual. */
export const CONTROL =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none";

/** El botón que aplica el filtro. */
export const BOTON =
  "rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700";

/** El botón que vuelve al estado inicial. */
export const BOTON_SECUNDARIO =
  "rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100";

/**
 * Los filtros aplicados, como parámetros de la query.
 *
 * Los campos vacíos **no viajan**: la API lee los vocabularios cerrados
 * (`estado`, `tipo_usuario`, `actor_rol`, `sujeto_tipo`) y un parámetro vacío
 * sería una petición inválida. «Todos» es la **ausencia** del parámetro, y un
 * texto con espacios tampoco es un filtro: se manda limpio o no se manda.
 */
export function filtrosDeQuery(filtros: Record<string, string>): FiltrosLista {
  const query: FiltrosLista = {};

  for (const [clave, valor] of Object.entries(filtros)) {
    const limpio = valor.trim();

    if (limpio !== "") {
      query[clave] = limpio;
    }
  }

  return query;
}
