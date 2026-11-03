/**
 * Tipos del contrato de la API de Eventix: la frontera tipada entre la
 * interfaz y la API.
 *
 * La interfaz es **consumidor puro** del contrato OpenAPI que la API ya
 * publica (spec S3): este archivo no importa nada y no valida nada, solo
 * describe la forma de lo que llega por el cable. Cada tipo sale de los
 * esquemas Zod del dominio (`apps/api/src/domain/schemas/`), que son la
 * fuente de verdad.
 *
 * Dos convenciones del contrato, y no son caprichos del cliente:
 *
 * 1. **Las fechas viajan como texto ISO 8601, no como `Date`.** La API las
 *    serializa en UTC (`2026-03-15T00:00:00.000Z`); una fecha sin zona se
 *    interpreta como UTC, nunca como la hora local del servidor. Quien
 *    necesite un `Date` la construye en el borde (ver `formato/es-co.ts`).
 * 2. **Los identificadores viajan como texto hexadecimal de 24 caracteres.**
 *    El `ObjectId` nativo de MongoDB se normaliza a hexadecimal al leer
 *    (`objectIdSchema`), así que en la interfaz un identificador siempre es
 *    un `string`.
 */

/**
 * Página de resultados que devuelve la API: una porción de una colección con
 * los datos de la paginación.
 *
 * `total` es `null` cuando la lectura no lo calculó —la API no siempre
 * cuenta los documentos que cumplen el filtro—, así que la interfaz tiene
 * que distinguir "cero resultados" de "no se sabe cuántos hay".
 */
export type Pagina<T> = {
  items: T[];
  total: number | null;
  skip: number;
  limit: number;
};

/**
 * Estado de la API que devuelve `GET /api/health`.
 *
 * `status` va degradado cuando MongoDB no responde: la API sigue
 * contestando, pero no puede leer datos.
 */
export type Salud = {
  status: "ok" | "degraded";
  mongo: "up" | "down";
  version: string;
  uptimeSeconds: number;
};

/**
 * Vocabularios del dominio: las listas cerradas de valores que la API
 * acepta.
 *
 * Son uniones literales y no `string`: el compilador es lo que impide
 * mandar un `tipo_evento` que la API va a rechazar.
 */

/** Tipo de evento: define qué configuración admite el evento. */
export type TipoEvento = "corporativo" | "masivo" | "hibrido" | "academico";

/** Estado del evento: por el que pasa desde que se crea hasta que se liquida. */
export type EstadoEvento = "borrador" | "publicado" | "cancelado" | "finalizado";

/** Visibilidad del evento: decide si aparece en el catálogo público. */
export type VisibilidadEvento = "publico" | "privado";

/** Tipo de promoción: cómo se aplica el descuento. */
export type TipoPromocion = "porcentaje" | "2x1" | "early_bird";

/** Tipo de usuario: los roles que puede tener una misma cuenta. */
export type TipoUsuario = "asistente" | "organizador";

/** Canal de notificación que el usuario tiene habilitado. */
export type CanalNotificacion = "email" | "sms" | "push";

/** Tipo de pregunta de la encuesta post evento. */
export type TipoPregunta = "escala" | "abierta";

/**
 * Evento: el documento central de la colección `eventos`.
 *
 * Embebe sus tipos de ticket, sus promociones y su configuración para que
 * el dashboard operativo se resuelva con una sola lectura. `_id` siempre
 * viene: el repositorio se lo asigna al documento antes de devolverlo.
 */
export type Evento = {
  _id: string;
  slug: string;
  nombre: string;
  tipo_evento: TipoEvento;
  descripcion?: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: EstadoEvento;
  visibilidad: VisibilidadEvento;
  organizador_id: string;
  lugar_id: string;
  categorias: string[];
  configuracion_evento: ConfiguracionEvento;
  tipos_ticket: TipoTicket[];
  promociones: Promocion[];
  metricas_evento?: MetricasEvento;
  tags: string[];
  creado_en: string;
  actualizado_en: string;
  _v: number;
};

/**
 * Tipo de ticket: una forma de entrada a un evento, embebida en el evento.
 *
 * Su `_id` lo genera la API al crearlo, porque es el que lo referencia el
 * ticket comprado y la promoción que se le aplica.
 */
export type TipoTicket = {
  _id: string;
  nombre: string;
  precio_cop: number;
  aforo_total: number;
  aforo_vendido: number;
  restricciones: Restricciones;
};

/**
 * Restricciones de compra de un tipo de ticket.
 *
 * Todas son opcionales de verdad: el esquema las declara así, y un tipo de
 * ticket al que no se le pone ninguna restricción trae el bloque vacío.
 */
export type Restricciones = {
  edad_minima?: number;
  max_por_compra?: number;
  venta_inicio?: string;
  venta_fin?: string;
};

/**
 * Promoción: un descuento embebido en el evento.
 *
 * `usos_realizados` y `activo` los lleva el sistema —los incrementa el
 * flujo de compra—, no el cliente.
 */
