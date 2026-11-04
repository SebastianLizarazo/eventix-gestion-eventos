import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiClient } from "./cliente";
import type { ContratoOpenApi } from "./contrato";
import type {
  Asistente,
  Auditoria,
  CambiosEvento,
  CierreContable,
  Compra,
  CompraEntrada,
  DashboardEvento,
  EntradaEvento,
  EntradaPromocion,
  EntradaTipoTicket,
  EstadoTicket,
  Evento,
  Lugar,
  Pagina,
  Promocion,
  RankingVendidos,
  Salud,
  Ticket,
  TipoTicket,
  Transaccion,
  Usuario,
} from "./tipos";

/**
 * Capa de datos: los hooks de React Query sobre el cliente HTTP.
 *
 * La interfaz **no habla con la API** más que a través de este archivo. Los
 * hooks son genéricos a propósito: las ocho pantallas del roadmap comparten
 * la misma forma de leer (una lista paginada, un detalle) y la misma de
 * escribir (una mutación que invalida lo que toca), así que esa forma se
 * escribe una sola vez y cada pantalla solo declara su ruta y su clave.
 *
 * Dos decisiones que conviene tener presentes:
 *
 * - **La clave de caché es lo que se invalida.** Por eso las claves empiezan
 *   por el nombre del recurso: `["eventos", …]` cubre la lista y el detalle,
 *   y una mutación invalida el prefijo entero.
 * - **El `signal` de React Query viaja al `fetch`.** Al cancelar una query
 *   que ya no interesa, la petición se aborta de verdad en el navegador.
 */

/** Filtros de una lista: los parámetros que la API acepta en la query. */
export type FiltrosLista = Record<string, string | number | boolean | null | undefined>;

/** Prefijos de caché por recurso: son los que se invalidan al escribir. */
export const CLAVES = {
  salud: ["salud"],
  eventos: ["eventos"],
  tickets: ["tickets"],
  transacciones: ["transacciones"],
  usuarios: ["usuarios"],
  lugares: ["lugares"],
  auditoria: ["auditoria"],
  reportes: ["reportes"],
} as const;

/**
 * Una consulta que no es una lista ni un detalle: una vista con parámetros.
 *
 * Los reportes son exactamente eso —vistas agregadas con sus filtros—, así que
 * esta es la forma que comparten. Con `habilitada: false` la consulta queda
 * apagada: es lo que permite que un componente pida un reporte solo cuando ya
 * sabe qué evento tiene.
 */
export function useConsultar<T>(
  clave: readonly unknown[],
  ruta: string,
  filtros?: FiltrosLista,
  opciones?: { habilitada?: boolean },
): UseQueryResult<T, Error> {
  return useQuery({
    queryKey: [...clave, filtros ?? {}],
    queryFn: ({ signal }) => apiClient.obtener<T>(ruta, { query: filtros, signal }),
    enabled: opciones?.habilitada ?? true,
  });
}

/**
 * Una lista paginada de cualquier recurso.
 *
 * @param clave prefijo de caché del recurso.
 * @param ruta ruta de la API, sin el prefijo `/api`.
 * @param filtros parámetros de la query (paginación y filtros propios).
 */
export function useListar<T>(
  clave: readonly unknown[],
  ruta: string,
  filtros?: FiltrosLista,
): UseQueryResult<Pagina<T>, Error> {
  return useConsultar<Pagina<T>>(clave, ruta, filtros);
}

/**
 * Un recurso por identificador.
 *
 * Con `ruta` en `null` la consulta queda deshabilitada: es lo que permite que
 * un componente pida el detalle solo cuando ya sabe qué identificador tiene.
 */
export function useDetalle<T>(
  clave: readonly unknown[],
  ruta: string | null,
): UseQueryResult<T, Error> {
  return useQuery({
    queryKey: [...clave],
    queryFn: ({ signal }) => {
      if (ruta === null) {
        throw new Error("No se puede leer un recurso sin ruta");
      }

      return apiClient.obtener<T>(ruta, { signal });
    },
    enabled: ruta !== null,
  });
}

/** Qué invalida una mutación cuando termina bien. */
export type OpcionesMutacion<TSalida> = {
  /** Claves de caché que se invalidan al terminar. */
  invalida: readonly (readonly unknown[])[];
  /** Qué hace el componente con el resultado. */
  alTerminar?: (resultado: TSalida) => void;
};

/**
 * Una escritura contra la API.
 *
 * La mutación **no invalida nada por su cuenta**: el componente declara qué
 * queda viejo cuando la escritura sale bien. Así, un evento editado invalida
 * los eventos y no la lista de usuarios.
 */
