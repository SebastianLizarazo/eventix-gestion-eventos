import { Link } from "react-router-dom";

/** Pantalla de ruta desconocida: evita la pantalla en blanco. */
export function NoEncontrada() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Esa pantalla no existe</h1>
      <p className="mt-2 text-sm text-slate-600">
        La dirección no corresponde a ninguna sección de Eventix.
      </p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
