import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useAuditoria } from "@/api/hooks";
import type { Auditoria, RolActor, TipoSujeto } from "@/api/tipos";
import { formatearFechaHora } from "@/formato/es-co";
import {
  ETIQUETA_ROL_ACTOR,
  ETIQUETA_TIPO_SUJETO,
  ROLES_ACTOR,
  TIPOS_SUJETO,
} from "@/formato/vocabularios";
import { AvisoError, Campo, Cargando, Tarjeta } from "@/ui/piezas";
import { Paginacion, POR_PAGINA, Tabla, type ColumnaTabla } from "@/ui/tabla";
import { BOTON, BOTON_SECUNDARIO, CONTROL, filtrosDeQuery } from "./comun";

/**
 * Explorador de auditoría: la tabla de solo lectura de `GET /api/auditoria`.
 *
 * La colección es **append-only**: se lee y se añade, pero no se puede
 * modificar ni borrar —la API responde `405` con `metodo_no_permitido` a un
 * `PATCH` o a un `DELETE`—. Por eso esta pantalla no ofrece ninguna acción de
 * escritura: no hay nada que ofrecer y la nota lo dice.
 *
 * Los filtros son los del contrato y solo los del contrato: `actor_rol`,
 * `sujeto_tipo`, `actor_id`, `sujeto_id`, `desde` y `hasta`. «Todos» es la
 * ausencia del parámetro, porque la API lee `actor_rol` y `sujeto_tipo` como
 * vocabularios cerrados y rechaza un valor vacío.
 */

/** Los filtros de la colección de auditoría: los del contrato. */
type FiltrosAuditoria = {
  actor_rol: RolActor | "";
  sujeto_tipo: TipoSujeto | "";
  actor_id: string;
  sujeto_id: string;
  desde: string;
  hasta: string;
};

/** El estado inicial de los filtros: sin filtro, que es la ausencia. */
const FILTROS_INICIALES: FiltrosAuditoria = {
  actor_rol: "",
  sujeto_tipo: "",
  actor_id: "",
  sujeto_id: "",
  desde: "",
  hasta: "",
};

/**
 * La nota que explica por qué esta pantalla no escribe nada.
 *
 * Es el único punto donde el rastro se explica: el resto de las pantallas de
 * solo lectura no necesitan decir que no escriben.
 */
const NOTA_SOLO_ADICION =
  "Rastro de solo adición: se lee y se añade, pero no se puede modificar ni borrar. La API responde 405 a un PATCH o a un DELETE.";

/**
 * Las columnas de la tabla de auditoría.
 *
 * El actor y el sujeto se muestran con su etiqueta y con su identificador
 * crudo: el tipo dice **sobre qué** pasó y el identificador dice **sobre qué
 * documento**.
 */
const COLUMNAS: ColumnaTabla<Auditoria>[] = [
  { titulo: "Ocurrida", render: (registro) => formatearFechaHora(registro.ocurrido_en) },
  {
    titulo: "Actor",
    render: (registro) => (
      <div>
        <p className="font-mono text-xs text-slate-600">{registro.actor_id}</p>
        <p className="text-xs text-slate-500">{ETIQUETA_ROL_ACTOR[registro.actor_rol]}</p>
      </div>
    ),
  },
  { titulo: "Acción", render: (registro) => registro.accion },
  {
    titulo: "Sujeto",
    render: (registro) => (
      <div>
        <p className="text-slate-700">{ETIQUETA_TIPO_SUJETO[registro.sujeto_tipo]}</p>
        <p className="font-mono text-xs text-slate-600">{registro.sujeto_id}</p>
      </div>
    ),
  },
  {
    titulo: "Detalle",
    // El `metadata` es libre: se muestran las claves que trae, que es lo que
    // el dominio decidió registrar.
    render: (registro) => (
      <span className="font-mono text-xs text-slate-600">{clavesDe(registro.metadata)}</span>
    ),
  },
];

