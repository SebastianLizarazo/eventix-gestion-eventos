import { useState } from "react";
import { PanelAsistentes } from "@/pantallas/reportes/asistentes";
import { PanelCierreContable } from "@/pantallas/reportes/cierre-contable";
import { PanelDashboard } from "@/pantallas/reportes/dashboard";
import { PanelRanking } from "@/pantallas/reportes/ranking";
import { Tarjeta } from "@/ui/piezas";
import { SelectorEvento } from "@/ui/selector-evento";

/**
 * Reportes: el tablero del reporting operativo.
 *
 * La API expone cuatro vistas y **no todas son del mismo alcance**: el cierre
 * contable y el ranking son globales, mientras que el dashboard en vivo y la
 * exportación de asistentes son **de un evento**. Por eso el tablero tiene un
 * selector de evento arriba: el que se elige ahí alimenta los dos paneles que
 * son de un evento, y los otros dos no lo necesitan.
 *
 * El evento elegido es estado de esta pantalla y no del `SelectorEvento`: el
 * selector solo avisa del cambio, y los paneles reciben el identificador como
 * una propiedad cualquiera. Así, cambiar el evento no vuelve a dibujar el
 * selector ni pierde lo que el usuario escribió en la búsqueda.
 */
export function Reportes() {
  const [eventoId, setEventoId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Reportes</h1>
        <p className="mt-1 text-sm text-slate-600">
          El dashboard en vivo de un evento y las tres vistas agregadas del modelo: el cierre
          contable, el ranking de los más vendidos y la exportación de asistentes.
        </p>
      </header>

      <Tarjeta
        titulo="Evento del reporte"
        descripcion="El dashboard en vivo y la exportación de asistentes son de un evento: se elige aquí y alimentan los dos."
      >
        <SelectorEvento eventoId={eventoId} onChange={setEventoId} />
      </Tarjeta>

      <PanelDashboard eventoId={eventoId} />

      <PanelCierreContable />

      <PanelRanking />

      <PanelAsistentes eventoId={eventoId} />
    </div>
  );
}
