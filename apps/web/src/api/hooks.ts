import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiClient } from "./cliente";
import type { EntradaPromocion, Evento, Lugar, Pagina, Promocion, Salud } from "./tipos";

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
} as const;

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
  return useQuery({
    queryKey: [...clave, filtros ?? {}],
    queryFn: ({ signal }) => apiClient.obtener<Pagina<T>>(ruta, { query: filtros, signal }),
  });
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
 * Lugares: la lista que el catálogo usa para filtrar y para poner nombre a los
 * eventos.
 *
 * La colección de lugares es pequeña y cabe en una página: por eso se pide
 * entera y no en trozos.
 */
export function useLugares(): UseQueryResult<Pagina<Lugar>, Error> {
  return useListar<Lugar>(CLAVES.lugares, "/lugares", { limit: 100 });
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
