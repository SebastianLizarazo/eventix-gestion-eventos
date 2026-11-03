import type { Collection, Document } from "mongodb";
import { normalizarCodigo } from "../../domain/normalization.js";
import { toObjectId } from "../../domain/ids.js";
import { eventoSchema, type Evento } from "../../domain/schemas/index.js";
import { eventoABson } from "../mapeo.js";
import {
  crearRepositorio,
  type OpcionesListado,
  type Repositorio,
  type ResultadoPaginado,
} from "./base.js";

/**
 * Repositorio de `eventos` (documento 04 §3.3).
 *
 * Cada consulta corresponde a un patrón de query del documento 04 §4.3 y
 * existe para que el índice que la sostiene se use de verdad: el filtro se
 * escribe con la forma exacta que el índice espera.
 */
export type RepositorioEventos = Repositorio<Evento> & {
  /** Busca por slug (índice `eventos_slug_unique`). */
  porSlug(slug: string): Promise<Evento | null>;
  /** Catálogo público: publicados y públicos, por fecha de inicio. */
  catalogoPublico(opciones?: OpcionesListado): Promise<ResultadoPaginado<Evento>>;
  /** Filtra por tipo de evento (índice `eventos_tipo_evento_fecha_inicio`). */
  porTipoEvento(
    tipo: Evento["tipo_evento"],
    opciones?: OpcionesListado,
  ): Promise<ResultadoPaginado<Evento>>;
  /** Filtra por una categoría (índice multikey `eventos_categorias`). */
  porCategoria(categoria: string, opciones?: OpcionesListado): Promise<ResultadoPaginado<Evento>>;
  /** Filtra por varias categorías (índice multikey `eventos_categorias`). */
  porCategorias(
    categorias: readonly string[],
    opciones?: OpcionesListado,
  ): Promise<ResultadoPaginado<Evento>>;
  /** Búsqueda full-text (índice `eventos_texto_text`). */
  buscarPorTexto(texto: string, opciones?: OpcionesListado): Promise<ResultadoPaginado<Evento>>;
  /** Eventos de un lugar (índice `eventos_lugar_id`). */
  porLugar(lugarId: string, opciones?: OpcionesListado): Promise<ResultadoPaginado<Evento>>;
  /** Eventos de un organizador (índice `eventos_organizador_id`). */
  porOrganizador(
    organizadorId: string,
    opciones?: OpcionesListado,
  ): Promise<ResultadoPaginado<Evento>>;
  /** Evento con una promoción activa (índice parcial `eventos_promociones_codigo_parcial`). */
  conPromocionActiva(codigo: string): Promise<Evento | null>;
  /** Ranking de ventas (índice `eventos_metricas_tickets_vendidos_total`). */
  masVendidos(limite: number): Promise<Evento[]>;
  /** Eventos que empiezan desde una fecha, en orden cronológico (índice `eventos_fecha_inicio`). */
  proximos(desde: Date, opciones?: OpcionesListado): Promise<ResultadoPaginado<Evento>>;
};

/**
 * Crea el repositorio de `eventos`.
 *
 * @param coleccion colección física `eventos`.
 */
export function crearRepositorioEventos(coleccion: Collection<Document>): RepositorioEventos {
  const base = crearRepositorio<Evento>({
    coleccion,
    esquema: eventoSchema,
    aBson: eventoABson,
  });

  return {
    ...base,

    async porSlug(slug) {
      return base.obtenerUno({ slug });
    },

    async catalogoPublico(opciones) {
      // El orden es parte del catálogo (publicados primero por fecha): no lo
      // deja cambiar quien llama, solo la paginación.
      return base.listar(
        { estado: "publicado", visibilidad: "publico" },
        { ...opciones, orden: { fecha_inicio: 1 } },
      );
    },

    async porTipoEvento(tipo, opciones) {
      return base.listar({ tipo_evento: tipo }, { ...opciones, orden: { fecha_inicio: 1 } });
    },

    async porCategoria(categoria, opciones) {
      return base.listar({ categorias: categoria }, opciones);
    },

    async porCategorias(categorias, opciones) {
      return base.listar({ categorias: { $in: [...categorias] } }, opciones);
    },

    async buscarPorTexto(texto, opciones) {
      return base.listar({ $text: { $search: texto } }, opciones);
    },

    async porLugar(lugarId, opciones) {
      return base.listar({ lugar_id: toObjectId(lugarId) }, opciones);
    },

    async porOrganizador(organizadorId, opciones) {
      return base.listar({ organizador_id: toObjectId(organizadorId) }, opciones);
    },

    async conPromocionActiva(codigo) {
      // El dominio persiste el código de promoción en MAYÚSCULAS
      // (`promocionSchema` lo transforma con la misma regla), así que el
      // parámetro se normaliza igual: si no, la búsqueda no encontraría el
      // documento.
      return base.obtenerUno({
        "promociones.codigo": normalizarCodigo(codigo),
        "promociones.activo": true,
      });
    },

    async masVendidos(limite) {
      // `total: false`: el ranking solo devuelve los documentos, y contar toda
      // la colección para después tirar el resultado sería un escaneo inútil.
      const { items } = await base.listar(
        {},
        { orden: { "metricas_evento.tickets_vendidos_total": -1 }, limit: limite, total: false },
      );

      return items;
    },

    async proximos(desde, opciones) {
      // El rango y el orden comparten la misma clave, así que el índice
      // `eventos_fecha_inicio` resuelve la consulta y además da el orden: sin
      // esa coincidencia el plan tendría que ordenar aparte.
      return base.listar(
        { fecha_inicio: { $gte: desde } },
        { ...opciones, orden: { fecha_inicio: 1 } },
      );
    },
  };
}
