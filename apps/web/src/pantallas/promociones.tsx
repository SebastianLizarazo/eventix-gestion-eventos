import { useState, type FormEvent, type ReactNode } from "react";
import { useCrearPromocion, useEditarPromocion, usePromociones } from "@/api/hooks";
import type { EntradaPromocion, Promocion, TipoPromocion, TipoTicket } from "@/api/tipos";
import {
  aCampoFechaHora,
  aIsoUtcDesdeCampo,
  formatearFechaHora,
  formatearMoneda,
  formatearNumero,
  formatearPorcentaje,
} from "@/formato/es-co";
import { AvisoError, Cargando, Tarjeta, Vacio } from "@/ui/piezas";
import { ETIQUETA_TIPO_PROMOCION } from "@/formato/vocabularios";

/**
 * Panel de promociones de un evento: el listado, el alta y la edición.
 *
 * Es una pieza de la ficha del evento (tarea T1.3 del roadmap), así que no
 * decide nada de la API: consume el contrato que la API ya publica y escribe
 * con las dos mutaciones que la capa de datos expone.
 *
 * Tres decisiones que conviene tener presentes:
 *
 * - **El mismo formulario sirve para el alta y para la edición.** Lo que
 *   cambia es a dónde se envía: el alta va a `POST /eventos/{id}/promociones`
 *   y la edición a `PATCH /eventos/{id}/promociones/{codigo}`, con el código
 *   **anterior** en la ruta. El código nuevo viaja en el cuerpo: la API
 *   renombra la promoción en el mismo movimiento.
 * - **Las vigencias viajan en ISO UTC.** El campo del navegador no lleva
 *   zona, así que el valor se convierte con `aIsoUtcDesdeCampo` (que lo lee
 *   como UTC, igual que la API) y se carga con `aCampoFechaHora`.
 * - **`usos_maximos` es opcional de verdad.** Si el campo está vacío, el
 *   campo no viaja en el cuerpo: la promoción no tiene tope.
 */

/** Propiedades del panel de promociones. */
export type PanelPromocionesProps = {
  /** Identificador del evento al que pertenecen las promociones. */
  eventoId: string;
  /** Tipos de ticket del evento: son los que una promoción puede aplicar. */
  tiposTicket: TipoTicket[];
};

/** Modo del panel: la lista, el formulario de alta o el de edición. */
type Modo = "lista" | "alta" | "edicion";

/**
 * Los campos del formulario, tal como los tiene el usuario en pantalla.
 *
 * Los números se guardan como texto: un campo vacío no es un cero, y la
 * diferencia se nota al mandar el cuerpo (un cero es un valor inválido y un
 * campo vacío es "no hay tope").
 */
type Campos = {
  codigo: string;
  tipo: TipoPromocion;
  valor: string;
  vigencia_inicio: string;
  vigencia_fin: string;
  usos_maximos: string;
  activo: boolean;
  aplica_a_tipo_ticket_ids: string[];
};

/** Un formulario nuevo: sin código y con la promoción activa. */
const CAMPOS_VACIOS: Campos = {
  codigo: "",
  tipo: "porcentaje",
  valor: "",
  vigencia_inicio: "",
  vigencia_fin: "",
  usos_maximos: "",
  activo: true,
  aplica_a_tipo_ticket_ids: [],
};