export function useMutar<TEntrada, TSalida>(
  operacion: (entrada: TEntrada) => Promise<TSalida>,
  opciones: OpcionesMutacion<TSalida>,
): UseMutationResult<TSalida, Error, TEntrada> {
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: operacion,
    onSuccess: (resultado) => {
      for (const clave of opciones.invalida) {
        void cliente.invalidateQueries({ queryKey: clave });
      }

      opciones.alTerminar?.(resultado);
    },
  });
}

/**
 * Cuántos documentos tiene una colección.
 *
 * La API devuelve el total de la colección en la página (`total`), así que
 * para contar basta con pedir **una** página de un elemento: no hace falta
 * traer los documentos para saber cuántos hay.
 */
export function useConteo(recurso: string): UseQueryResult<number | null, Error> {
  return useQuery({
    queryKey: ["conteo", recurso],
    queryFn: async ({ signal }) => {
      const pagina = await apiClient.obtener<Pagina<unknown>>(`/${recurso}`, {
        query: { limit: 1 },
        signal,
      });

      return pagina.total;
    },
  });
}

/** Estado de la API: si responde y si MongoDB está arriba. */
export function useSalud(): UseQueryResult<Salud, Error> {
  return useQuery({
    queryKey: CLAVES.salud,
    queryFn: ({ signal }) =>
      apiClient.obtener<Salud>("/health", { signal, estadosAceptados: [503] }),
    // La salud es lo que cambia sin que nadie escriba nada: se refresca sola.
    refetchInterval: 30_000,
  });
}

/** Página de eventos, con los filtros de la API. */
export function useEventos(filtros?: FiltrosLista): UseQueryResult<Pagina<Evento>, Error> {
  return useListar<Evento>(CLAVES.eventos, "/eventos", { limit: 50, ...filtros });
}

/** Un evento por identificador. */
export function useEvento(id: string | null): UseQueryResult<Evento, Error> {
  return useDetalle<Evento>([...CLAVES.eventos, id], id === null ? null : `/eventos/${id}`);
}

/**
 * El contrato OpenAPI que la API publica.
 *
 * La interfaz lo consume para construir los formularios con los campos que el
 * servidor declara (spec S10): es lo que hace que el editor de la
 * configuración no dependa de una lista de campos escrita a mano.
 */
export function useContrato(): UseQueryResult<ContratoOpenApi, Error> {
  return useQuery({
    queryKey: ["contrato"],
    queryFn: ({ signal }) => apiClient.obtener<ContratoOpenApi>("/openapi.json", { signal }),
  });
}

/**
 * Alta de un evento.
 *
 * Al terminar bien invalida la lista de eventos: el nuevo aparece en la
 * tabla y en el catálogo sin recargar la página.
 */
export function useCrearEvento() {
  return useMutar<EntradaEvento, Evento>(
    (entrada) => apiClient.crear<Evento>("/eventos", entrada),
    { invalida: [CLAVES.eventos] },
  );
}

/**
 * Edición de un evento.
 *
 * Los cambios llevan la versión que se leyó (`_v`): si el documento cambió
 * mientras el formulario estaba abierto, la API responde `409` y la
 * pantalla lo muestra como un conflicto en vez de pisar lo que otro escribió.
 */
export function useEditarEvento() {
  return useMutar<{ id: string; cambios: CambiosEvento }, Evento>(
    ({ id, cambios }) => apiClient.editar<Evento>(`/eventos/${id}`, cambios),
    { invalida: [CLAVES.eventos] },
  );
}

/**
 * Baja de un evento.
 *
 * El borrado es del documento del evento: la API no arrastra los tickets ya
 * vendidos, así que la pantalla avisa antes de hacerlo.
 */
export function useBorrarEvento() {
  return useMutar<string, void>((id) => apiClient.borrar<void>(`/eventos/${id}`), {
    invalida: [CLAVES.eventos, CLAVES.tickets, CLAVES.transacciones],
  });
}

/**
 * Alta de un tipo de ticket en un evento.
 *
 * Los tipos de ticket son un sub-recurso del evento: van embebidos en él, y
 * por eso se editan contra el evento y no contra una colección aparte.
 */
export function useCrearTipoTicket(eventoId: string) {
  return useMutar<EntradaTipoTicket, TipoTicket>(
    (entrada) => apiClient.crear<TipoTicket>(`/eventos/${eventoId}/tipos-ticket`, entrada),
    { invalida: [[...CLAVES.eventos, eventoId]] },
  );
}

