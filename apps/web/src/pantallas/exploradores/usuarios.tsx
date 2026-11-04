import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useUsuarios } from "@/api/hooks";
import type { TipoUsuario, Usuario } from "@/api/tipos";
import { formatearFechaHora, formatearMoneda, formatearNumero } from "@/formato/es-co";
import { ETIQUETA_TIPO_USUARIO, TIPOS_USUARIO } from "@/formato/vocabularios";
import { AvisoError, Campo, Cargando, Tarjeta } from "@/ui/piezas";
import { Paginacion, POR_PAGINA, Tabla, type ColumnaTabla } from "@/ui/tabla";
import { BOTON, BOTON_SECUNDARIO, CONTROL, filtrosDeQuery } from "./comun";

/**
 * Explorador de usuarios: la tabla de solo lectura de `GET /api/usuarios`.
 *
 * Tres decisiones que vienen del contrato y no de la pantalla:
 *
 * - **Los filtros son los del contrato y solo los del contrato.** El listado
 *   filtra por `tipo_usuario` e `idioma`, y nada más: no hay búsqueda por
 *   texto de usuarios, así que esta pantalla no inventa un buscador que la
 *   API no puede responder. La colección es grande —en la base local hay
 *   180.000— y pagina de 25 en 25.
 * - **«Todos» es la ausencia del parámetro.** La API lee `tipo_usuario` como
 *   vocabulario cerrado y rechaza un valor vacío, así que un filtro sin valor
 *   no viaja nunca.
 * - **Escribir no consulta.** El formulario tiene un borrador y un filtro
 *   aplicado: los filtros viajan al pulsar «Filtrar», no al escribir.
 */

/** Los filtros de la colección de usuarios: los del contrato. */
type FiltrosUsuario = {
  tipo_usuario: TipoUsuario | "";
  idioma: string;
};

/** El estado inicial de los filtros: sin filtro, que es la ausencia. */
const FILTROS_INICIALES: FiltrosUsuario = {
  tipo_usuario: "",
  idioma: "",
};

/**
 * Las columnas de la tabla de usuarios.
 *
 * Los tipos se muestran unidos porque el contrato los guarda como arreglo: una
 * cuenta puede ser asistente y organizador a la vez.
 */
const COLUMNAS: ColumnaTabla<Usuario>[] = [
  {
    titulo: "Nombre",
    render: (usuario) => <span className="font-medium text-slate-900">{usuario.nombre}</span>,
  },
  { titulo: "Correo", render: (usuario) => usuario.email },
  {
    titulo: "Tipo",
    render: (usuario) => usuario.tipo_usuario.map((tipo) => ETIQUETA_TIPO_USUARIO[tipo]).join(", "),
  },
  { titulo: "Idioma", render: (usuario) => usuario.preferencias.idioma },
  {
    titulo: "Tickets comprados",
    render: (usuario) => formatearNumero(usuario.estadisticas.tickets_comprados),
  },
  {
    titulo: "LTV",
    render: (usuario) => formatearMoneda(usuario.estadisticas.ltv_cop),
  },
  { titulo: "Alta", render: (usuario) => formatearFechaHora(usuario.creado_en) },
  {
    titulo: "Identificador",
    render: (usuario) => <span className="font-mono text-xs text-slate-600">{usuario._id}</span>,
  },
];

/** Explorador de usuarios: la tabla de solo lectura de la colección. */
export function ExploradorUsuarios() {
  // Lo que el usuario está escribiendo, que todavía no se ha aplicado.
  const [borrador, setBorrador] = useState<FiltrosUsuario>(FILTROS_INICIALES);
  // Lo que la API tiene que responder.
  const [aplicados, setAplicados] = useState<FiltrosUsuario>(FILTROS_INICIALES);
  // La página a la vista, contada desde cero.
  const [pagina, setPagina] = useState(0);

  const filtros = useMemo(() => filtrosDeQuery(aplicados), [aplicados]);

  const usuarios = useUsuarios({
    ...filtros,
    skip: pagina * POR_PAGINA,
    limit: POR_PAGINA,
  });

  const filas = usuarios.data?.items ?? [];
  const total = usuarios.data?.total ?? null;
  // Sin total no se sabe cuántas páginas hay: la paginación llega hasta que la
  // página viene incompleta, que es la única señal que hay.
  const paginas = total === null ? null : Math.max(1, Math.ceil(total / POR_PAGINA));

  /** Cambia el tipo del borrador: todavía no consulta nada. */
  function cambiarTipo(evento: ChangeEvent<HTMLSelectElement>): void {
    setBorrador((actual) => ({ ...actual, tipo_usuario: tipoDe(evento.target.value) }));
  }

  /** Cambia el idioma del borrador: todavía no consulta nada. */
  function cambiarIdioma(evento: ChangeEvent<HTMLInputElement>): void {
    setBorrador((actual) => ({ ...actual, idioma: evento.target.value }));
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
        descripcion="Los filtros son los del contrato: el listado solo admite tipo de usuario e idioma, y no ofrece búsqueda por texto."
      >
        <form onSubmit={aplicar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="usuarios-tipo" etiqueta="Tipo de usuario">
              <select
                id="usuarios-tipo"
                value={borrador.tipo_usuario}
                onChange={cambiarTipo}
                className={CONTROL}
              >
                <option value="">Todos</option>
                {TIPOS_USUARIO.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {ETIQUETA_TIPO_USUARIO[tipo]}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo id="usuarios-idioma" etiqueta="Idioma">
              <input
                id="usuarios-idioma"
                type="text"
                value={borrador.idioma}
                onChange={cambiarIdioma}
                className={CONTROL}
                placeholder="es-CO"
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

      {usuarios.isPending ? (
        <Tarjeta titulo="Usuarios">
          <Cargando />
        </Tarjeta>
      ) : usuarios.isError ? (
        <Tarjeta titulo="Usuarios">
          <AvisoError error={usuarios.error} />
        </Tarjeta>
      ) : (
        <>
          <Tabla
            titulo="Usuarios"
            descripcion="Los usuarios que cumplen los filtros aplicados."
            columnas={COLUMNAS}
            filas={filas}
            clave={(usuario) => usuario._id}
            vacio="No hay usuarios que cumplan los filtros"
          />

          <Paginacion
            etiqueta="usuarios"
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
 * Convierte el valor del desplegable en un tipo de usuario del contrato.
 *
 * Solo los dos tipos del vocabulario son válidos: cualquier otra cosa es
 * «Todos», que es la ausencia del filtro.
 */
function tipoDe(valor: string): TipoUsuario | "" {
  return TIPOS_USUARIO.find((tipo) => tipo === valor) ?? "";
}
