import { Outlet } from "react-router-dom";
import { Navegacion } from "./navegacion";

/**
 * Cascarón de la aplicación: encabezado, navegación, contenido y pie.
 *
 * El contenido de cada pantalla entra por el `Outlet` del enrutador, así que
 * el cascarón no se vuelve a montar al cambiar de pantalla: la navegación y el
 * encabezado se quedan quietos.
 */
export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="text-xl font-bold tracking-tight text-slate-900">Eventix</span>
            <span className="text-sm text-slate-500">Gestión de eventos</span>
          </div>
          <Navegacion />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-6 py-4 text-xs text-slate-500">
          Eventix S.A. — Interfaz web sobre la API del prototipo documental.
        </div>
      </footer>
    </div>
  );
}