/**
 * Edición de un tipo de ticket.
 *
 * El API no reescribe el elemento entero: solo los campos editables. Por eso
 * el cupo ya vendido sobrevive a una edición del aforo.
 */
export function useEditarTipoTicket(eventoId: string) {
  return useMutar<{ tipoId: string; cambios: EntradaTipoTicket }, TipoTicket>(
    ({ tipoId, cambios }) =>
      apiClient.editar<TipoTicket>(`/eventos/${eventoId}/tipos-ticket/${tipoId}`, cambios),
    { invalida: [[...CLAVES.eventos, eventoId]] },
  );
}

/**
 * Baja de un tipo de ticket.
 *
 * La API la rechaza con `409` cuando alguna promoción lo aplica: el mensaje
 * dice que las quites primero, y la pantalla lo muestra tal cual.
 */
export function useBorrarTipoTicket(eventoId: string) {
  return useMutar<string, void>(
    (tipoId) => apiClient.borrar<void>(`/eventos/${eventoId}/tipos-ticket/${tipoId}`),
    { invalida: [[...CLAVES.eventos, eventoId]] },
  );
}

/**
 * Baja de una promoción de un evento.
 *
 * Existe porque el borrado de un tipo de ticket que una promoción aplica
 * está bloqueado: sin esta vía, la instrucción del propio servidor («quítalas
 * primero») no tendría a dónde ir.
 */
export function useBorrarPromocion(eventoId: string) {
  return useMutar<string, void>(
    (codigo) => apiClient.borrar<void>(`/eventos/${eventoId}/promociones/${codigo}`),
    { invalida: [[...CLAVES.eventos, eventoId]] },
  );
}

/**
 * Lugares: la lista que el catálogo usa para filtrar y para poner nombre a los
 * eventos.
 *
 * La colección de lugares es pequeña y cabe en una página: por eso se pide
 * entera y no en trozos. El límite es el máximo que acepta la API (200), y da
 * de sobra para los 120 lugares del dataset.
 */
export function useLugares(): UseQueryResult<Pagina<Lugar>, Error> {
  return useListar<Lugar>(CLAVES.lugares, "/lugares", { limit: 200 });
}

/** Un lugar por identificador: el nombre del sitio donde se hace el evento. */
export function useLugar(id: string | null): UseQueryResult<Lugar, Error> {
  return useDetalle<Lugar>([...CLAVES.lugares, id], id === null ? null : `/lugares/${id}`);
}

/**
 * Promociones de un evento.
 *
 * Se leen por su propio endpoint (`/eventos/{id}/promociones`) y no del
 * documento del evento: así la lista de promociones se invalida sola cuando una
 * de ellas cambia, sin tener que releer el evento entero.
 */
export function usePromociones(eventoId: string | null): UseQueryResult<Promocion[], Error> {
  return useDetalle<Promocion[]>(
    [...CLAVES.eventos, eventoId, "promociones"],
    eventoId === null ? null : `/eventos/${eventoId}/promociones`,
  );
}

/**
 * Alta de una promoción en un evento.
 *
 * Al terminar bien invalida el prefijo `["eventos", eventoId]`: eso cubre la
 * ficha del evento y la lista de sus promociones, que es lo único que cambia.
 */
export function useCrearPromocion(eventoId: string) {
  return useMutar<EntradaPromocion, Promocion>(
    (entrada) => apiClient.crear<Promocion>(`/eventos/${eventoId}/promociones`, entrada),
    { invalida: [[...CLAVES.eventos, eventoId]] },
  );
}

/**
 * Edición de una promoción de un evento.
 *
 * La promoción se identifica por su código en la ruta, y el cuerpo son los
 * campos que cambian: el código también se puede editar, y en ese caso la API
 * renombra la promoción en el mismo movimiento.
 */
export function useEditarPromocion(eventoId: string) {
  return useMutar<{ codigo: string; cambios: EntradaPromocion }, Promocion>(
    ({ codigo, cambios }) =>
      apiClient.editar<Promocion>(`/eventos/${eventoId}/promociones/${codigo}`, cambios),
    { invalida: [[...CLAVES.eventos, eventoId]] },
  );
}

/**
 * Dashboard live de un evento.
 *
 * Se resuelve con **una sola lectura** sobre `eventos`: el evento embeba sus
 * tipos de ticket y sus métricas, así que el dashboard no necesita unir
 * colecciones.
 */
export function useDashboardEvento(
  eventoId: string | null,
): UseQueryResult<DashboardEvento, Error> {
  return useDetalle<DashboardEvento>(
    [...CLAVES.reportes, "dashboard", eventoId],
    eventoId === null ? null : `/reportes/eventos/${eventoId}/dashboard`,
  );
}

