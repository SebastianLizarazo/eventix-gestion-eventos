import { Link, useParams } from "react-router-dom";
import { useEvento, useLugar } from "@/api/hooks";
import type { ConfiguracionEvento, TipoTicket } from "@/api/tipos";
import {
  formatearFechaHora,
  formatearMoneda,
  formatearNumero,
  formatearPorcentaje,
} from "@/formato/es-co";
import { ETIQUETA_TIPO_EVENTO } from "@/formato/vocabularios";
import { PanelPromociones } from "@/pantallas/promociones";
import { DistintivoEstado, DistintivoVisibilidad } from "@/ui/distintivos";
import { AvisoError, Cargando, Dato, Tarjeta, Vacio } from "@/ui/piezas";

/**
 * Ficha de evento: todo lo que el modelo documental sabe de un evento.
 *
 * Esta pantalla es la demostración visible del requisito flexible (spec S10):
 * el bloque `configuracion_evento` trae, según el tipo de evento, campos que
 * **la interfaz no conoce de antemano**. Por eso los campos propios del tipo
 * se renderizan de forma genérica: se recorre lo que vino en el documento y se
 * muestra tal cual, sin una lista de campos escrita a mano en el código.
 *
 * Esa es justamente la diferencia entre un modelo flexible y uno que se hizo
 * flexible "en la interfaz": con un tipo nuevo, esta pantalla no cambia.
 */

/**
 * Los bloques de configuración que existen para cualquier tipo de evento.
 *
 * Son los que la interfaz conoce y los muestra con su propio formato (la
 * identidad visual, la encuesta). **Cualquier otro bloque es propio del tipo**
 * y se muestra de forma genérica.
 */
const BLOQUES_COMUNES = ["plantilla_id", "branding", "encuesta_post_evento"];

