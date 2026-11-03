import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app";
import "./index.css";

/**
 * Punto de montaje de la interfaz.
 *
 * El `QueryClient` vive aquí porque es el que comparte el caché de React Query
 * con toda la aplicación: los hooks de datos (Hito 0) leen de él y las
 * mutaciones invalidan lo que corresponde.
 */
const clienteConsultas = new QueryClient({
  defaultOptions: {
    queries: {
      // La demo es local: reintentar automáticamente solo multiplica los
      // errores en pantalla cuando la API no está arriba.
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

const raiz = document.getElementById("raiz");

if (!raiz) {
  throw new Error("No se encontró el elemento #raiz en el documento");
}

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={clienteConsultas}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
