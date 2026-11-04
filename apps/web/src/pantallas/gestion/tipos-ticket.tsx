import { useState, type FormEvent, type ReactNode } from "react";
import { useBorrarTipoTicket, useCrearTipoTicket, useEditarTipoTicket } from "@/api/hooks";
import type { EntradaTipoTicket, Restricciones, TipoTicket } from "@/api/tipos";
import {
  aCampoFechaHora,
  aIsoUtcDesdeCampo,
  formatearMoneda,
  formatearNumero,
  formatearPorcentaje,
} from "@/formato/es-co";
import { AvisoError, Tarjeta, Vacio } from "@/ui/piezas";

/**
 * Panel de tipos de ticket de un evento: el listado, el alta, la edición y la
 * baja.
 *
 * Los tipos de ticket son un **sub-recurso del evento**: van embebidos en él,
 * y por eso se editan contra el evento y no contra una colección aparte. La
 * API es la que asigna el identificador de cada tipo, porque es el que
 * referencia el ticket comprado y la promoción que se le aplica.
 *
 * Tres decisiones que vienen del contrato:
 *
 * - **El cupo vendido no se edita.** `aforo_vendido` lo lleva el sistema, y la
 *   API escribe solo los campos editables: por eso una edición del aforo no
 *   borra los tickets ya vendidos.
 * - **Bajar el aforo por debajo de lo vendido se rechaza** con un `409`, y el
 *   mensaje de la API se muestra tal cual.
 * - **Un tipo al que una promoción aplica no se puede borrar**: la API
 *   responde `409` diciendo que las quites primero.
 */

/** Propiedades del panel de tipos de ticket. */
export type PanelTiposTicketProps = {
  /** Identificador del evento al que pertenecen los tipos de ticket. */
  eventoId: string;
  /** Los tipos de ticket del evento. */
  tipos: TipoTicket[];
};

/** Modo del panel: la lista, el formulario de alta o el de edición. */
type Modo = "lista" | "alta" | "edicion";

/**
 * Los campos del formulario, tal como los tiene el usuario en pantalla.
 *
 * Los números se guardan como texto: un campo vacío no es un cero, y la
 * diferencia se nota al mandar el cuerpo.
 */
type Campos = {
  nombre: string;
  precio_cop: string;
  aforo_total: string;
  edad_minima: string;
  max_por_compra: string;
  venta_inicio: string;
  venta_fin: string;
};

/** Un formulario nuevo. */
const CAMPOS_VACIOS: Campos = {
  nombre: "",
  precio_cop: "",
  aforo_total: "",
  edad_minima: "",
  max_por_compra: "",
  venta_inicio: "",
  venta_fin: "",
};

