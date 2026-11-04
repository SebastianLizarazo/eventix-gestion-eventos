import type { ReactNode } from "react";
import { Tarjeta } from "./piezas";

/**
 * Tablas de solo lectura y su paginación.
 *
 * Las cuatro colecciones que la interfaz explora —usuarios, tickets,
 * transacciones y auditoría— se leen igual: una tabla, un filtro y una
 * página. Esa forma común vive aquí para que las cuatro pantallas no
 * reimplementen la cabecera, el cuerpo y los botones de página.
 *
 * La tabla **no** escribe nada: es la forma de una pantalla que solo lee.
 */

/** Cuántas filas se piden por página en las tablas de solo lectura. */
export const POR_PAGINA = 25;

/** Una columna de la tabla. */
export type ColumnaTabla<T> = {
  /** Título de la columna. */
  titulo: string;
  /** Cómo se dibuja la celda de una fila. */
  render: (fila: T) => ReactNode;
};

/** Propiedades de la tabla. */
export type TablaProps<T> = {
  /** Título de la tarjeta que envuelve la tabla. */
  titulo: string;
  /** Qué explica la tabla, en una línea. */
  descripcion?: string;
  /** Las columnas, en el orden en que se muestran. */
  columnas: ColumnaTabla<T>[];
  /** Las filas de la página a la vista. */
  filas: T[];
  /** La clave estable de cada fila: React la usa para reconciliar. */
  clave: (fila: T) => string;
  /** Qué se dice cuando la consulta funcionó pero no trajo filas. */
  vacio?: string;
};

/**
 * Una tabla de lectura.
 *
 * Cuando no hay filas se dice lo que significa que no haya: **la consulta
 * funcionó** y no encontró nada. No es un error, así que no se presenta como
 * uno.
 */
export function Tabla<T>({ titulo, descripcion, columnas, filas, clave, vacio }: TablaProps<T>) {
  return (
    <Tarjeta titulo={titulo} descripcion={descripcion}>
      {filas.length === 0 ? (
        <p className="py-4 text-sm text-slate-600">{vacio ?? "No hay nada que mostrar"}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                {columnas.map((columna) => (
                  <th key={columna.titulo} scope="col" className="py-2 pr-4 font-medium">
                    {columna.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((fila) => (
                <tr key={clave(fila)}>
                  {columnas.map((columna) => (
                    <td key={columna.titulo} className="py-2 pr-4 align-top text-slate-700">
                      {columna.render(fila)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

/** Propiedades de la paginación. */
export type PaginacionProps = {
  /** De qué colección es la tabla: distingue los botones de dos tablas. */
  etiqueta: string;
  /** La página a la vista, contada desde cero. */
  pagina: number;
  /** Cuántas páginas hay, o `null` si la API no lo dice. */
  paginas: number | null;
  /** Cuántos documentos hay en total, o `null` si la API no lo dice. */
  total: number | null;
  /** Cuántas filas trae la página a la vista. */
  filas: number;
  /** Cuántas filas se piden por página. */
  porPagina?: number;
  /** Cambia de página. */
  onCambio: (pagina: number) => void;
};

/**
 * Los controles de página.
 *
 * El total puede venir `null`: la API cuenta los documentos que cumplen el
 * filtro, y si no lo calculó, la interfaz **no inventa el número**. En ese
 * caso se llega hasta que la página viene incompleta, que es la única señal
 * que hay de que no hay más.
 */
export function Paginacion({
  etiqueta,
  pagina,
  paginas,
  total,
  filas,
  porPagina = POR_PAGINA,
  onCambio,
}: PaginacionProps) {
  const noHayMas = paginas !== null ? pagina + 1 >= paginas : filas < porPagina;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => onCambio(Math.max(0, pagina - 1))}
        disabled={pagina === 0}
        aria-label={`Anterior — ${etiqueta}`}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Anterior
      </button>

      <button
        type="button"
        onClick={() => onCambio(pagina + 1)}
        disabled={noHayMas}
        aria-label={`Siguiente — ${etiqueta}`}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Siguiente
      </button>

      <p className="text-sm text-slate-600">{`Página ${pagina + 1} de ${paginas ?? "—"}`}</p>

      {total !== null ? <p className="text-sm text-slate-600">{`${total} documentos`}</p> : null}
    </div>
  );
}