/**
 * Cierre contable diario.
 *
 * `desde` y `hasta` son fechas de calendario (`YYYY-MM-DD`): la API las
 * interpreta como UTC y devuelve los límites ya normalizados.
 */
export function useCierreContable(filtros?: {
  desde?: string;
  hasta?: string;
}): UseQueryResult<CierreContable, Error> {
  return useConsultar<CierreContable>(
    [...CLAVES.reportes, "cierre-contable"],
    "/reportes/cierre-contable",
    { desde: filtros?.desde, hasta: filtros?.hasta },
  );
}

/**
 * Ranking de los eventos más vendidos.
 *
 * Solo entran los eventos operativos (publicados o finalizados). La API acota
 * el límite entre 1 y 100.
 */
export function useRankingVendidos(limite = 10): UseQueryResult<RankingVendidos, Error> {
  return useConsultar<RankingVendidos>(
    [...CLAVES.reportes, "mas-vendidos"],
    "/reportes/mas-vendidos",
    { limite },
  );
}

/**
 * Página de asistentes de un evento.
 *
 * El filtro por estado es opcional, y **vacío no es un valor**: la API lo lee
 * como vocabulario cerrado, así que "todos los estados" es la ausencia del
 * parámetro, no una cadena vacía.
 */
export function useAsistentes(
  eventoId: string | null,
  filtros?: { estado?: EstadoTicket; skip?: number; limit?: number },
): UseQueryResult<Pagina<Asistente>, Error> {
  return useConsultar<Pagina<Asistente>>(
    [...CLAVES.reportes, "asistentes", eventoId],
    `/reportes/asistentes/${eventoId}`,
    { estado: filtros?.estado, skip: filtros?.skip, limit: filtros?.limit ?? 50 },
    { habilitada: eventoId !== null },
  );
}

/**
 * Página de usuarios.
 *
 * La colección de usuarios es grande —en la base local hay 180.000— y el
 * contrato **no ofrece búsqueda por texto**: `GET /api/usuarios` solo filtra
 * por `tipo_usuario` e `idioma`. Por eso el selector de usuario pagina y
 * filtra en el cliente lo que la página ya trajo, en vez de fingir un buscador
 * que el contrato no tiene.
 */
export function useUsuarios(filtros?: FiltrosLista): UseQueryResult<Pagina<Usuario>, Error> {
  return useListar<Usuario>(CLAVES.usuarios, "/usuarios", { limit: 25, ...filtros });
}

/**
 * Página de tickets.
 *
 * La colección es de solo lectura para la interfaz (spec S4): el contrato
 * ofrece los filtros `evento_id`, `estado` y `usuario_id`, y nada más.
 */
export function useTickets(filtros?: FiltrosLista): UseQueryResult<Pagina<Ticket>, Error> {
  return useListar<Ticket>(CLAVES.tickets, "/tickets", { limit: 25, ...filtros });
}

/**
 * Página de transacciones.
 *
 * Los filtros del contrato son `usuario_id`, `estado`, `desde` y `hasta`: los
 * dos últimos son fechas de calendario (`YYYY-MM-DD`).
 */
export function useTransacciones(
  filtros?: FiltrosLista,
): UseQueryResult<Pagina<Transaccion>, Error> {
  return useListar<Transaccion>(CLAVES.transacciones, "/transacciones", { limit: 25, ...filtros });
}

/**
 * Página de registros de auditoría.
 *
 * El rastro es **append-only**: la API responde `405` a un `PATCH` o a un
 * `DELETE`, así que la interfaz solo lo lee. Los filtros del contrato son
 * `actor_id`, `actor_rol`, `sujeto_tipo`, `sujeto_id`, `desde` y `hasta`.
 */
export function useAuditoria(filtros?: FiltrosLista): UseQueryResult<Pagina<Auditoria>, Error> {
  return useListar<Auditoria>(CLAVES.auditoria, "/auditoria", { limit: 25, ...filtros });
}

/**
 * Compra un ticket.
 *
 * La compra escribe en tres sitios —el ticket, la transacción y el aforo del
 * evento—, así que invalida los tres: la ficha del evento (con su ocupación),
 * los tickets y las transacciones.
 */
export function useCompra(): UseMutationResult<Compra, Error, CompraEntrada> {
  return useMutar<CompraEntrada, Compra>(
    (entrada) => apiClient.crear<Compra>("/compras", entrada),
    {
      invalida: [CLAVES.eventos, CLAVES.tickets, CLAVES.transacciones],
    },
  );
}