/** Panel de tipos de ticket de un evento. */
export function PanelTiposTicket({ eventoId, tipos }: PanelTiposTicketProps) {
  const crear = useCrearTipoTicket(eventoId);
  const editar = useEditarTipoTicket(eventoId);
  const borrar = useBorrarTipoTicket(eventoId);

  const [modo, setModo] = useState<Modo>("lista");
  const [campos, setCampos] = useState<Campos>(CAMPOS_VACIOS);
  const [tipoId, setTipoId] = useState<string | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [porBorrar, setPorBorrar] = useState<TipoTicket | null>(null);

  const errorEscritura = crear.error ?? editar.error ?? borrar.error;
  const escribiendo = crear.isPending || editar.isPending || borrar.isPending;

  /** Cambia uno o varios campos del formulario. */
  function actualizar(cambios: Partial<Campos>): void {
    setCampos((anterior) => ({ ...anterior, ...cambios }));
  }

  /** Abre el formulario de alta, con el formulario limpio. */
  function nuevoTipo(): void {
    crear.reset();
    editar.reset();
    borrar.reset();
    setErrorLocal(null);
    setTipoId(null);
    setCampos(CAMPOS_VACIOS);
    setModo("alta");
  }

  /** Carga un tipo de ticket en el formulario para editarlo. */
  function editarTipo(tipo: TipoTicket): void {
    crear.reset();
    editar.reset();
    borrar.reset();
    setErrorLocal(null);
    setTipoId(tipo._id);
    setCampos({
      nombre: tipo.nombre,
      precio_cop: String(tipo.precio_cop),
      aforo_total: String(tipo.aforo_total),
      edad_minima:
        tipo.restricciones.edad_minima === undefined ? "" : String(tipo.restricciones.edad_minima),
      max_por_compra:
        tipo.restricciones.max_por_compra === undefined
          ? ""
          : String(tipo.restricciones.max_por_compra),
      venta_inicio: aCampoFechaHora(tipo.restricciones.venta_inicio),
      venta_fin: aCampoFechaHora(tipo.restricciones.venta_fin),
    });
    setModo("edicion");
  }

  /** Cierra el formulario y vuelve al modo lista. */
  function cerrarFormulario(): void {
    crear.reset();
    editar.reset();
    setErrorLocal(null);
    setTipoId(null);
    setCampos(CAMPOS_VACIOS);
    setModo("lista");
  }

  /**
   * Arma el cuerpo del tipo de ticket y lo manda.
   *
   * El cuerpo es el mismo en el alta y en la edición: lo que cambia es la
   * ruta, que en la edición lleva el identificador del tipo.
   */
  function guardar(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();

    const precio = Number(campos.precio_cop);
    const aforo = Number(campos.aforo_total);

    if (!Number.isFinite(precio) || precio < 0 || !Number.isFinite(aforo) || aforo < 0) {
      setErrorLocal("El precio y el aforo tienen que ser números que no sean negativos.");
      return;
    }

    const hayVentaInicio = campos.venta_inicio.trim() !== "";
    const hayVentaFin = campos.venta_fin.trim() !== "";
    const ventaInicio = hayVentaInicio ? aIsoUtcDesdeCampo(campos.venta_inicio) : null;
    const ventaFin = hayVentaFin ? aIsoUtcDesdeCampo(campos.venta_fin) : null;

    if ((hayVentaInicio && ventaInicio === null) || (hayVentaFin && ventaFin === null)) {
      setErrorLocal("Las fechas de venta tienen que ser fechas y horas válidas.");
      return;
    }

    const restricciones: Restricciones = {
      ...(campos.edad_minima.trim() === "" ? {} : { edad_minima: Number(campos.edad_minima) }),
      ...(campos.max_por_compra.trim() === ""
        ? {}
        : { max_por_compra: Number(campos.max_por_compra) }),
      ...(ventaInicio === null ? {} : { venta_inicio: ventaInicio }),
      ...(ventaFin === null ? {} : { venta_fin: ventaFin }),
    };

    const cuerpo: EntradaTipoTicket = {
      nombre: campos.nombre,
      precio_cop: precio,
      aforo_total: aforo,
      restricciones,
    };

    setErrorLocal(null);

    if (modo === "edicion" && tipoId !== null) {
      editar.mutate(
        { tipoId, cambios: cuerpo },
        {
          onSuccess: () => {
            setModo("lista");
            setTipoId(null);
            setCampos(CAMPOS_VACIOS);
          },
        },
      );
      return;
    }

    crear.mutate(cuerpo, {
      // Tras el alta el formulario queda limpio y listo para el siguiente.
      onSuccess: () => {
        setCampos(CAMPOS_VACIOS);
      },
    });
  }

  /** Ejecuta el borrado del tipo que el usuario confirmó. */
  function confirmarBorrado(): void {
    if (porBorrar === null) {
      return;
    }

    const id = porBorrar._id;

    setPorBorrar(null);
    borrar.mutate(id);
  }

  return (
    <Tarjeta
      titulo="Tipos de ticket"
      descripcion="Las formas de entrada al evento: su precio, su aforo y las restricciones de compra."
    >
      {modo === "lista" ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={nuevoTipo}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
            >
              Nuevo tipo de ticket
            </button>
          </div>

          {tipos.length === 0 ? (
            <Vacio texto="Este evento todavía no tiene tipos de ticket." />
          ) : (
            <TablaTiposTicket
              tipos={tipos}
              porBorrar={porBorrar}
              onEditar={editarTipo}
              onPedirBorrado={setPorBorrar}
              onCancelarBorrado={() => setPorBorrar(null)}
              onConfirmarBorrado={confirmarBorrado}
            />
          )}

          {errorEscritura !== null ? <AvisoError error={errorEscritura} /> : null}
        </div>
      ) : (
        <form onSubmit={guardar} className="space-y-4">
          <h3 className="text-base font-semibold text-slate-900">
            {modo === "edicion" ? "Editar tipo de ticket" : "Nuevo tipo de ticket"}
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombre" htmlFor="tipo-nombre">
              <input
                id="tipo-nombre"
                type="text"
                required
                value={campos.nombre}
                onChange={(evento) => actualizar({ nombre: evento.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </Campo>

            <Campo etiqueta="Precio (COP)" htmlFor="tipo-precio">
              <input
                id="tipo-precio"
                type="number"
                required
                min={0}
                step={1000}
                value={campos.precio_cop}
                onChange={(evento) => actualizar({ precio_cop: evento.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </Campo>

            <Campo etiqueta="Aforo total" htmlFor="tipo-aforo">
              <input
                id="tipo-aforo"
                type="number"
                required
                min={0}
                value={campos.aforo_total}
                onChange={(evento) => actualizar({ aforo_total: evento.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </Campo>

            <Campo etiqueta="Edad mínima" htmlFor="tipo-edad">
              <input
                id="tipo-edad"
                type="number"
                min={0}
                value={campos.edad_minima}
                onChange={(evento) => actualizar({ edad_minima: evento.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </Campo>

            <Campo etiqueta="Máximo por compra" htmlFor="tipo-maximo">
              <input
                id="tipo-maximo"
                type="number"
                min={1}
                value={campos.max_por_compra}
                onChange={(evento) => actualizar({ max_por_compra: evento.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </Campo>

            <Campo etiqueta="Venta desde" htmlFor="tipo-venta-inicio">
              <input
                id="tipo-venta-inicio"
                type="datetime-local"
                value={campos.venta_inicio}
                onChange={(evento) => actualizar({ venta_inicio: evento.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </Campo>

            <Campo etiqueta="Venta hasta" htmlFor="tipo-venta-fin">
              <input
                id="tipo-venta-fin"
                type="datetime-local"
                value={campos.venta_fin}
                onChange={(evento) => actualizar({ venta_fin: evento.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </Campo>
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
              Guardar tipo de ticket
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

/** Propiedades de la tabla de tipos de ticket. */
type TablaTiposTicketProps = {
  tipos: TipoTicket[];
  porBorrar: TipoTicket | null;
  onEditar: (tipo: TipoTicket) => void;
  onPedirBorrado: (tipo: TipoTicket) => void;
  onCancelarBorrado: () => void;
  onConfirmarBorrado: () => void;
};

/** La tabla con los tipos de ticket y lo que se puede hacer con cada uno. */
function TablaTiposTicket({
  tipos,
  porBorrar,
  onEditar,
  onPedirBorrado,
  onCancelarBorrado,
  onConfirmarBorrado,
}: TablaTiposTicketProps) {
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
            Ocupación
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Restricciones
          </th>
          <th scope="col" className="py-2 font-medium">
            Acciones
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {tipos.map((tipo) => (
          <tr key={tipo._id}>
            <th scope="row" className="py-3 pr-4 font-medium text-slate-900">
              {tipo.nombre}
            </th>
            <td className="py-3 pr-4 text-slate-600">{formatearMoneda(tipo.precio_cop)}</td>
            <td className="py-3 pr-4 text-slate-600">
              {`${formatearNumero(tipo.aforo_vendido)} / ${formatearNumero(tipo.aforo_total)}`}
              <span className="block text-xs text-slate-500">
                {formatearPorcentaje(ocupacion(tipo))}
              </span>
            </td>
            <td className="py-3 pr-4 text-slate-600">{restricciones(tipo)}</td>
            <td className="py-3">
              {porBorrar?._id === tipo._id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-600">¿Eliminar «{tipo.nombre}»?</span>
                  <button
                    type="button"
                    onClick={onConfirmarBorrado}
                    className="rounded-md bg-red-700 px-2 py-1 text-xs font-semibold text-white hover:bg-red-600"
                  >
                    Sí, eliminar
                  </button>
                  <button
                    type="button"
                    onClick={onCancelarBorrado}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onEditar(tipo)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onPedirBorrado(tipo)}
                    className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    Eliminar
                  </button>
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {etiqueta}
      </label>
      {children}
    </div>
  );
}

/** El porcentaje de ocupación de un tipo de ticket. */
function ocupacion(tipo: TipoTicket): number {
  if (tipo.aforo_total === 0) {
    return 0;
  }

  return (tipo.aforo_vendido / tipo.aforo_total) * 100;
}

/** Las restricciones de un tipo de ticket, en una línea. */
function restricciones(tipo: TipoTicket): string {
  const partes: string[] = [];

  if (tipo.restricciones.edad_minima !== undefined) {
    partes.push(`Edad mínima ${tipo.restricciones.edad_minima}`);
  }

  if (tipo.restricciones.max_por_compra !== undefined) {
    partes.push(`Máximo ${tipo.restricciones.max_por_compra} por compra`);
  }

  if (tipo.restricciones.venta_inicio !== undefined) {
    partes.push(`Venta desde ${aCampoFechaHora(tipo.restricciones.venta_inicio)}`);
  }

  if (tipo.restricciones.venta_fin !== undefined) {
    partes.push(`Venta hasta ${aCampoFechaHora(tipo.restricciones.venta_fin)}`);
  }

  return partes.length === 0 ? "—" : partes.join(" · ");
}