/** Ficha de evento. */
export function Evento() {
  const { id } = useParams<{ id: string }>();
  const evento = useEvento(id ?? null);
  // El lugar se pide cuando ya se sabe cuál es: el hook lo espera con `null`
  // mientras tanto.
  const lugar = useLugar(evento.data?.lugar_id ?? null);

  if (evento.isPending) {
    return <Cargando texto="Cargando el evento…" />;
  }

  if (evento.isError) {
    return <AvisoError error={evento.error} />;
  }

  const datos = evento.data;

  if (!datos) {
    return <Vacio texto="No hay ningún evento que mostrar" />;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link to="/catalogo" className="text-sm text-slate-600 hover:text-slate-900">
          Volver al catálogo
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">{datos.nombre}</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
            {ETIQUETA_TIPO_EVENTO[datos.tipo_evento]}
          </span>
          <DistintivoEstado estado={datos.estado} />
          <DistintivoVisibilidad visibilidad={datos.visibilidad} />

          {/* La compra arranca desde la ficha: el evento ya viene elegido. */}
          <Link
            to={`/compra?evento=${datos._id}`}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Comprar
          </Link>
        </div>

        {datos.descripcion ? (
          <p className="max-w-3xl text-sm text-slate-600">{datos.descripcion}</p>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Tarjeta titulo="Datos del evento" className="lg:col-span-2">
          <dl className="divide-y divide-slate-100">
            <Dato etiqueta="Comienza" valor={formatearFechaHora(datos.fecha_inicio)} />
            <Dato etiqueta="Termina" valor={formatearFechaHora(datos.fecha_fin)} />
            <Dato
              etiqueta="Lugar"
              valor={
                lugar.data ? (
                  <span>
                    {lugar.data.nombre}
                    <span className="block text-xs text-slate-500">
                      {lugar.data.direccion} — {lugar.data.ciudad}
                    </span>
                  </span>
                ) : (
                  <Identificador valor={datos.lugar_id} />
                )
              }
            />
            <Dato
              etiqueta="Categorías"
              valor={datos.categorias.length === 0 ? "—" : datos.categorias.join(", ")}
            />
            <Dato
              etiqueta="Etiquetas"
              valor={datos.tags.length === 0 ? "—" : datos.tags.join(", ")}
            />
            <Dato etiqueta="Organizador" valor={<Identificador valor={datos.organizador_id} />} />
            <Dato etiqueta="Slug" valor={<Identificador valor={datos.slug} />} />
            <Dato etiqueta="Creado" valor={formatearFechaHora(datos.creado_en)} />
            <Dato etiqueta="Actualizado" valor={formatearFechaHora(datos.actualizado_en)} />
            <Dato etiqueta="Versión" valor={formatearNumero(datos._v)} />
          </dl>
        </Tarjeta>

        <Tarjeta
          titulo="Métricas"
          descripcion="Los números que el sistema mantiene actualizados del evento."
        >
          {datos.metricas_evento ? (
            <dl className="divide-y divide-slate-100">
              <Dato
                etiqueta="Tickets vendidos"
                valor={formatearNumero(datos.metricas_evento.tickets_vendidos_total)}
              />
              <Dato
                etiqueta="Ingresos"
                valor={formatearMoneda(datos.metricas_evento.ingresos_cop)}
              />
              <Dato
                etiqueta="Última actualización"
                valor={formatearFechaHora(datos.metricas_evento.ultima_actualizacion)}
              />
            </dl>
          ) : (
            <Vacio texto="Este evento todavía no tiene métricas calculadas" />
          )}
        </Tarjeta>
      </div>

      <Tarjeta
        titulo="Tipos de ticket"
        descripcion="Las formas de entrada al evento y lo que se ha vendido de cada una."
      >
        {datos.tipos_ticket.length === 0 ? (
          <Vacio texto="Este evento todavía no tiene tipos de ticket" />
        ) : (
          <TablaTiposTicket tipos={datos.tipos_ticket} />
        )}
      </Tarjeta>

      <Tarjeta
        titulo="Configuración del evento"
        descripcion="El bloque que el modelo flexible reserva para cada tipo de evento."
      >
        <Configuracion configuracion={datos.configuracion_evento} />
      </Tarjeta>

      <PanelPromociones eventoId={datos._id} tiposTicket={datos.tipos_ticket} />
    </div>
  );
}

/** Un identificador del modelo, en monoespaciada: es un valor, no un texto. */
function Identificador({ valor }: { valor: string }) {
  return <span className="font-mono text-xs text-slate-700">{valor}</span>;
}

/** La tabla con los tipos de ticket y su ocupación. */
function TablaTiposTicket({ tipos }: { tipos: TipoTicket[] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <th scope="col" className="py-2 pr-4 font-medium">
            Tipo
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Precio
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Vendidos
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Ocupación
          </th>
          <th scope="col" className="py-2 font-medium">
            Restricciones
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {tipos.map((tipo) => (
          <tr key={tipo._id}>
            <td className="py-3 pr-4 font-medium text-slate-900">{tipo.nombre}</td>
            <td className="py-3 pr-4 text-slate-600">{formatearMoneda(tipo.precio_cop)}</td>
            <td className="py-3 pr-4 text-slate-600">
              {`${formatearNumero(tipo.aforo_vendido)} / ${formatearNumero(tipo.aforo_total)}`}
            </td>
            <td className="py-3 pr-4 text-slate-600">{ocupacion(tipo)}</td>
            <td className="py-3 text-slate-600">{restricciones(tipo)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * La ocupación de un tipo de ticket, en porcentaje.
 *
 * Un aforo total de cero no es una ocupación: se muestra el guion, no un
 * `NaN`.
 */
function ocupacion(tipo: TipoTicket): string {
  if (tipo.aforo_total <= 0) {
    return "—";
  }

  return formatearPorcentaje((tipo.aforo_vendido / tipo.aforo_total) * 100);
}

/** Las restricciones de compra de un tipo de ticket, en una línea. */
function restricciones(tipo: TipoTicket): string {
  const partes: string[] = [];

  if (tipo.restricciones.edad_minima !== undefined) {
    partes.push(`Edad mínima: ${tipo.restricciones.edad_minima}`);
  }

  if (tipo.restricciones.max_por_compra !== undefined) {
    partes.push(`Máximo por compra: ${tipo.restricciones.max_por_compra}`);
  }

  if (tipo.restricciones.venta_inicio !== undefined) {
    partes.push(`Venta desde ${formatearFechaHora(tipo.restricciones.venta_inicio)}`);
  }

  if (tipo.restricciones.venta_fin !== undefined) {
    partes.push(`hasta ${formatearFechaHora(tipo.restricciones.venta_fin)}`);
  }

  return partes.length === 0 ? "Sin restricciones" : partes.join(" · ");
}

/**
 * La configuración del evento.
 *
 * Los bloques comunes se muestran con su propio formato; los que no son comunes
 * —los propios del tipo de evento— se muestran **de forma genérica**, que es
 * lo que hace visible el requisito flexible.
 */
function Configuracion({ configuracion }: { configuracion: ConfiguracionEvento }) {
  const propios = bloquesPropios(configuracion);

  return (
    <div className="space-y-6">
      {configuracion.branding ? <IdentidadVisual branding={configuracion.branding} /> : null}

      {configuracion.encuesta_post_evento ? (
        <Encuesta encuesta={configuracion.encuesta_post_evento} />
      ) : null}

      <div>
        <h3 className="text-base font-semibold text-slate-900">Campos propios del tipo</h3>
        <p className="mt-1 text-sm text-slate-600">
          Estos campos vienen del documento del evento: la interfaz los muestra sin conocerlos de
          antemano, porque el modelo deja que cada tipo de evento defina los suyos.
        </p>

        {propios.length === 0 ? (
          <div className="mt-3">
            <Vacio texto="Este evento no tiene campos propios de su tipo" />
          </div>
        ) : (
          propios.map(([bloque, campos]) => (
            <div key={bloque} className="mt-4">
              <h4 className="font-mono text-sm font-semibold text-slate-700">{bloque}</h4>
              <dl className="mt-1 divide-y divide-slate-100">
                {entradas(campos).map(([nombre, valor]) => (
                  <div key={nombre} className="flex items-baseline justify-between gap-4 py-1">
                    <dt className="font-mono text-sm text-slate-600">{nombre}</dt>
                    <dd className="text-sm font-medium text-slate-900">{valorFlexible(valor)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Los bloques de configuración que **no** son comunes.
 *
 * Es la única forma en que la interfaz mira la configuración del evento, y
 * mira lo que **no** conoce: lo que conoce tiene su propio lugar en pantalla.
 */
function bloquesPropios(configuracion: ConfiguracionEvento): [string, unknown][] {
  return Object.entries(configuracion).filter(([clave]) => !BLOQUES_COMUNES.includes(clave));
}

/** Las entradas de un bloque de configuración, como pares de nombre y valor. */
function entradas(campos: unknown): [string, unknown][] {
  if (typeof campos !== "object" || campos === null || Array.isArray(campos)) {
    return [];
  }

  return Object.entries(campos as Record<string, unknown>);
}

/**
 * El valor de un campo propio del tipo, formateado.
 *
 * El formateo es genérico porque el campo es genérico: un texto se muestra
 * como texto, un número con separador de miles, un booleano como «Sí» o «No».
 */
function valorFlexible(valor: unknown): string {
  if (valor === null || valor === undefined) {
    return "—";
  }

  if (typeof valor === "boolean") {
    return valor ? "Sí" : "No";
  }

  if (typeof valor === "number") {
    return formatearNumero(valor);
  }

  if (typeof valor === "string") {
    return valor;
  }

  if (Array.isArray(valor)) {
    return valor.map((elemento) => valorFlexible(elemento)).join(", ");
  }

  if (typeof valor === "object") {
    return entradas(valor)
      .map(([nombre, interno]) => `${nombre}: ${valorFlexible(interno)}`)
      .join(" · ");
  }

  return String(valor);
}

/** La identidad visual del evento: sus colores y su logo. */
function IdentidadVisual({ branding }: { branding: NonNullable<ConfiguracionEvento["branding"]> }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-slate-900">Identidad visual</h3>
      <div className="mt-3 flex flex-wrap items-center gap-6">
        <Color color={branding.color_primario} />
        <Color color={branding.color_secundario} />
        <a
          href={branding.logo_url}
          className="text-sm text-slate-700 underline hover:text-slate-900"
          target="_blank"
          rel="noreferrer"
        >
          {branding.logo_url}
        </a>
      </div>
    </div>
  );
}

/** Un color de la identidad visual, con su valor hexadecimal al lado. */
function Color({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="h-6 w-6 rounded-full border border-slate-200"
        style={{ backgroundColor: color }}
      />
      <span className="font-mono text-xs text-slate-700">{color}</span>
    </div>
  );
}

/** La encuesta post evento, con sus preguntas. */
function Encuesta({
  encuesta,
}: {
  encuesta: NonNullable<ConfiguracionEvento["encuesta_post_evento"]>;
}) {
  return (
    <div>
      <h3 className="text-base font-semibold text-slate-900">Encuesta post evento</h3>
      <p className="mt-1 text-sm text-slate-600">
        {encuesta.habilitada
          ? "El evento pregunta al asistente cuando termina."
          : "El evento no pide encuesta al asistente."}
      </p>

      {encuesta.preguntas.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {encuesta.preguntas.map((pregunta) => (
            <li key={pregunta.id} className="text-sm text-slate-700">
              <span className="font-medium text-slate-900">{pregunta.texto}</span>
              <span className="text-slate-500">
                {" "}
                — {pregunta.tipo === "escala" ? "Escala" : "Abierta"}
                {pregunta.rango ? ` (${pregunta.rango[0]}–${pregunta.rango[1]})` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
