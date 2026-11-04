import { NavLink } from "react-router-dom";

/**
 * Navegación principal de la interfaz.
 *
 * La lista de secciones es **la que existe**: una sección entra en la lista
 * cuando su pantalla existe, no antes. Enseñar un enlace a una pantalla que
 * todavía no está es enseñar un botón roto.
 */

/** Una sección de la interfaz. */
export type Seccion = {
  /** Ruta de la sección. */
  ruta: string;
  /** Texto del enlace. */
  titulo: string;
};

/** Las secciones que la interfaz tiene publicadas. */
export const SECCIONES: Seccion[] = [
  { ruta: "/", titulo: "Inicio" },
  { ruta: "/catalogo", titulo: "Catálogo" },
  { ruta: "/compra", titulo: "Compra" },
  { ruta: "/reportes", titulo: "Reportes" },
  { ruta: "/gestion/eventos", titulo: "Gestión" },
];

/** Barra de navegación. */
export function Navegacion() {
  return (
    <nav aria-label="Secciones de Eventix">
      <ul className="flex flex-wrap items-center gap-1">
        {SECCIONES.map((seccion) => (
          <li key={seccion.ruta}>
            <NavLink
              to={seccion.ruta}
              end
              className={({ isActive }) =>
                [
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-200 hover:text-slate-900",
                ].join(" ")
              }
            >
              {seccion.titulo}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
