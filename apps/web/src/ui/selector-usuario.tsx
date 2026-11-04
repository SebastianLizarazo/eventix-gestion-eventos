import { useState } from "react";
import { useUsuarios } from "@/api/hooks";
import type { Usuario } from "@/api/tipos";

/**
 * Selector de usuario: elige **quién paga** y **quién asiste**.
 *
 * La colección de usuarios es grande y el contrato **no ofrece búsqueda por
 * texto**: `GET /api/usuarios` solo filtra por `tipo_usuario` e `idioma`. Por
 * eso este selector pagina y filtra **en el cliente** lo que la página ya
 * trajo, en vez de fingir un buscador que el contrato no tiene.
 *
 * Tres decisiones que conviene tener presentes:
 *
 * - **El filtro es del cliente y de la página.** La caja dice "filtrar", no
 *   "buscar": no recorre toda la colección, filtra la que está a la vista.
 * - **El usuario elegido sobrevive al filtro.** Si se filtra otra cosa y el
 *   elegido deja de estar entre los resultados, sigue en la lista: el
 *   selector nunca se queda sin valor.
 * - **Es controlado.** El usuario elegido es estado de quien lo usa (la
 *   pantalla de compra), y este componente solo avisa del cambio.
 */

/** Propiedades del selector de usuario. */
export type SelectorUsuarioProps = {
  /** Identificador del control: distingue dos selectores en la misma pantalla. */
  id: string;
  /** Texto de la etiqueta ("Comprador", "Asistente"). */
  etiqueta: string;
  /** Identificador del usuario elegido, o `null` si todavía no hay ninguno. */
  usuarioId: string | null;
  /** Avisa del usuario que se eligió. */
  onChange: (usuarioId: string) => void;
};

/** Cuántos usuarios se piden por página. */
const POR_PAGINA = 25;

/** Las clases del control de formulario: los dos campos se ven igual. */
const CONTROL =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none";

/** Selector de usuario. */
export function SelectorUsuario({ id, etiqueta, usuarioId, onChange }: SelectorUsuarioProps) {
  // El texto que filtra la página cargada.
  const [texto, setTexto] = useState("");
  // La página de usuarios que está a la vista.
  const [pagina, setPagina] = useState(0);
  // El usuario elegido, con sus datos: sobreviven al filtro y a la página.
  const [elegido, setElegido] = useState<{ id: string; nombre: string; correo: string } | null>(null);

  const usuarios = useUsuarios({ skip: pagina * POR_PAGINA, limit: POR_PAGINA });
  const recibidos = usuarios.data?.items ?? [];
  const total = usuarios.data?.total ?? null;

  // El filtro es del cliente: la API no busca usuarios por texto.
  const filtrados = recibidos.filter((usuario) => coincide(usuario, texto));

  /**
   * Las opciones del desplegable.
   *
   * Si el usuario elegido no está entre los filtrados, se conserva como
   * primera opción: el selector no puede quedarse sin valor.
   */
  const opciones = [
    ...(elegido && !filtrados.some((usuario) => usuario._id === elegido.id)
      ? [{ id: elegido.id, texto: `${elegido.nombre} — ${elegido.correo}` }]
      : []),
    ...filtrados.map((usuario) => ({
      id: usuario._id,
      texto: `${usuario.nombre} — ${usuario.email}`,
    })),
  ];

  const paginas = total === null ? null : Math.max(1, Math.ceil(total / POR_PAGINA));
  // Sin total no se sabe cuántas páginas hay: se llega hasta que la página
  // viene incompleta.
  const noHayMas = paginas !== null ? pagina + 1 >= paginas : recibidos.length < POR_PAGINA;

  /** Elige un usuario y avisa del cambio. */
  function elegir(idElegido: string) {
    const encontrado = filtrados.find((usuario) => usuario._id === idElegido);

    if (encontrado) {
      setElegido({
        id: encontrado._id,
        nombre: encontrado.nombre,
        correo: encontrado.email,
      });
    }

    onChange(idElegido);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label
            htmlFor={`${id}-filtro`}
            className="block text-sm font-medium text-slate-700"
          >
            {`Filtrar ${etiqueta.toLowerCase()}`}
          </label>
          <input
            id={`${id}-filtro`}
            type="search"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            className={CONTROL}
            placeholder="ana"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor={`${id}-lista`} className="block text-sm font-medium text-slate-700">
            {etiqueta}
          </label>
          <select
            id={`${id}-lista`}
            value={usuarioId ?? ""}
            onChange={(evento) => elegir(evento.target.value)}
            className={CONTROL}
          >
            <option value="">Elige un usuario</option>
            {opciones.map((opcion) => (
              <option key={opcion.id} value={opcion.id}>
                {opcion.texto}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setPagina((actual) => Math.max(0, actual - 1))}
          disabled={pagina === 0}
          aria-label={`Anterior — ${etiqueta}`}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Anterior
        </button>

        <button
          type="button"
          onClick={() => setPagina((actual) => actual + 1)}
          disabled={noHayMas}
          aria-label={`Siguiente — ${etiqueta}`}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Siguiente
        </button>

        <p className="text-sm text-slate-600">
          {`Página ${pagina + 1} de ${paginas ?? "—"}`}
        </p>
      </div>

      {elegido ? (
        <p className="text-sm text-slate-600">
          {`${etiqueta} elegido: `}
          <span className="font-medium text-slate-900">{elegido.nombre}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * ¿El usuario coincide con el texto escrito?
 *
 * Se miran el nombre, el correo y el documento: son los tres datos con los
 * que alguien reconoce a una persona en una lista.
 */
function coincide(usuario: Usuario, texto: string): boolean {
  const busqueda = texto.trim().toLowerCase();

  if (busqueda === "") {
    return true;
  }

  return [usuario.nombre, usuario.email, usuario.documento_identidad].some((campo) =>
    campo.toLowerCase().includes(busqueda),
  );
}
