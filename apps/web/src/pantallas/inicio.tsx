import { CLAVES, useConteo, useListar, useSalud } from "@/api/hooks";
import type { Evento } from "@/api/tipos";
import { formatearFecha, formatearNumero } from "@/formato/es-co";
import { AvisoError, Cargando, Dato, Tarjeta, Vacio } from "@/ui/piezas";

/**
 * Pantalla de inicio: el estado de la API y el resumen del conjunto de datos.
 *
 * Es la pantalla que el profesor ve primero, así que su trabajo es responder
 * dos preguntas de un vistazo: **¿está vivo el sistema?** (la salud de la API
 * y de MongoDB) y **¿cuánto hay adentro?** (los conteos de las colecciones y
 * los primeros eventos).
 *
 * Los conteos no salen de una consulta aparte: la API devuelve el total de la
 * colección en cada página, así que basta con pedir una página de un
 * elemento para saber cuántos hay.
 */
export function Inicio() {
  const salud = useSalud();
  // Los eventos **publicados** son los que la API todavía no da por terminados:
  // son los que el profesor puede recorrer con datos vivos (aforo, tickets
  // vendidos, ingresos). La lista completa arranca por los más antiguos, que
  // ya se realizaron.
  const eventos = useListar<Evento>(CLAVES.eventos, "/eventos", {
    estado: "publicado",
    limit: 5,
  });
  const conteoEventos = useConteo("eventos");
  const conteoTickets = useConteo("tickets");
  const conteoUsuarios = useConteo("usuarios");
  const conteoTransacciones = useConteo("transacciones");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Resumen de Eventix</h1>
        <p className="mt-1 text-sm text-slate-600">
          El estado de la API y el tamaño del modelo documental, leídos directamente de la base de
          datos.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Tarjeta titulo="Estado de la API">
          {salud.isPending ? (
            <Cargando />
          ) : salud.isError ? (
            <AvisoError error={salud.error} />
          ) : (
            <dl className="divide-y divide-slate-100">
              <Dato
                etiqueta="Estado"
                valor={
                  salud.data.status === "ok" ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      Operativa
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      Degradada
                    </span>
                  )
                }
              />
              <Dato
                etiqueta="MongoDB"
                valor={
                  salud.data.mongo === "up" ? (
                    <span className="text-emerald-700">Conectado</span>
                  ) : (
                    <span className="text-amber-700">Sin conexión</span>
                  )
                }
              />
              <Dato etiqueta="Versión" valor={salud.data.version} />
              <Dato
                etiqueta="Tiempo en marcha"
                valor={`${formatearNumero(Math.floor(salud.data.uptimeSeconds / 60))} min`}
              />
            </dl>
          )}
        </Tarjeta>

        <Tarjeta
          titulo="Colecciones"
          descripcion="Documentos que hay en cada colección del modelo."
          className="lg:col-span-2"
        >
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <Dato etiqueta="Eventos" valor={formatearNumero(conteoEventos.data ?? null)} />
            <Dato etiqueta="Tickets" valor={formatearNumero(conteoTickets.data ?? null)} />
            <Dato etiqueta="Usuarios" valor={formatearNumero(conteoUsuarios.data ?? null)} />
            <Dato
              etiqueta="Transacciones"
              valor={formatearNumero(conteoTransacciones.data ?? null)}
            />
          </dl>
        </Tarjeta>
      </div>

      <Tarjeta
        titulo="Próximos eventos"
        descripcion="Los eventos que la API tiene publicados, ordenados por fecha de inicio."
      >
        {eventos.isPending ? (
          <Cargando />
        ) : eventos.isError ? (
          <AvisoError error={eventos.error} />
        ) : eventos.data.items.length === 0 ? (
          <Vacio texto="No hay eventos en la colección." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Evento
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Tipo
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Estado
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Comienza
                </th>
                <th scope="col" className="py-2 font-medium">
                  Ocupación
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {eventos.data.items.map((evento) => (
                <FilaEvento key={evento._id} evento={evento} />
              ))}
            </tbody>
          </table>
        )}
      </Tarjeta>
    </div>
  );
}

/** Una fila de la tabla de eventos: nombre, tipo, estado, fecha y ocupación. */
function FilaEvento({ evento }: { evento: Evento }) {
  const aforo = ocupacion(evento);
  const porcentaje = aforo.total > 0 ? Math.round((aforo.vendidos / aforo.total) * 100) : 0;

  return (
    <tr>
      <td className="py-3 pr-4 font-medium text-slate-900">{evento.nombre}</td>
      <td className="py-3 pr-4 text-slate-600">{evento.tipo_evento}</td>
      <td className="py-3 pr-4">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
          {evento.estado}
        </span>
      </td>
      <td className="py-3 pr-4 text-slate-600">{formatearFecha(evento.fecha_inicio)}</td>
      <td className="py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${porcentaje}%` }}
            />
          </div>
          <span className="text-xs text-slate-600">
            {formatearNumero(aforo.vendidos)} / {formatearNumero(aforo.total)}
          </span>
        </div>
      </td>
    </tr>
  );
}

/**
 * Aforo total y vendido de un evento.
 *
 * El aforo vive **embebido** en los tipos de ticket del evento, así que la
 * ocupación total es la suma de los aforos de sus tipos: es el mismo dato que
 * la API guarda en `metricas_evento`, pero leído de la fuente.
 */
function ocupacion(evento: Evento): { vendidos: number; total: number } {
  return evento.tipos_ticket.reduce(
    (acumulado, tipo) => ({
      vendidos: acumulado.vendidos + tipo.aforo_vendido,
      total: acumulado.total + tipo.aforo_total,
    }),
    { vendidos: 0, total: 0 },
  );
}