export type Promocion = {
  codigo: string;
  tipo: TipoPromocion;
  valor: number;
  aplica_a_tipo_ticket_ids: string[];
  vigencia_inicio: string;
  vigencia_fin: string;
  usos_maximos?: number;
  usos_realizados: number;
  activo: boolean;
};

/**
 * Configuración del evento: el bloque flexible que cambia según el tipo.
 *
 * Cada bloque es opcional porque no todos los tipos de evento lo usan: el
 * bloque `academico` solo existe en eventos de tipo `academico`, y el
 * `hibrido` solo en los híbridos.
 */
export type ConfiguracionEvento = {
  plantilla_id?: string;
  branding?: Branding;
  encuesta_post_evento?: EncuestaEvento;
  hibrido?: ConfiguracionHibrido;
  academico?: ConfiguracionAcademico;
};

/** Identidad visual del evento: los colores y el logo que lo representan. */
export type Branding = {
  color_primario: string;
  color_secundario: string;
  logo_url: string;
};

/**
 * Encuesta post evento: lo que la interfaz muestra cuando el evento
 * termina.
 *
 * `habilitada` y `preguntas` siempre vienen: la API rellena los valores por
 * defecto, así que una encuesta vacía llega como
 * `{ habilitada: false, preguntas: [] }`.
 */
export type EncuestaEvento = {
  habilitada: boolean;
  preguntas: Pregunta[];
};

/**
 * Pregunta de la encuesta.
 *
 * `rango` solo tiene sentido en las preguntas de escala: es el par
 * [mínimo, máximo] de la escala.
 */
export type Pregunta = {
  id: string;
  tipo: TipoPregunta;
  texto: string;
  rango?: [number, number];
};

/**
 * Configuración del evento híbrido: el bloque de la transmisión en vivo.
 *
 * Existe solo en eventos de tipo `hibrido`. Si `habilitado` es `true`, la
 * API exige `url_streaming`.
 */
export type ConfiguracionHibrido = {
  habilitado: boolean;
  url_streaming?: string;
};

/**
 * Bloque de configuración académica: existe solo en eventos de tipo
 * `academico`.
 *
 * La API lo rechaza en cualquier otro tipo de evento, y son **dos campos y
 * ni uno más**: el bloque existe para demostrar que una forma nueva puede
 * convivir en la misma colección con las formas anteriores, no para modelar
 * un catálogo de configuración académica.
 */
export type ConfiguracionAcademico = {
  creditos?: number;
  certificado_url?: string;
};

/**
 * Métricas del evento: los números que el sistema mantiene actualizados.
 *
 * `ultima_actualizacion` marca cuándo se recalcularon por última vez.
 */
export type MetricasEvento = {
  tickets_vendidos_total: number;
  ingresos_cop: number;
  ultima_actualizacion?: string;
};

/**
 * Lugar: el sitio físico donde se hace el evento.
 *
 * `salas` son las salas embebidas del lugar y `geometria` su punto en el
 * mapa (GeoJSON, en orden [longitud, latitud]).
 */
export type Lugar = {
  _id: string;
  nombre: string;
  direccion: string;
  ciudad: string;
  pais: string;
  capacidad_total: number;
  geometria: Geometria;
  salas: Sala[];
  activo: boolean;
  creado_en: string;
};

/**
 * Sala: un espacio dentro de un lugar.
 *
 * `piso` y `tipo` son opcionales: no todos los lugares describen sus salas
 * con el mismo detalle.
 */
export type Sala = {
  nombre: string;
  capacidad: number;
  piso?: number;
  tipo?: string;
};

/**
 * Punto geográfico en formato GeoJSON.
 *
 * Las coordenadas van en el orden **longitud, latitud** (no al revés): es el
 * orden que espera MongoDB para las consultas geoespaciales (`$near`).
 */
export type Geometria = {
  type: "Point";
  coordinates: [number, number];
};

/**
 * Usuario de la plataforma.
 *
 * `email_normalizado` es derivado —el dominio lo calcula— y sostiene el
 * índice único del correo, así que no es un campo que la interfaz pueda
 * escribir.
 */
export type Usuario = {
  _id: string;
  email: string;
  email_normalizado: string;
  nombre: string;
  telefono?: string;
  documento_identidad: string;
  tipo_usuario: TipoUsuario[];
  fecha_nacimiento?: string;
  preferencias: PreferenciasUsuario;
  estadisticas: EstadisticasUsuario;
  creado_en: string;
  actualizado_en: string;
  _v: number;
};

/** Preferencias del usuario: lo que eligió para que le hablen y cómo. */
export type PreferenciasUsuario = {
  newsletter: boolean;
  idioma: string;
  canal_notif: CanalNotificacion[];
};

/**
 * Estadísticas del usuario: los contadores que el sistema lleva sobre su
 * historial de compras y asistencia.
 */
export type EstadisticasUsuario = {
  eventos_asistidos: number;
  tickets_comprados: number;
  ltv_cop: number;
};
