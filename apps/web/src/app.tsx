import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Catalogo } from "@/pantallas/catalogo";
import { Evento } from "@/pantallas/evento";
import { Inicio } from "@/pantallas/inicio";
import { NoEncontrada } from "@/pantallas/no-encontrada";
import { Reportes } from "@/pantallas/reportes";
import { Layout } from "@/ui/layout";

/**
 * Raíz de la aplicación: el enrutador y las pantallas que ya existen.
 *
 * El enrutador es la pieza que H0 deja lista para todas las pantallas del
 * roadmap: cada hito publica su sección en la navegación y la registra aquí.
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Inicio />} />
          <Route path="/catalogo" element={<Catalogo />} />
          <Route path="/eventos/:id" element={<Evento />} />
          <Route path="/reportes" element={<Reportes />} />
          <Route path="*" element={<NoEncontrada />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
