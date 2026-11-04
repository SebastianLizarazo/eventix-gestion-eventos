import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { esConflicto } from "@/api/errores";
import { useContrato, useCrearEvento, useEditarEvento, useEvento, useLugares } from "@/api/hooks";
import type {
  CambiosEvento,
  EntradaEvento,
  Evento,
  EstadoEvento,
  TipoEvento,
  VisibilidadEvento,
} from "@/api/tipos";
import { aCampoFechaHora, aIsoUtcDesdeCampo } from "@/formato/es-co";
import {
  ESTADOS_EVENTO,
  ETIQUETA_ESTADO,
  ETIQUETA_TIPO_EVENTO,
  ETIQUETA_VISIBILIDAD,
  TIPOS_EVENTO,
  VISIBILIDADES_EVENTO,
} from "@/formato/vocabularios";
import { CamposDeEsquema } from "@/ui/campos-contrato";
import { AvisoError, Cargando, Tarjeta } from "@/ui/piezas";
import { SelectorUsuario } from "@/ui/selector-usuario";
import { PanelPromociones } from "@/pantallas/promociones";
import { PanelTiposTicket } from "./tipos-ticket";

/**
 * Formulario de un evento: el alta y la edición.
 *
 * Es la pantalla que escribe contra el contrato del evento, y por eso hay
 * tres decisiones que conviene tener presentes:
 *
 * - **La edición manda la versión que se leyó** (`_v`). El servidor la
 *   contrasta con la vigente: si el evento cambió mientras el formulario
 *   estaba abierto, responde `409` y la pantalla lo dice, en vez de pisar lo
 *   que otro escribió.
 * - **La edición fusiona.** El `PATCH` mezcla el cuerpo sobre el documento
 *   leído, así que un campo que no viaje conserva su valor; y un campo que
 *   viaje como `null` **se borra** (la descripción vacía sale del documento).
 * - **La configuración la construye el contrato.** El bloque flexible del
 *   evento se edita con los campos que el servidor publica en su OpenAPI, no
 *   con una lista escrita en la interfaz (spec S10).
 */

/** Los campos del formulario, tal como los tiene el usuario en pantalla. */
type Campos = {
  nombre: string;
  slug: string;
  tipo_evento: TipoEvento;
  descripcion: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: EstadoEvento;
  visibilidad: VisibilidadEvento;
  organizador_id: string;
  lugar_id: string;
  categorias: string;
  tags: string;
  configuracion: Record<string, unknown>;
};

/**
 * Un evento nuevo, con el formulario limpio.
 *
 * El estado por defecto es `borrador`: un evento nace sin publicar, y es el
 * dominio el que decide cuándo se publica.
 */
const CAMPOS_NUEVOS: Campos = {
  nombre: "",
  slug: "",
  tipo_evento: "corporativo",
  descripcion: "",
  fecha_inicio: "",
  fecha_fin: "",
  estado: "borrador",
  visibilidad: "publico",
  organizador_id: "",
  lugar_id: "",
  categorias: "",
  tags: "",
  configuracion: {},
};

