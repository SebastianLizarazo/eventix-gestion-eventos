import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useCierreContable } from "@/api/hooks";
import type { CierreContable, EstadoContable } from "@/api/tipos";
import { formatearFecha, formatearMoneda, formatearNumero } from "@/formato/es-co";
import { ETIQUETA_ESTADO_CONTABLE } from "@/formato/vocabularios";
import { AvisoError, Cargando, Dato, Tarjeta, Vacio } from "@/ui/piezas";

/**
 * Panel de cierre contable diario.
 *
 * El cierre es una vista de la API: no es un documento que la interfaz pueda
 * construir, así que todo lo que se muestra sale de `GET /api/reportes/
 * cierre-contable` y nada se calcula aquí.
 *
 * Cuatro decisiones que conviene tener presentes:
 *
 * - **El borrador y el rango aplicado son estados distintos.** Escribir en una
 *   fecha no dispara peticiones: el rango se consulta al pulsar «Aplicar». Si
 *   no, cada cambio de día sería una consulta a la API.
 * - **Las fechas vacías no viajan.** El rango se manda con lo que se escribió;
 *   un campo sin escribir es ausencia de filtro, no una fecha inventada.
 * - **La tabla se pagina en la pantalla.** La API devuelve todos los días del
 *   rango de una sola vez, así que el corte de 30 en 30 es de la tabla.
 * - **Los cinco estados se iteran siempre.** El contrato es cerrado: los cinco
 *   estados vienen aunque valgan cero, así que la tabla tiene siempre las
 *   mismas columnas y no se deducen de los datos.
 * - **El neto puede ser negativo.** Un día con más devoluciones que cobros
 *   cierra en rojo, y esconder el signo mentiría sobre el cuadre.
 */

/**
 * Los estados contables, en el orden en que se muestran.
 *
 * El orden es fijo y no se deduce de los datos: el contrato garantiza los
 * cinco estados, aunque valgan cero, así que la columna de un estado no puede
 * aparecer y desaparecer según el día.
 */
const ESTADOS_CONTABLES: readonly EstadoContable[] = [
  "pendiente",
  "aprobada",
  "rechazada",
  "anulada",
  "reembolsada",
];

/**
 * Días por página: el tamaño con el que la tabla del cierre se pagina.
 *
 * La API devuelve **todos** los días del rango en una sola respuesta —no
 * pagina—, así que la paginación es de la pantalla: la tabla muestra 30 días
 * por página de los que vinieron. Con el dataset completo son 434 días, y
 * pintarlos todos de una vez es una tabla que no se puede recorrer.
 */
const POR_PAGINA = 30;

/** El rango que se escribe en el formulario. */
type Rango = { desde: string; hasta: string };

/**
 * El rango que se consulta.
 *
 * Un límite sin escribir es `undefined` y no una cadena vacía: el cliente
 * HTTP no manda los parámetros vacíos, así que «sin filtro» y «filtrado por
 * la cadena vacía» no pueden confundirse.
 */
type RangoAplicado = { desde?: string; hasta?: string };

/** El rango inicial: sin filtro, que es lo que significa no escribir nada. */
const RANGO_INICIAL: Rango = { desde: "", hasta: "" };

/** Las clases del control de formulario: los dos campos se ven igual. */
const CONTROL =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none";

