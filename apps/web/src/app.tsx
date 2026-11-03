/**
 * Raíz de la aplicación.
 *
 * En el Hito 0 (Cimientos) solo se declara el cascarón: el layout, la
 * navegación y la pantalla de inicio llegan en las tareas siguientes del
 * mismo hito.
 */
export function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-8">
      <h1 className="text-3xl font-bold text-slate-900">Eventix</h1>
      <p className="text-slate-600">Interfaz web en construcción.</p>
    </main>
  );
}