/** Formulario de alta o de edición de un evento. */
export function FormularioEvento() {
  const { id } = useParams<{ id: string }>();
  // Sin identificador es un alta: la ruta `/gestion/eventos/nuevo` no lo trae.
  const eventoId = id ?? null;

  const navegar = useNavigate();
  const evento = useEvento(eventoId);
  const lugares = useLugares();
  const contrato = useContrato();
  const crear = useCrearEvento();
  const editar = useEditarEvento();

  const [campos, setCampos] = useState<Campos>(CAMPOS_NUEVOS);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  // El formulario se arma con el evento que se leyó.
  useEffect(() => {
    if (evento.data) {
      setCampos(desdeEvento(evento.data));
    }
  }, [evento.data]);

  const errorEscritura = crear.error ?? editar.error;
  const escribiendo = crear.isPending || editar.isPending;

  /** Cambia uno o varios campos del formulario. */
  function actualizar(cambios: Partial<Campos>): void {
    setCampos((anterior) => ({ ...anterior, ...cambios }));
  }

  /**
   * Arma el cuerpo y lo manda.
   *
   * El alta y la edición mandan cuerpos distintos porque el contrato lo pide
   * así: el alta no lleva versión (el documento todavía no existe) y la
   * edición sí, además de poder dejar un campo sin valor.
   */
  function guardar(eventoFormulario: FormEvent<HTMLFormElement>): void {
    eventoFormulario.preventDefault();

    const fechaInicio = aIsoUtcDesdeCampo(campos.fecha_inicio);
    const fechaFin = aIsoUtcDesdeCampo(campos.fecha_fin);

    if (fechaInicio === null || fechaFin === null) {
      setErrorLocal("Las fechas del evento tienen que ser fechas y horas válidas.");
      return;
    }

    const categorias = separar(campos.categorias);
    const tags = separar(campos.tags);
    const descripcion = campos.descripcion.trim();

    setErrorLocal(null);

    if (eventoId === null) {
      const cuerpo: EntradaEvento = {
        nombre: campos.nombre,
        tipo_evento: campos.tipo_evento,
        ...(descripcion === "" ? {} : { descripcion }),
        ...(campos.slug.trim() === "" ? {} : { slug: campos.slug.trim() }),
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        estado: campos.estado,
        visibilidad: campos.visibilidad,
        organizador_id: campos.organizador_id,
        lugar_id: campos.lugar_id,
        categorias,
        tags,
        configuracion_evento: campos.configuracion,
      };

      crear.mutate(cuerpo, { onSuccess: () => navegar("/gestion/eventos") });
      return;
    }

    const cambios: CambiosEvento = {
      nombre: campos.nombre,
      tipo_evento: campos.tipo_evento,
      descripcion: descripcion === "" ? null : descripcion,
      ...(campos.slug.trim() === "" ? {} : { slug: campos.slug.trim() }),
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      estado: campos.estado,
      visibilidad: campos.visibilidad,
      organizador_id: campos.organizador_id,
      lugar_id: campos.lugar_id,
      categorias,
      tags,
      configuracion_evento: campos.configuracion,
      _v: evento.data?._v ?? 0,
    };

    editar.mutate({ id: eventoId, cambios }, { onSuccess: () => navegar("/gestion/eventos") });
  }

  if (eventoId !== null && evento.isPending) {
    return <Cargando texto="Cargando el evento…" />;
  }

  if (eventoId !== null && evento.isError) {
    return <AvisoError error={evento.error} />;
  }

  const esquemaConfiguracion =
    contrato.data?.components.schemas.EventoEntrada?.properties?.configuracion_evento;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">
          {eventoId === null ? "Nuevo evento" : "Editar evento"}
        </h1>
        <p className="text-sm text-slate-600">
          {eventoId === null
            ? "Los datos que escribas se guardan contra la API: el servidor valida y devuelve el documento."
            : `Se está editando la versión ${evento.data?._v ?? "?"} del evento. Si otro lo cambia mientras tanto, la API lo rechaza.`}
        </p>
      </header>

      <form onSubmit={guardar} className="space-y-6">
        <Tarjeta titulo="Datos del evento">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombre" htmlFor="evento-nombre">
              <input
                id="evento-nombre"
                type="text"
                required
                maxLength={200}
                value={campos.nombre}
                onChange={(eventoCambio) => actualizar({ nombre: eventoCambio.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </Campo>

            <Campo etiqueta="Slug" htmlFor="evento-slug">
              <input
                id="evento-slug"
                type="text"
                maxLength={120}
                value={campos.slug}
                onChange={(eventoCambio) => actualizar({ slug: eventoCambio.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                placeholder="Se deriva del nombre si se deja vacío"
              />
            </Campo>

            <Campo etiqueta="Tipo de evento" htmlFor="evento-tipo">
              <select
                id="evento-tipo"
                value={campos.tipo_evento}
                onChange={(eventoCambio) =>
                  actualizar({ tipo_evento: eventoCambio.target.value as TipoEvento })
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              >
                {TIPOS_EVENTO.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {ETIQUETA_TIPO_EVENTO[tipo]}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Estado" htmlFor="evento-estado">
              <select
                id="evento-estado"
                value={campos.estado}
                onChange={(eventoCambio) =>
                  actualizar({ estado: eventoCambio.target.value as EstadoEvento })
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              >
                {ESTADOS_EVENTO.map((estado) => (
                  <option key={estado} value={estado}>
                    {ETIQUETA_ESTADO[estado]}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Visibilidad" htmlFor="evento-visibilidad">
              <select
                id="evento-visibilidad"
                value={campos.visibilidad}
                onChange={(eventoCambio) =>
                  actualizar({ visibilidad: eventoCambio.target.value as VisibilidadEvento })
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              >
                {VISIBILIDADES_EVENTO.map((visibilidad) => (
                  <option key={visibilidad} value={visibilidad}>
                    {ETIQUETA_VISIBILIDAD[visibilidad]}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Comienza" htmlFor="evento-fecha-inicio">
              <input
                id="evento-fecha-inicio"
                type="datetime-local"
                required
                value={campos.fecha_inicio}
                onChange={(eventoCambio) => actualizar({ fecha_inicio: eventoCambio.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </Campo>

            <Campo etiqueta="Termina" htmlFor="evento-fecha-fin">
              <input
                id="evento-fecha-fin"
                type="datetime-local"
                required
                value={campos.fecha_fin}
                onChange={(eventoCambio) => actualizar({ fecha_fin: eventoCambio.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </Campo>

            <Campo etiqueta="Lugar" htmlFor="evento-lugar">
              <select
                id="evento-lugar"
                required
                value={campos.lugar_id}
                onChange={(eventoCambio) => actualizar({ lugar_id: eventoCambio.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              >
                <option value="">Elige un lugar</option>
                {(lugares.data?.items ?? []).map((lugar) => (
                  <option key={lugar._id} value={lugar._id}>
                    {`${lugar.nombre} — ${lugar.direccion}`}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Categorías" htmlFor="evento-categorias">
              <input
                id="evento-categorias"
                type="text"
                value={campos.categorias}
                onChange={(eventoCambio) => actualizar({ categorias: eventoCambio.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                placeholder="conciertos,Ixidente"
              />
            </Campo>

            <Campo etiqueta="Etiquetas" htmlFor="evento-tags">
              <input
                id="evento-tags"
                type="text"
                value={campos.tags}
                onChange={(eventoCambio) => actualizar({ tags: eventoCambio.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                placeholder="rock, entrada"
              />
            </Campo>
          </div>

          <div className="mt-4 space-y-1">
            <label
              htmlFor="evento-descripcion"
              className="block text-sm font-medium text-slate-700"
            >
              Descripción
            </label>
            <textarea
              id="evento-descripcion"
              rows={3}
              maxLength={2000}
              value={campos.descripcion}
              onChange={(eventoCambio) => actualizar({ descripcion: eventoCambio.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <div className="mt-4">
            <SelectorUsuario
              id="evento-organizador"
              etiqueta="Organizador"
              usuarioId={campos.organizador_id === "" ? null : campos.organizador_id}
              onChange={(organizadorId) => actualizar({ organizador_id: organizadorId })}
              filtros={{ tipo_usuario: "organizador" }}
              elegidoInicial={
                campos.organizador_id === ""
                  ? null
                  : { id: campos.organizador_id, texto: campos.organizador_id }
              }
            />
          </div>
        </Tarjeta>

        <Tarjeta
          titulo="Configuración"
          descripcion="Los bloques que declara el contrato de la API. El servidor decide cuáles valen para cada tipo de evento."
        >
          {contrato.isPending ? (
            <Cargando texto="Cargando el contrato…" />
          ) : contrato.isError ? (
            <AvisoError error={contrato.error} />
          ) : (
            <CamposDeEsquema
              contrato={contrato.data}
              esquema={esquemaConfiguracion}
              valor={campos.configuracion}
              onCambiar={(nuevo) =>
                actualizar({
                  configuracion:
                    typeof nuevo === "object" && nuevo !== null && !Array.isArray(nuevo)
                      ? (nuevo as Record<string, unknown>)
                      : {},
                })
              }
              idBase="evento-configuracion"
            />
          )}
        </Tarjeta>

        {errorLocal !== null ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {errorLocal}
          </p>
        ) : null}
        {errorEscritura !== null ? (
          <AvisoError
            error={errorEscritura}
            titulo={esConflicto(errorEscritura) ? "No se pudo guardar el evento" : undefined}
          />
        ) : null}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={escribiendo}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {eventoId === null ? "Crear evento" : "Guardar cambios"}
          </button>
          <button
            type="button"
            onClick={() => navegar("/gestion/eventos")}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Volver a la gestión
          </button>
        </div>
      </form>

      {eventoId !== null && evento.data ? (
        <>
          <PanelTiposTicket eventoId={eventoId} tipos={evento.data.tipos_ticket} />
          <PanelPromociones eventoId={eventoId} tiposTicket={evento.data.tipos_ticket} />
        </>
      ) : null}
    </div>
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

/**
 * El formulario tal como lo tiene el usuario, a partir del evento que se leyó.
 *
 * Las fechas viajan al campo de la interfaz con el formato que el navegador
 * entiende, y la configuración se copia: el formulario no edita el documento
 * que devolvió la API, edita una copia.
 */
function desdeEvento(evento: Evento): Campos {
  return {
    nombre: evento.nombre,
    slug: evento.slug,
    tipo_evento: evento.tipo_evento,
    descripcion: evento.descripcion ?? "",
    fecha_inicio: aCampoFechaHora(evento.fecha_inicio),
    fecha_fin: aCampoFechaHora(evento.fecha_fin),
    estado: evento.estado,
    visibilidad: evento.visibilidad,
    organizador_id: evento.organizador_id,
    lugar_id: evento.lugar_id,
    categorias: evento.categorias.join(", "),
    tags: evento.tags.join(", "),
    configuracion: { ...evento.configuracion_evento },
  };
}

/** Una lista de valores escrita con comas: las categorías y las etiquetas. */
function separar(valores: string): string[] {
  return valores
    .split(",")
    .map((valor) => valor.trim())
    .filter((valor) => valor !== "");
}