/** Pantalla del cierre contable: filtros, tabla por día, totales y pendientes. */
export function PanelCierreContable() {
  // Lo que el usuario está escribiendo, que todavía no se ha aplicado.
  const [borrador, setBorrador] = useState<Rango>(RANGO_INICIAL);
  // Lo que la API tiene que responder.
  const [aplicados, setAplicados] = useState<RangoAplicado>({});
  // La página de la tabla: son días de la respuesta, no documentos de la API.
  const [pagina, setPagina] = useState(1);

  const cierre = useCierreContable(aplicados);
  const datos = cierre.isSuccess ? cierre.data : null;

  /**
   * Cuántas páginas tiene la tabla y cuál se está viendo.
   *
   * La página se **acota** al total: si el rango se encoge (o la respuesta
   * llega con menos días), la pantalla no se queda en una página que ya no
   * existe y con la tabla vacía.
   */
  const totalPaginas = datos === null ? 1 : Math.max(1, Math.ceil(datos.dias.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const diasDeLaPagina =
    datos === null
      ? []
      : datos.dias.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA);

  /** Cambia un límite del borrador: todavía no consulta nada. */
  function cambiar(campo: keyof Rango) {
    return (evento: ChangeEvent<HTMLInputElement>) => {
      setBorrador((actual) => ({ ...actual, [campo]: evento.target.value }));
    };
  }

  /** Aplica el rango del borrador: lo escrito pasa a ser lo consultado. */
  function aplicar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    setAplicados({
      desde: borrador.desde === "" ? undefined : borrador.desde,
      hasta: borrador.hasta === "" ? undefined : borrador.hasta,
    });

    // Un rango nuevo es otra serie: la tabla vuelve a su primera página.
    setPagina(1);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Cierre contable diario</h1>
        <p className="mt-1 text-sm text-slate-600">
          Las transacciones confirmadas, agrupadas por día y por estado contable.
        </p>
      </header>

      <Tarjeta
        titulo="Rango"
        descripcion="El rango se aplica al pulsar «Aplicar». Sin fechas, el cierre muestra todos los días."
      >
        <form onSubmit={aplicar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo id="cierre-desde" etiqueta="Desde">
              <input
                id="cierre-desde"
                type="date"
                value={borrador.desde}
                onChange={cambiar("desde")}
                className={CONTROL}
              />
            </Campo>

            <Campo id="cierre-hasta" etiqueta="Hasta">
              <input
                id="cierre-hasta"
                type="date"
                value={borrador.hasta}
                onChange={cambiar("hasta")}
                className={CONTROL}
              />
            </Campo>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Aplicar
            </button>
          </div>
        </form>
      </Tarjeta>

      <Tarjeta
        titulo="Cierre por día"
        descripcion="Cada día trae los cinco estados y su neto: lo aprobado menos lo reembolsado."
      >
        {cierre.isPending ? (
          <Cargando />
        ) : cierre.isError ? (
          <AvisoError error={cierre.error} />
        ) : datos === null ? null : (
          <>
            <p className="mb-4 text-sm text-slate-600">
              Rango aplicado:{" "}
              <span className="font-medium text-slate-900">{rangoAplicado(datos)}</span>
            </p>

            {datos.dias.length === 0 ? (
              <Vacio texto="No hay transacciones confirmadas en el rango" />
            ) : (
              <>
                <TablaCierre dias={diasDeLaPagina} />

                <nav
                  aria-label="Paginación del cierre contable"
                  className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"
                >
                  <p className="text-sm text-slate-600">
                    Página {paginaActual} de {totalPaginas}
                  </p>
                  <p className="text-sm text-slate-600">
                    {formatearNumero(datos.dias.length)} días
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPagina(paginaActual - 1)}
                      disabled={paginaActual === 1}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => setPagina(paginaActual + 1)}
                      disabled={paginaActual === totalPaginas}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Siguiente
                    </button>
                  </div>
                </nav>
              </>
            )}
          </>
        )}
      </Tarjeta>

      {datos === null ? null : (
        <>
          <Tarjeta titulo="Totales del rango" descripcion="La suma de los días mostrados.">
            <dl className="divide-y divide-slate-100">
              <Dato etiqueta="Transacciones" valor={formatearNumero(datos.totales.cantidad)} />
              <Dato etiqueta="Monto" valor={formatearMoneda(datos.totales.monto_cop)} />
              <Dato etiqueta="Neto" valor={formatearMoneda(datos.totales.neto_cop)} />
            </dl>
          </Tarjeta>

          <Tarjeta
            titulo="Pendientes sin confirmar"
            descripcion="Las transacciones que todavía no tienen fecha de confirmación: por eso no pertenecen a ningún día."
          >
            <dl className="divide-y divide-slate-100">
              <Dato
                etiqueta="Transacciones"
                valor={formatearNumero(datos.pendientes_sin_confirmar.cantidad)}
              />
              <Dato
                etiqueta="Monto"
                valor={formatearMoneda(datos.pendientes_sin_confirmar.monto_cop)}
              />
            </dl>
          </Tarjeta>
        </>
      )}
    </div>
  );
}

/**
 * La tabla del cierre: una fila por día y una columna por estado.
 *
 * Recibe **los días de la página que se está viendo**, no todos los del rango:
 * el corte lo hace quien la dibuja.
 *
 * Los cinco estados se iteran siempre, en el orden del contrato, así que las
 * columnas no dependen de lo que vino en la respuesta.
 */
function TablaCierre({ dias }: { dias: CierreContable["dias"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Día
            </th>
            {ESTADOS_CONTABLES.map((estado) => (
              <th key={estado} scope="col" className="px-3 py-2 text-right font-medium">
                {ETIQUETA_ESTADO_CONTABLE[estado]}
              </th>
            ))}
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Neto
            </th>
          </tr>
        </thead>

        <tbody>
          {dias.map((dia) => (
            <tr key={dia.dia} className="border-b border-slate-100">
              <th scope="row" className="px-3 py-2 text-left font-medium text-slate-900">
                {formatearFecha(dia.dia)}
              </th>

              {ESTADOS_CONTABLES.map((estado) => {
                // El contrato garantiza los cinco estados; el valor por
                // defecto evita que una respuesta incompleta rompa la tabla.
                const resumen = dia.por_estado[estado] ?? { cantidad: 0, monto_cop: 0 };

                return (
                  <td key={estado} className="px-3 py-2 text-right align-top text-slate-700">
                    {/* El espacio separa los dos datos cuando se lee el texto
                        de la celda: sin él, «2» y «COP 150.000» salen pegados. */}
                    <span className="block font-medium">{formatearNumero(resumen.cantidad)}</span>{" "}
                    <span className="block text-xs text-slate-500">
                      {formatearMoneda(resumen.monto_cop)}
                    </span>
                  </td>
                );
              })}

              <td
                className={`px-3 py-2 text-right font-semibold ${
                  dia.neto_cop < 0 ? "text-rose-600" : "text-slate-900"
                }`}
              >
                {formatearMoneda(dia.neto_cop)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * El rango que la API aplicó, en palabras.
 *
 * Se usan los límites **normalizados** que devolvió la respuesta, no los que
 * se escribieron: son los que la API estuvo usando de verdad.
 */
function rangoAplicado(cierre: CierreContable): string {
  const desde = cierre.desde === null ? null : formatearFecha(cierre.desde);
  const hasta = cierre.hasta === null ? null : formatearFecha(cierre.hasta);

  if (desde !== null && hasta !== null) {
    return `Del ${desde} al ${hasta}`;
  }

  if (desde !== null) {
    return `Desde el ${desde}`;
  }

  if (hasta !== null) {
    return `Hasta el ${hasta}`;
  }

  return "Sin filtro";
}

/** Una etiqueta y su control: el patrón de todos los campos del formulario. */
function Campo({ id, etiqueta, children }: { id: string; etiqueta: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {etiqueta}
      </label>
      {children}
    </div>
  );
}
