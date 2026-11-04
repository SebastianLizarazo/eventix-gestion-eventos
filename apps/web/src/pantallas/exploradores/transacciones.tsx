import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useTransacciones } from "@/api/hooks";
import type { EstadoTransaccion, Transaccion } from "@/api/tipos";
import { formatearFechaHora, formatearMoneda } from "@/formato/es-co";
import {
  ESTADOS_TRANSACCION,
  ETIQUETA_ESTADO_CONTABLE,
  ETIQUETA_METODO_PAGO,
} from "@/formato/vocabularios";
import { AvisoError, Campo, Cargando, Tarjeta } from "@/ui/piezas";
import { Paginacion, POR_PAGINA, Tabla, type ColumnaTabla } from "@/ui/tabla";
import { BOTON, BOTON_SECUNDARIO, CONTROL, filtrosDeQuery } from "./comun";

/**
 * Explorador de transacciones: la tabla de solo lectura de
 * `GET /api/transacciones`.
 *
 * Tres decisiones que vienen del contrato y no de la pantalla:
 *
 * - **Los filtros son los del contrato y solo los del contrato.** El listado
 *   filtra por `usuario_id`, `estado`, `desde` y `hasta`, y nada más.
 * - **«Todos» es la ausencia del parámetro.** La API lee `estado` como
 *   vocabulario cerrado y rechaza un valor vacío, así que un filtro sin valor
 *   no viaja nunca.
 * - **Escribir no consulta.** El formulario tiene un borrador y un filtro
 *   aplicado: los filtros viajan al pulsar «Filtrar», no al escribir.
 */

/** Los filtros de la colección de transacciones: los del contrato. */
type FiltrosTransaccion = {
  estado: EstadoTransaccion | "";
  usuario_id: string;
  desde: string;
  hasta: string;
};

/** El estado inicial de los filtros: sin filtro, que es la ausencia. */
const FILTROS_INICIALES: FiltrosTransaccion = {
  estado: "",
  usuario_id: "",
  desde: "",
  hasta: "",
};

/**
 * Las columnas de la tabla de transacciones.
 *
 * Los identificadores se muestran crudos y en monoespaciada: son llaves, no
 * textos, y su forma es parte de lo que se demuestra en la pantalla.
 */
const COLUMNAS: ColumnaTabla<Transaccion>[] = [
  {
    titulo: "Usuario",
    render: (transaccion) => (
      <span className="font-mono text-xs text-slate-600">{transaccion.usuario_id}</span>
    ),
  },
  {
    titulo: "Ticket",
    render: (transaccion) => (
      <span className="font-mono text-xs text-slate-600">{transaccion.ticket_id}</span>
    ),
  },
  { titulo: "Monto", render: (transaccion) => formatearMoneda(transaccion.monto_cop) },
  { titulo: "Moneda", render: (transaccion) => transaccion.moneda },
  { titulo: "Método", render: (transaccion) => ETIQUETA_METODO_PAGO[transaccion.metodo_pago] },
  { titulo: "Pasarela", render: (transaccion) => transaccion.pasarela },
  {
    titulo: "Estado",
    render: (transaccion) => ETIQUETA_ESTADO_CONTABLE[transaccion.estado],
  },
  {
    titulo: "Referencia",
    render: (transaccion) => (
      <span className="font-mono text-xs text-slate-600">{transaccion.referencia_pasarela}</span>
    ),
  },
  { titulo: "Creada", render: (transaccion) => formatearFechaHora(transaccion.creada_en) },
  {
    titulo: "Confirmada",
    // Mientras el cargo está pendiente, la API no manda `confirmada_en`: la
    // celda dice «—» en vez de fingir una fecha.
    render: (transaccion) => formatearFechaHora(transaccion.confirmada_en),
  },
];

/** Explorador de transacciones: la tabla de solo lectura de la colección. */
export function ExploradorTransacciones() {
  // Lo que el usuario está escribiendo, que todavía no se ha aplicado.
  const [borrador, setBorrador] = useState<FiltrosTransaccion>(FILTROS_INICIALES);
  // Lo que la API tiene que responder.
  const [aplicados, setAplicados] = useState<FiltrosTransaccion>(FILTROS_INICIALES);
  // La página a la vista, contada desde cero.
  const [pagina, setPagina] = useState(0);

  const filtros = useMemo(() => filtrosDeQuery(aplicados), [aplicados]);

  const transacciones = useTransacciones({
    ...filtros,
    skip: pagina * POR_PAGINA,
    limit: POR_PAGINA,
  });

  const filas = transacciones.data?.items ?? [];
  const total = transacciones.data?.total ?? null;
  // Sin total no se sabe cuántas páginas hay: la paginación llega hasta que la
  // página viene incompleta, que es la única señal que hay.
  const paginas = total === null ? null : Math.max(1, Math.ceil(total / POR_PAGINA));

  /** Cambia el estado del borrador: todavía no consulta nada. */
  function cambiarEstado(evento: ChangeEvent<HTMLSelectElement>): void {
    setBorrador((actual) => ({ ...actual, estado: estadoDe(evento.target.value) }));
  }

  /** Cambia el usuario del borrador: todavía no consulta nada. */
  function cambiarUsuario(evento: ChangeEvent<HTMLInputElement>): void {
    setBorrador((actual) => ({ ...actual, usuario_id: evento.target.value }));
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
        descripcion="Los filtros son los del contrato: el listado solo admite estado, usuario y rango de fechas."
      >
        <form onSubmit={aplicar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Campo id="transacciones-estado" etiqueta="Estado">
              <select
                id="transacciones-estado"
                value={borrador.estado}
                onChange={cambiarEstado}
                className={CONTROL}
              >
                <option value="">Todos</option>
                {ESTADOS_TRANSACCION.map((estado) => (
                  <option key={estado} value={estado}>
                    {ETIQUETA_ESTADO_CONTABLE[estado]}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo id="transacciones-usuario" etiqueta="Usuario">
              <input
                id="transacciones-usuario"
                type="text"
                value={borrador.usuario_id}
                onChange={cambiarUsuario}
                className={CONTROL}
                placeholder="65a0000000000000000000b1"
              />
            </Campo>

            <Campo id="transacciones-desde" etiqueta="Desde">
              <input
                id="transacciones-desde"
                type="date"
                value={borrador.desde}
                onChange={cambiarFecha("desde")}
                className={CONTROL}
              />
            </Campo>

            <Campo id="transacciones-hasta" etiqueta="Hasta">
              <input
                id="transacciones-hasta"
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

      {transacciones.isPending ? (
        <Tarjeta titulo="Transacciones">
          <Cargando />
        </Tarjeta>
      ) : transacciones.isError ? (
        <Tarjeta titulo="Transacciones">
          <AvisoError error={transacciones.error} />
        </Tarjeta>
      ) : (
        <>
          <Tabla
            titulo="Transacciones"
            descripcion="Los cargos que cumplen los filtros aplicados."
            columnas={COLUMNAS}
            filas={filas}
            clave={(transaccion) => transaccion._id}
            vacio="No hay transacciones que cumplan los filtros"
          />

          <Paginacion
            etiqueta="transacciones"
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
 * Convierte el valor del desplegable en un estado del contrato.
 *
 * Solo los cinco estados del vocabulario son válidos: cualquier otra cosa es
 * «Todos», que es la ausencia del filtro.
 */
function estadoDe(valor: string): EstadoTransaccion | "" {
  return ESTADOS_TRANSACCION.find((estado) => estado === valor) ?? "";
}
