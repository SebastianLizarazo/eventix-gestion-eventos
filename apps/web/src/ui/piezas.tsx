import type { ReactNode } from "react";
import { esErrorApi } from "@/api/errores";

/**
 * Piezas visuales compartidas por todas las pantallas.
 *
 * Viven en un solo lugar porque son la parte de la interfaz que se puede
 * equivocar: el estado de error es donde el código del contrato se vuelve
 * visible (spec S6) y donde el `request_id` permite correlacionar la queja con
 * el log del servidor (spec S7).
 */

/** Tarjeta: la unidad de contenido de la interfaz. */
export function Tarjeta({
  titulo,
  descripcion,
  className,
  children,
}: {
  titulo: string;
  descripcion?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={[
        "rounded-xl border border-slate-200 bg-white p-5 shadow-sm",
        className ?? "",
      ].join(" ")}
    >
      <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
      {descripcion ? <p className="mt-1 text-sm text-slate-600">{descripcion}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Dato con su etiqueta: una fila de la ficha de salud o de un evento. */
export function Dato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="text-sm text-slate-600">{etiqueta}</dt>
      <dd className="text-sm font-medium text-slate-900">{valor}</dd>
    </div>
  );
}

/** Estado de carga: se muestra mientras la pantalla no tiene nada que pintar. */
export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <p role="status" className="py-4 text-sm text-slate-600">
      {texto}
    </p>
  );
}

/** Estado vacío: la consulta funcionó, pero no hay nada que mostrar. */
export function Vacio({ texto }: { texto: string }) {
  return <p className="py-4 text-sm text-slate-600">{texto}</p>;
}

/**
 * Estado de error.
 *
 * Tres cosas se muestran siempre, porque son las que hacen falta para
 * diagnosticar: **qué** falló (el mensaje de la API), **por qué campo** (el
 * detalle por campo, cuando la validación lo trae) y **con qué identificador**
 * (el `request_id`, que es la llave para encontrar la petición en el log del
 * servidor).
 *
 * El error de la API y el fallo de transporte se distinguen: la API faló y
 * hay que corregir la petición; el transporte falló y hay que levantar la API.
 */
export function AvisoError({ error }: { error: unknown }) {
  if (esErrorApi(error)) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-900">{error.message}</p>

        {error.detalles && error.detalles.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {error.detalles.map((detalle) => (
              <li key={`${detalle.campo}: ${detalle.mensaje}`} className="text-sm text-red-800">
                <span className="font-mono font-semibold">{detalle.campo}</span>: {detalle.mensaje}
              </li>
            ))}
          </ul>
        ) : null}

        {error.requestId ? (
          <p className="mt-3 text-xs text-red-700">
            Identificador de la petición: <span className="font-mono">{error.requestId}</span>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">No se pudo hablar con la API</p>
      <p className="mt-1 text-sm text-amber-800">
        {error instanceof Error ? error.message : "Error desconocido"}
      </p>
    </div>
  );
}