/** Panel de promociones de un evento. */
export function PanelPromociones({ eventoId, tiposTicket }: PanelPromocionesProps) {
  const promociones = usePromociones(eventoId);
  const crear = useCrearPromocion(eventoId);
  const editar = useEditarPromocion(eventoId);

  const [modo, setModo] = useState<Modo>("lista");
  const [campos, setCampos] = useState<Campos>(CAMPOS_VACIOS);
  const [codigoAnterior, setCodigoAnterior] = useState<string | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const lista = promociones.data ?? [];
  const errorEscritura = crear.error ?? editar.error;
  const escribiendo = crear.isPending || editar.isPending;

  /** Cambia uno o varios campos del formulario. */
  function actualizar(cambios: Partial<Campos>): void {
    setCampos((anterior) => ({ ...anterior, ...cambios }));
  }

  /** Marca o desmarca un tipo de ticket entre los que aplica la promoción. */
  function alternarTipoTicket(id: string): void {
    setCampos((anterior) => ({
      ...anterior,
      aplica_a_tipo_ticket_ids: anterior.aplica_a_tipo_ticket_ids.includes(id)
        ? anterior.aplica_a_tipo_ticket_ids.filter((otro) => otro !== id)
        : [...anterior.aplica_a_tipo_ticket_ids, id],
    }));
  }

  /** Abre el formulario de alta, con el formulario limpio. */
  function nuevaPromocion(): void {
    crear.reset();
    editar.reset();
    setErrorLocal(null);
    setCodigoAnterior(null);
    setCampos(CAMPOS_VACIOS);
    setModo("alta");
  }

  /** Carga una promoción en el formulario para editarla. */
  function editarPromocion(promocion: Promocion): void {
    crear.reset();
    editar.reset();
    setErrorLocal(null);
    setCodigoAnterior(promocion.codigo);
    setCampos({
      codigo: promocion.codigo,
      tipo: promocion.tipo,
      valor: String(promocion.valor),
      vigencia_inicio: aCampoFechaHora(promocion.vigencia_inicio),
      vigencia_fin: aCampoFechaHora(promocion.vigencia_fin),
      usos_maximos: promocion.usos_maximos === undefined ? "" : String(promocion.usos_maximos),
      activo: promocion.activo,
      aplica_a_tipo_ticket_ids: [...promocion.aplica_a_tipo_ticket_ids],
    });
    setModo("edicion");
  }

  /** Cierra el formulario y vuelve al modo lista. */
  function cerrarFormulario(): void {
    crear.reset();
    editar.reset();
    setErrorLocal(null);
    setCodigoAnterior(null);
    setCampos(CAMPOS_VACIOS);
    setModo("lista");
  }

  /**
   * Arma el cuerpo de la promoción y lo manda.
   *
   * El cuerpo es el mismo en los dos casos: lo que cambia es la ruta, que en
   * la edición lleva el código anterior.
   */
  function guardar(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();

    const vigencia_inicio = aIsoUtcDesdeCampo(campos.vigencia_inicio);
    const vigencia_fin = aIsoUtcDesdeCampo(campos.vigencia_fin);

    if (vigencia_inicio === null || vigencia_fin === null) {
      setErrorLocal("Las vigencias tienen que ser fechas y horas válidas.");
      return;
    }

    const cuerpo: EntradaPromocion = {
      codigo: campos.codigo,
      tipo: campos.tipo,
      valor: Number(campos.valor),
      aplica_a_tipo_ticket_ids: campos.aplica_a_tipo_ticket_ids,
      vigencia_inicio,
      vigencia_fin,
      ...(campos.usos_maximos.trim() === "" ? {} : { usos_maximos: Number(campos.usos_maximos) }),
      activo: campos.activo,
    };

    setErrorLocal(null);

    if (modo === "edicion" && codigoAnterior !== null) {
      editar.mutate(
        { codigo: codigoAnterior, cambios: cuerpo },
        {
          onSuccess: () => {
            setModo("lista");
            setCodigoAnterior(null);
            setCampos(CAMPOS_VACIOS);
          },
        },
      );
      return;
    }

    crear.mutate(cuerpo, {
      // Tras el alta el formulario queda limpio y listo para la siguiente.
      onSuccess: () => {
        setCampos(CAMPOS_VACIOS);
      },
    });
  }

  return (
    <Tarjeta
      titulo="Promociones"
      descripcion="Descuentos que el evento aplica sobre los tipos de ticket que elijas."
    >
      {modo === "lista" ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={nuevaPromocion}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
            >
              Nueva promoción
            </button>
          </div>

          {promociones.isPending ? (
            <Cargando />
          ) : promociones.isError ? (
            <AvisoError error={promociones.error} />
          ) : lista.length === 0 ? (
            <Vacio texto="Este evento todavía no tiene promociones." />
          ) : (
            <TablaPromociones
              promociones={lista}
              tiposTicket={tiposTicket}
              onEditar={editarPromocion}
            />
          )}
        </div>
      ) : (
        <form onSubmit={guardar} className="space-y-4">
          <h3 className="text-base font-semibold text-slate-900">
            {modo === "edicion" ? "Editar promoción" : "Nueva promoción"}
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Código" htmlFor="promocion-codigo">
              <input
                id="promocion-codigo"
                type="text"
                required
                value={campos.codigo}
                onChange={(evento) => actualizar({ codigo: evento.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </Campo>

            <Campo etiqueta="Tipo" htmlFor="promocion-tipo">
              <select
                id="promocion-tipo"
                value={campos.tipo}
                onChange={(evento) => actualizar({ tipo: evento.target.value as TipoPromocion })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              >
                <option value="porcentaje">{ETIQUETA_TIPO_PROMOCION.porcentaje}</option>
                <option value="2x1">{ETIQUETA_TIPO_PROMOCION["2x1"]}</option>
                <option value="early_bird">{ETIQUETA_TIPO_PROMOCION.early_bird}</option>
              </select>
            </Campo>

            <Campo etiqueta="Valor" htmlFor="promocion-valor">
              <input
                id="promocion-valor"
                type="number"
                required
                step={1}
                min={minimoValor(campos.tipo)}
                max={maximoValor(campos.tipo)}
                value={campos.valor}
                onChange={(evento) => actualizar({ valor: evento.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </Campo>

            <Campo etiqueta="Usos máximos" htmlFor="promocion-usos-maximos">
              <input
                id="promocion-usos-maximos"
                type="number"
                step={1}
                min={0}
                value={campos.usos_maximos}
                onChange={(evento) => actualizar({ usos_maximos: evento.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </Campo>

            <Campo etiqueta="Vigencia desde" htmlFor="promocion-vigencia-inicio">
              <input
                id="promocion-vigencia-inicio"
                type="datetime-local"
                required
                value={campos.vigencia_inicio}
                onChange={(evento) => actualizar({ vigencia_inicio: evento.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </Campo>

            <Campo etiqueta="Vigencia hasta" htmlFor="promocion-vigencia-fin">
              <input
                id="promocion-vigencia-fin"
                type="datetime-local"
                required
                value={campos.vigencia_fin}
                onChange={(evento) => actualizar({ vigencia_fin: evento.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </Campo>
          </div>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-sm font-medium text-slate-700">Aplica a</legend>
            {tiposTicket.length === 0 ? (
              <p className="text-sm text-slate-600">
                Este evento no tiene tipos de ticket: la promoción no aplica a ninguno.
              </p>
            ) : (
              <div className="mt-1 space-y-2">
                {tiposTicket.map((tipo) => (
                  <div key={tipo._id} className="flex items-center gap-2">
                    <input
                      id={`promocion-aplica-${tipo._id}`}
                      type="checkbox"
                      checked={campos.aplica_a_tipo_ticket_ids.includes(tipo._id)}
                      onChange={() => alternarTipoTicket(tipo._id)}
                    />
                    <label
                      htmlFor={`promocion-aplica-${tipo._id}`}
                      className="text-sm text-slate-700"
                    >
                      {tipo.nombre} — {formatearMoneda(tipo.precio_cop)}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </fieldset>

          <div className="flex items-center gap-2">
            <input
              id="promocion-activo"
              type="checkbox"
              checked={campos.activo}
              onChange={(evento) => actualizar({ activo: evento.target.checked })}
            />
            <label htmlFor="promocion-activo" className="text-sm text-slate-700">
              Activa
            </label>
          </div>

          {errorLocal !== null ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {errorLocal}
            </p>
          ) : null}

          {errorEscritura !== null ? <AvisoError error={errorEscritura} /> : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={escribiendo}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Guardar promoción
            </button>
            <button
              type="button"
              onClick={cerrarFormulario}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </Tarjeta>
  );
}

/** Un campo del formulario con su etiqueta. */
function Campo({
  etiqueta,
  htmlFor,
  children,
}: {
  etiqueta: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {etiqueta}
      </label>
      {children}
    </div>
  );
}

/** La tabla con las promociones del evento. */
function TablaPromociones({
  promociones,
  tiposTicket,
  onEditar,
}: {
  promociones: Promocion[];
  tiposTicket: TipoTicket[];
  onEditar: (promocion: Promocion) => void;
}) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <th scope="col" className="py-2 pr-4 font-medium">
            Código
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Tipo
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Valor
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Vigencia
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Usos
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Estado
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Aplica a
          </th>
          <th scope="col" className="py-2 font-medium">
            <span className="sr-only">Acciones</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {promociones.map((promocion) => (
          <FilaPromocion
            key={promocion.codigo}
            promocion={promocion}
            tiposTicket={tiposTicket}
            onEditar={onEditar}
          />
        ))}
      </tbody>
    </table>
  );
}

/** Una fila de la tabla de promociones. */
function FilaPromocion({
  promocion,
  tiposTicket,
  onEditar,
}: {
  promocion: Promocion;
  tiposTicket: TipoTicket[];
  onEditar: (promocion: Promocion) => void;
}) {
  const usos = `${formatearNumero(promocion.usos_realizados)} / ${
    promocion.usos_maximos === undefined ? "—" : formatearNumero(promocion.usos_maximos)
  }`;

  return (
    <tr>
      <td className="py-3 pr-4 font-medium text-slate-900">{promocion.codigo}</td>
      <td className="py-3 pr-4 text-slate-600">{ETIQUETA_TIPO_PROMOCION[promocion.tipo]}</td>
      <td className="py-3 pr-4 text-slate-600">{valorDe(promocion)}</td>
      <td className="py-3 pr-4 text-slate-600">
        {`${formatearFechaHora(promocion.vigencia_inicio)} — ${formatearFechaHora(promocion.vigencia_fin)}`}
      </td>
      <td className="py-3 pr-4 text-slate-600">{usos}</td>
      <td className="py-3 pr-4">
        <span
          className={
            promocion.activo
              ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800"
              : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
          }
        >
          {promocion.activo ? "Activa" : "Inactiva"}
        </span>
      </td>
      <td className="py-3 pr-4 text-slate-600">
        {nombresDeTipos(promocion.aplica_a_tipo_ticket_ids, tiposTicket)}
      </td>
      <td className="py-3">
        <button
          type="button"
          onClick={() => onEditar(promocion)}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Editar
        </button>
      </td>
    </tr>
  );
}

/**
 * El valor de la promoción, como se ve en la lista.
 *
 * El `2x1` no es un porcentaje: se muestra como es, porque el número del
 * contrato es el número de entradas que se compran por una.
 */
function valorDe(promocion: Promocion): string {
  return promocion.tipo === "2x1" ? "2x1" : formatearPorcentaje(promocion.valor);
}

/**
 * Los nombres de los tipos de ticket a los que aplica la promoción.
 *
 * Un identificador que no está en los tipos de ticket del evento se muestra
 * tal cual: esconderlo haría creer que la promoción no aplica a nadie.
 */
function nombresDeTipos(ids: string[], tiposTicket: TipoTicket[]): string {
  if (ids.length === 0) {
    return "Ninguno";
  }

  const nombres = ids.map((id) => tiposTicket.find((tipo) => tipo._id === id)?.nombre ?? id);

  return nombres.join(", ");
}

/** El valor mínimo que admite el tipo de promoción, según la API. */
function minimoValor(tipo: TipoPromocion): number {
  return tipo === "2x1" ? 2 : 1;
}

/** El valor máximo que admite el tipo de promoción, según la API. */
function maximoValor(tipo: TipoPromocion): number | undefined {
  return tipo === "2x1" ? undefined : 100;
}
