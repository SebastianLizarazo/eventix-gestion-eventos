import { useDashboardEvento } from "@/api/hooks";
import type { DashboardEvento } from "@/api/tipos";
import {
  formatearFechaHora,
  formatearMoneda,
  formatearNumero,
  formatearPorcentaje,
} from "@/formato/es-co";
import { DistintivoEstado } from "@/ui/distintivos";
import { AvisoError, Cargando, Dato, Tarjeta, Vacio } from "@/ui/piezas";

/**
 * Panel del dashboard en vivo de un evento.
 *
 * Es la primera de las cuatro vistas de reporte (spec S3), y la única que se
 * resuelve con **una sola lectura**: la API devuelve el evento con sus tipos
 * de ticket y sus métricas ya agregados, así que la interfaz no une nada ni
 * calcula una ocupación que no venga hecha.
 *
 * Tres decisiones que conviene tener presentes:
 *
 * - **Sin evento no hay consulta.** El identificador lo elige el tablero de
 *   reportes; mientras no haya uno, la consulta queda apagada y el panel pide
 *   un evento en vez de mostrar un dashboard vacío que parece real.
 * - **Los porcentajes son de la API.** `ocupacion_pct` llega con dos decimales
 *   y se formatea con el locale `es-CO`: la coma decimal es del locale, no un
 *   error de la pantalla.
 * - **`ultima_actualizacion` es un dato ausente, no un error.** Cuando el
 *   evento todavía no tiene métricas calculadas, la API devuelve `null` y se
 *   muestra "—": el formateador ya sabe ese caso, así que no hace falta
 *   decidirlo aquí.
 */
export function PanelDashboard({ eventoId }: { eventoId: string | null }) {
  const dashboard = useDashboardEvento(eventoId);

  // Sin evento elegido no hay nada que consultar: la consulta está apagada y
  // el panel pide uno, en vez de pintar un dashboard que no existe.
  if (eventoId === null) {
    return <Vacio texto="Elige un evento para ver su dashboard en vivo" />;
  }

  if (dashboard.isPending) {
    return <Cargando />;
  }

  // El error lo muestra la pieza compartida, que ya sabe distinguir el fallo de
  // la API del fallo del transporte por el código del contrato.
  if (dashboard.isError) {
    return <AvisoError error={dashboard.error} />;
  }

  const datos = dashboard.data;

  return (
    <div className="space-y-6">
      <Tarjeta
        titulo="Dashboard en vivo"
        descripcion="Las métricas del evento, tal como las tiene el sistema ahora mismo."
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-slate-900">{datos.nombre}</h3>
          <DistintivoEstado estado={datos.estado} />
        </div>

        <dl className="mt-4 divide-y divide-slate-100">
          <Dato
            etiqueta="Tickets vendidos"
            valor={formatearNumero(datos.metricas.tickets_vendidos_total)}
          />
          <Dato etiqueta="Ingresos" valor={formatearMoneda(datos.metricas.ingresos_cop)} />
          <Dato etiqueta="Ocupación total" valor={formatearPorcentaje(datos.ocupacion_pct)} />
          <Dato
            etiqueta="Aforo"
            valor={`${formatearNumero(datos.aforo_vendido)} / ${formatearNumero(datos.aforo_total)}`}
          />
          <Dato etiqueta="Comienza" valor={formatearFechaHora(datos.fecha_inicio)} />
          <Dato etiqueta="Termina" valor={formatearFechaHora(datos.fecha_fin)} />
          <Dato
            etiqueta="Última actualización"
            valor={formatearFechaHora(datos.metricas.ultima_actualizacion)}
          />
        </dl>
      </Tarjeta>

      <Tarjeta
        titulo="Ocupación por tipo de ticket"
        descripcion="Lo vendido de cada tipo de ticket, con su precio y su ocupación."
      >
        {datos.tipos_ticket.length === 0 ? (
          <Vacio texto="Este evento todavía no tiene tipos de ticket." />
        ) : (
          <TablaOcupacion tipos={datos.tipos_ticket} />
        )}
      </Tarjeta>
    </div>
  );
}

/** Propiedades de la tabla de ocupación. */
type TablaOcupacionProps = {
  tipos: DashboardEvento["tipos_ticket"];
};

/**
 * La tabla con la ocupación de cada tipo de ticket.
 *
 * Son datos de la API: el nombre, el precio, lo vendido sobre lo que había y
 * el porcentaje que la API calculó. La interfaz no recalcula ninguno.
 */
function TablaOcupacion({ tipos }: TablaOcupacionProps) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <th scope="col" className="py-2 pr-4 font-medium">
            Tipo de ticket
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Precio
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Vendidos / total
          </th>
          <th scope="col" className="py-2 font-medium">
            Ocupación
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {tipos.map((tipo) => (
          <tr key={tipo.tipo_ticket_id}>
            <td className="py-3 pr-4 font-medium text-slate-900">{tipo.nombre}</td>
            <td className="py-3 pr-4 text-slate-600">{formatearMoneda(tipo.precio_cop)}</td>
            <td className="py-3 pr-4 text-slate-600">
              {`${formatearNumero(tipo.aforo_vendido)} / ${formatearNumero(tipo.aforo_total)}`}
            </td>
            <td className="py-3 text-slate-600">{formatearPorcentaje(tipo.ocupacion_pct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