/** Explorador de auditoría: la tabla de solo lectura del rastro. */
export function ExploradorAuditoria() {
  // Lo que el usuario está escribiendo, que todavía no se ha aplicado.
  const [borrador, setBorrador] = useState<FiltrosAuditoria>(FILTROS_INICIALES);
  // Lo que la API tiene que responder.
  const [aplicados, setAplicados] = useState<FiltrosAuditoria>(FILTROS_INICIALES);
  // La página a la vista, contada desde cero.
  const [pagina, setPagina] = useState(0);

  const filtros = useMemo(() => filtrosDeQuery(aplicados), [aplicados]);

  const auditoria = useAuditoria({
    ...filtros,
    skip: pagina * POR_PAGINA,
    limit: POR_PAGINA,
  });

  const filas = auditoria.data?.items ?? [];
  const total = auditoria.data?.total ?? null;
  // Sin total no se sabe cuántas páginas hay: la paginación llega hasta que la
  // página viene incompleta, que es la única señal que hay.
  const paginas = total === null ? null : Math.max(1, Math.ceil(total / POR_PAGINA));

  /** Cambia el rol del borrador: todavía no consulta nada. */
  function cambiarRol(evento: ChangeEvent<HTMLSelectElement>): void {
    setBorrador((actual) => ({ ...actual, actor_rol: rolDe(evento.target.value) }));
  }

  /** Cambia el tipo de sujeto del borrador: todavía no consulta nada. */
  function cambiarSujetoTipo(evento: ChangeEvent<HTMLSelectElement>): void {
    setBorrador((actual) => ({ ...actual, sujeto_tipo: tipoDe(evento.target.value) }));
  }

  /** Cambia un identificador del borrador: todavía no consulta nada. */
  function cambiarId(campo: "actor_id" | "sujeto_id") {
    return (evento: ChangeEvent<HTMLInputElement>): void => {
      setBorrador((actual) => ({ ...actual, [campo]: evento.target.value }));
    };
  }

  /** Cambia una fecha del borrador: todavía no consulta nada. */
  function cambiarFecha(campo: "desde" | "hasta") {
    return (evento: ChangeEvent<HTMLInputElement>): void => {
      setBorrador((actual) => ({ ...actual, [campo]: evento.target.value }));
    };
  }

  /** Aplica el borrador y vuelve a la primera página. */
  function aplicar(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();

    setAplicados({ ...borrador });
    setPagina(0);
  }

  /** Vuelve al estado inicial: sin filtros y en la primera página. */
  function limpiar(): void {
    setBorrador({ ...FILTROS_INICIALES });
    setAplicados({ ...FILTROS_INICIALES });
    setPagina(0);
  }

  return (
    <div className="space-y-6">
      <Tarjeta
        titulo="Filtros"
        descripcion="Los filtros son los del contrato: rol y tipo del actor, actor y sujeto, y rango de fechas."
      >
        <form onSubmit={aplicar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo id="auditoria-rol" etiqueta="Rol del actor">
              <select
                id="auditoria-rol"
                value={borrador.actor_rol}
                onChange={cambiarRol}
                className={CONTROL}
              >
                <option value="">Todos</option>
                {ROLES_ACTOR.map((rol) => (
                  <option key={rol} value={rol}>
                    {ETIQUETA_ROL_ACTOR[rol]}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo id="auditoria-tipo-sujeto" etiqueta="Tipo de sujeto">
              <select
                id="auditoria-tipo-sujeto"
                value={borrador.sujeto_tipo}
                onChange={cambiarSujetoTipo}
                className={CONTROL}
              >
                <option value="">Todos</option>
                {TIPOS_SUJETO.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {ETIQUETA_TIPO_SUJETO[tipo]}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo id="auditoria-actor" etiqueta="Actor">
              <input
                id="auditoria-actor"
                type="text"
                value={borrador.actor_id}
                onChange={cambiarId("actor_id")}
                className={CONTROL}
                placeholder="65a0000000000000000000b1"
              />
            </Campo>

            <Campo id="auditoria-sujeto" etiqueta="Sujeto">
              <input
                id="auditoria-sujeto"
                type="text"
                value={borrador.sujeto_id}
                onChange={cambiarId("sujeto_id")}
                className={CONTROL}
                placeholder="65a0000000000000000000e1"
              />
            </Campo>

            <Campo id="auditoria-desde" etiqueta="Desde">
              <input
                id="auditoria-desde"
                type="date"
                value={borrador.desde}
                onChange={cambiarFecha("desde")}
                className={CONTROL}
              />
            </Campo>

            <Campo id="auditoria-hasta" etiqueta="Hasta">
              <input
                id="auditoria-hasta"
                type="date"
                value={borrador.hasta}
                onChange={cambiarFecha("hasta")}
                className={CONTROL}
              />
            </Campo>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className={BOTON}>
              Filtrar
            </button>
            <button type="button" onClick={limpiar} className={BOTON_SECUNDARIO}>
              Limpiar
            </button>
          </div>
        </form>
      </Tarjeta>

      {auditoria.isPending ? (
        <Tarjeta titulo="Auditoría">
          <Cargando />
        </Tarjeta>
      ) : auditoria.isError ? (
        <Tarjeta titulo="Auditoría">
          <AvisoError error={auditoria.error} />
        </Tarjeta>
      ) : (
        <>
          <Tabla
            titulo="Auditoría"
            descripcion={NOTA_SOLO_ADICION}
            columnas={COLUMNAS}
            filas={filas}
            clave={(registro) => registro._id}
            vacio="No hay registros de auditoría que cumplan los filtros"
          />

          <Paginacion
            etiqueta="auditoría"
            pagina={pagina}
            paginas={paginas}
            total={total}
            filas={filas.length}
            onCambio={setPagina}
          />
        </>
      )}
    </div>
  );
}

/**
 * Convierte el valor del desplegable en un rol del contrato.
 *
 * Solo los tres roles del vocabulario son válidos: cualquier otra cosa es
 * «Todos», que es la ausencia del filtro.
 */
function rolDe(valor: string): RolActor | "" {
  return ROLES_ACTOR.find((rol) => rol === valor) ?? "";
}

/**
 * Convierte el valor del desplegable en un tipo de sujeto del contrato.
 *
 * Solo los seis tipos del vocabulario son válidos: cualquier otra cosa es
 * «Todos», que es la ausencia del filtro.
 */
function tipoDe(valor: string): TipoSujeto | "" {
  return TIPOS_SUJETO.find((tipo) => tipo === valor) ?? "";
}

/**
 * Las claves del `metadata` de un registro.
 *
 * El detalle es libre y lo que importa es **qué** se registró, así que se
 * muestran las claves. Un registro sin detalle dice «—»: una celda en blanco
 * parecería un dato que no se cargó.
 */
function clavesDe(metadata: Record<string, unknown>): string {
  const claves = Object.keys(metadata ?? {});

  return claves.length === 0 ? "—" : claves.join(", ");
}
