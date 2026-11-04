import { useState } from "react";
import { ExploradorAuditoria } from "./auditoria";
import { ExploradorTickets } from "./tickets";
import { ExploradorTransacciones } from "./transacciones";
import { ExploradorUsuarios } from "./usuarios";

/**
 * Los exploradores: las cuatro colecciones de solo lectura del modelo.
 *
 * La interfaz **no escribe** en ninguna de las cuatro (spec S4): usuarios,
 * tickets, transacciones y el rastro de auditoría se consultan en tablas con
 * filtros y paginación, y nada más. Por eso viven en una sola pantalla con un
 * selector: son cuatro lecturas del mismo modelo, y una tabla por colección en
 * páginas distintas obligaría a un menú más para llegar a la misma pregunta.
 *
 * Las cuatro pantallas son autocontenidas —cada una con sus filtros, su tabla
 * y su paginación—, así que aquí solo se decide cuál se ve.
 */

/** Las colecciones que se exploran, en el orden en que se ofrecen. */
const COLECCIONES = [
  { clave: "usuarios", titulo: "Usuarios", panel: ExploradorUsuarios },
  { clave: "tickets", titulo: "Tickets", panel: ExploradorTickets },
  { clave: "transacciones", titulo: "Transacciones", panel: ExploradorTransacciones },
  { clave: "auditoria", titulo: "Auditoría", panel: ExploradorAuditoria },
] as const;

/** La clave de una colección del explorador. */
type ClaveColeccion = (typeof COLECCIONES)[number]["clave"];

/** Los exploradores: el selector de colección y la tabla de la elegida. */
export function Exploradores() {
  const [coleccion, setColeccion] = useState<ClaveColeccion>("usuarios");

  const activa = COLECCIONES.find((opcion) => opcion.clave === coleccion) ?? COLECCIONES[0];
  const Panel = activa.panel;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">Exploradores</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          Las cuatro colecciones de solo lectura del modelo documental: los usuarios, los tickets
          emitidos, los cargos y el rastro de auditoría. Se consultan con los filtros que publica el
          contrato y no admiten ninguna escritura.
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Colección que se explora">
        {COLECCIONES.map((opcion) => {
          const activa = opcion.clave === coleccion;

          return (
            <button
              key={opcion.clave}
              type="button"
              aria-pressed={activa}
              onClick={() => setColeccion(opcion.clave)}
              className={[
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                activa
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 text-slate-700 hover:bg-slate-100",
              ].join(" ")}
            >
              {opcion.titulo}
            </button>
          );
        })}
      </div>

      <Panel />
    </div>
  );
}
