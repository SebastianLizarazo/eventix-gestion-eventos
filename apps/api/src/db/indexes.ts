import type { Document } from "mongodb";

/**
 * Índices del modelo (documento 04 §4).
 *
 * Cada índice lleva nombre explícito: `db:setup` es idempotente y necesita
 * reconocer sus propios índices (por nombre) para no recrearlos, y los tests
 * comparan la lista real contra esta declaración.
 *
 * Los índices `text` no se pueden comparar por clave: MongoDB los reporta con
 * la forma `{ _fts: "text", _ftsx: 1 }`, así que se reconocen por nombre.
 */

/** Opciones de índice que usa el modelo (el driver acepta más, aquí no hacen falta). */
export type OpcionesIndice = {
  unique?: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: Document;
};

export type DefinicionIndice = {
  nombre: string;
  clave: Document;
  opciones?: OpcionesIndice;
};

export const INDICES: Record<string, DefinicionIndice[]> = {
  usuarios: [
    {
      nombre: "usuarios_email_normalizado_unique",
      clave: { email_normalizado: 1 },
      opciones: { unique: true },
    },
    { nombre: "usuarios_tipo_usuario", clave: { tipo_usuario: 1 } },
    { nombre: "usuarios_preferencias_idioma", clave: { "preferencias.idioma": 1 } },
  ],
  lugares: [
    { nombre: "lugares_ciudad_activo", clave: { ciudad: 1, activo: 1 } },
    { nombre: "lugares_geometria_2dsphere", clave: { geometria: "2dsphere" } },
  ],
  eventos: [
    { nombre: "eventos_slug_unique", clave: { slug: 1 }, opciones: { unique: true } },
    { nombre: "eventos_estado_fecha_inicio", clave: { estado: 1, fecha_inicio: 1 } },
    { nombre: "eventos_tipo_evento_fecha_inicio", clave: { tipo_evento: 1, fecha_inicio: 1 } },
    { nombre: "eventos_categorias", clave: { categorias: 1 } },
    { nombre: "eventos_lugar_id", clave: { lugar_id: 1 } },
    { nombre: "eventos_organizador_id", clave: { organizador_id: 1 } },
    {
      nombre: "eventos_promociones_codigo_parcial",
      clave: { "promociones.codigo": 1 },
      opciones: { partialFilterExpression: { "promociones.activo": true } },
    },
    {
      nombre: "eventos_metricas_tickets_vendidos_total",
      clave: { "metricas_evento.tickets_vendidos_total": 1 },
    },
    { nombre: "eventos_fecha_inicio", clave: { fecha_inicio: 1 } },
    {
      nombre: "eventos_texto_text",
      clave: { nombre: "text", descripcion: "text", tags: "text" },
    },
  ],
  tickets: [
    { nombre: "tickets_codigo_qr_unique", clave: { codigo_qr: 1 }, opciones: { unique: true } },
    { nombre: "tickets_evento_id_estado", clave: { evento_id: 1, estado: 1 } },
    {
      nombre: "tickets_comprado_por_usuario_emitido_en",
      clave: { comprado_por_usuario_id: 1, emitido_en: 1 },
    },
    { nombre: "tickets_transaccion_id", clave: { transaccion_id: 1 } },
    {
      nombre: "tickets_estado_validado_en_parcial",
      clave: { estado: 1, validado_en: 1 },
      opciones: { partialFilterExpression: { validado_en: { $type: "date" } } },
    },
  ],
  transacciones: [
    { nombre: "transacciones_usuario_creada_en", clave: { usuario_id: 1, creada_en: 1 } },
    { nombre: "transacciones_estado_creada_en", clave: { estado: 1, creada_en: 1 } },
    {
      // La idempotencia solo protege el cargo: una transacción rechazada o
      // anulada se puede reintentar con la misma referencia.
      nombre: "transacciones_pasarela_referencia_parcial",
      clave: { pasarela: 1, referencia_pasarela: 1 },
      opciones: {
        unique: true,
        partialFilterExpression: { estado: { $in: ["pendiente", "aprobada"] } },
      },
    },
    { nombre: "transacciones_confirmada_en", clave: { confirmada_en: 1 } },
  ],
  auditoria_eventos: [
    { nombre: "auditoria_actor_ocurrido_en", clave: { actor_id: 1, ocurrido_en: 1 } },
    { nombre: "auditoria_sujeto_tipo_sujeto_id", clave: { sujeto_tipo: 1, sujeto_id: 1 } },
    {
      nombre: "auditoria_ocurrido_en_ttl",
      clave: { ocurrido_en: 1 },
      opciones: { expireAfterSeconds: 31_536_000 },
    },
  ],
};

/** Número total de índices declarados (sin contar el `_id_` implícito). */
export const TOTAL_INDICES = Object.values(INDICES).reduce(
  (total, definiciones) => total + definiciones.length,
  0,
);
