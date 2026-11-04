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

/** Estado del ticket: por el que pasa desde que se emite hasta que se anula. */
export type EstadoTicket = "emitido" | "usado" | "anulado";

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
 * Promoción que acepta el cliente: la misma que se persiste, sin el contador
 * de usos.
 *
 * `usos_realizados` lo lleva el sistema —lo incrementa el flujo de compra—, así
 * que un cliente no puede escribirlo: la API lo ignora aunque venga en el
 * cuerpo.
 */
export type EntradaPromocion = {
  codigo: string;
  tipo: TipoPromocion;
  valor: number;
  aplica_a_tipo_ticket_ids: string[];
  vigencia_inicio: string;
  vigencia_fin: string;
  usos_maximos?: number;
  activo: boolean;
};

/**
 * Configuración del evento: el bloque flexible que cambia según el tipo.
 *
 * Cada bloque es opcional porque no todos los tipos de evento lo usa: el
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
 * Estadísticas del usuario: los contadores que la API lleva sobre su
 * historial de compras y asistencia.
 */
export type EstadisticasUsuario = {
  eventos_asistidos: number;
  tickets_comprados: number;
  ltv_cop: number;
};

/**
 * Reporting operativo: las cuatro vistas del documento 01 §7.1.
 *
 * A diferencia del resto, **ninguno de estos tipos es un documento**: son
 * vistas que la API calcula y devuelve ya agregadas. El dashboard y el ranking
 * se resuelven con una sola lectura sobre `eventos` (que embeba sus tipos de
 * ticket y sus métricas), y el cierre contable y la exportación de asistentes
 * se derivan de `transacciones` y de `tickets` sin unir colecciones.
 *
 * Que sean vistas se nota en las formas: no tienen `_id`, no tienen `creado_en`
 * y su `ocupacion_pct` viene con dos decimales (26.67), no como un entero.
 */

/**
 * Ocupación de un tipo de ticket: lo vendido sobre lo que había.
 *
 * Es el mismo dato que la ficha de evento muestra, pero **calculado**: aquí la
 * API lo agrega, y no viene embebido en el documento.
 */
export type OcupacionTipoTicket = {
  tipo_ticket_id: string;
  nombre: string;
  precio_cop: number;
  aforo_total: number;
  aforo_vendido: number;
  ocupacion_pct: number;
};

/**
 * Dashboard live de un evento.
 *
 * `metricas.ultima_actualizacion` es `null` cuando el evento todavía no tiene
 * métricas calculadas: es un dato ausente, no un error.
 */
export type DashboardEvento = {
  evento_id: string;
  nombre: string;
  slug: string;
  estado: EstadoEvento;
  fecha_inicio: string;
  fecha_fin: string;
  metricas: MetricasDashboard;
  tipos_ticket: OcupacionTipoTicket[];
  aforo_total: number;
  aforo_vendido: number;
  ocupacion_pct: number;
};

/** Métricas del dashboard: los contadores que el sistema lleva del evento. */
export type MetricasDashboard = {
  tickets_vendidos_total: number;
  ingresos_cop: number;
  ultima_actualizacion: string | null;
};

/**
 * Cantidad y monto de un estado de transacción.
 *
 * Aparece en el cierre contable por estado y por día, y en los totales.
 */
export type ResumenEstado = {
  cantidad: number;
  monto_cop: number;
};

/**
 * Estado de una transacción: el vocabulario cerrado del dominio.
 *
 * La transacción y el cierre contable hablan del mismo estado —es el mismo
 * campo—, así que hay **un** vocabulario y dos nombres: el de la transacción
 * (la que compra) y el del cierre (la vista que lo agrega).
 */
export type EstadoTransaccion = "pendiente" | "aprobada" | "rechazada" | "anulada" | "reembolsada";

/**
 * Estado contable de una transacción.
 *
 * El esquema es **cerrado**: los cinco estados siempre vienen, aunque valgan
 * cero. Un cierre que a veces trae un estado y a veces no obligaría al
 * cliente a preguntar si falta el estado o si de verdad no hubo ninguno.
 */
export type EstadoContable = EstadoTransaccion;

/**
 * Un día del cierre contable.
 *
 * `dia` es una fecha de calendario en UTC, con formato `YYYY-MM-DD`. El
 * `neto_cop` **puede ser negativo**: un día con más devoluciones que cobros
 * cierra en rojo, y esconderlo en un campo sin signo mentiría.
 */
export type DiaContable = {
  dia: string;
  por_estado: Record<EstadoContable, ResumenEstado>;
  neto_cop: number;
};

/** Totales del cierre contable: lo mismo que un `DiaContable`, sin desglose. */
export type TotalesContables = {
  cantidad: number;
  monto_cop: number;
  neto_cop: number;
};

/**
 * Cierre contable diario.
 *
 * El cierre es **global**: `transacciones` no guarda el evento, así que un
 * desglose por evento exigiría unir cada transacción con su ticket.
 *
 * `desde` y `hasta` son los límites **normalizados** que devolvió la API (en
 * ISO 8601), o `null` cuando no se filtró: no son necesariamente los que se
 * escribieron en el formulario.
 */
export type CierreContable = {
  desde: string | null;
  hasta: string | null;
  dias: DiaContable[];
  /** Transacciones que todavía no tienen fecha de confirmación. */
  pendientes_sin_confirmar: ResumenEstado;
  totales: TotalesContables;
};

/**
 * Un evento dentro del ranking de más vendidos.
 *
 * Solo entran los eventos **operativos** (publicados o finalizados): un
 * borrador no vendió nada y uno cancelado no se va a vender.
 */
export type EventoRanking = {
  evento_id: string;
  nombre: string;
  slug: string;
  estado: EstadoEvento;
  fecha_inicio: string;
  tickets_vendidos_total: number;
  ingresos_cop: number;
  aforo_total: number;
  aforo_vendido: number;
  ocupacion_pct: number;
  tipos_ticket: OcupacionTipoTicket[];
};

/** El ranking de más vendidos, con el límite que la API aplicó. */
export type RankingVendidos = {
  items: EventoRanking[];
  limite: number;
};

/**
 * Un asistente en la exportación.
 *
 * Los datos del asistente y del tipo de ticket son los **snapshots** que
 * guarda el ticket: la exportación no une `usuarios` ni `eventos`, así que
 * dice lo que decía el ticket cuando se emitió.
 */
export type Asistente = {
  ticket_id: string;
  codigo_qr: string;
  estado: EstadoTicket;
  tipo_ticket: {
    tipo_ticket_id: string;
    nombre: string;
    precio_cop: number;
  };
  asistente: {
    usuario_id: string;
    nombre: string;
    documento_identidad: string;
    email: string;
  };
  precio_pagado_cop: number;
  promocion_aplicada_codigo: string | null;
  emitido_en: string;
  validado_en: string | null;
};

/**
 * Método de pago: el vocabulario cerrado que la API acepta.
 *
 * Es una unión literal y no un `string`: el compilador es lo que impide
 * mandar un método que la API va a rechazar.
 */
export type MetodoPago = "tarjeta_credito" | "tarjeta_debito" | "efectivo" | "transferencia";

/**
 * Transacción: el cargo del ticket.
 *
 * El ticket y la transacción son las dos mitades del mismo hecho, y por eso la
 * compra devuelve las dos juntas: el ticket es lo que se entrega y la
 * transacción es lo que se cobró.
 */
export type Transaccion = {
  _id: string;
  /** El usuario que paga. */
  usuario_id: string;
  /** El ticket que se emitió con este cargo. */
  ticket_id: string;
  /** Lo que se cobró. */
  monto_cop: number;
  /** Moneda del cargo: el dominio la guarda como código ISO 4217. */
  moneda: string;
  metodo_pago: MetodoPago;
  /** La pasarela en la que vive el cargo. */
  pasarela: string;
  estado: EstadoTransaccion;
  /** La clave de idempotencia del cargo. */
  referencia_pasarela: string;
  creada_en: string;
  /** Cuándo se confirmó el cargo; ausente mientras está pendiente. */
  confirmada_en?: string;
};

/**
 * Revalidación de un ticket en una puerta.
 *
 * Es el historial de revalidaciones del ticket: una entrada puede pasar por
 * más de una puerta, y cada intento queda registrado con su resultado.
 */
export type Revalidacion = {
  fecha: string;
  puerta?: string;
  resultado: "aceptado" | "rechazado";
};

/**
 * Ticket: la entrada que se emite al comprar.
 *
 * Guarda **snapshots** del tipo de ticket y del asistente, no referencias: el
 * ticket dice lo que el tipo y la persona valían cuando se emitió, y eso no
 * cambia aunque después cambien el tipo o la persona.
 */
export type Ticket = {
  _id: string;
  /** El código QR de la entrada. */
  codigo_qr: string;
  estado: EstadoTicket;
  evento_id: string;
  /** El usuario que pagó. */
  comprado_por_usuario_id: string;
  /** Snapshot del tipo de ticket comprado. */
  snapshot_tipo_ticket: {
    tipo_ticket_id: string;
    nombre: string;
    precio_cop: number;
  };
  /** Snapshot del asistente: sus datos, copiados al emitir. */
  asistente_snapshot: {
    usuario_id: string;
    nombre: string;
    documento_identidad: string;
    email: string;
  };
  /** Lo que se pagó, con la promoción ya aplicada. */
  precio_pagado_cop: number;
  /** El código de la promoción aplicada, si hubo. */
  promocion_aplicada_codigo?: string;
  /** La transacción del cargo. */
  transaccion_id?: string;
  emitido_en: string;
  validado_en?: string | null;
  validado_por_puerta?: string | null;
  revalidaciones: Revalidacion[];
  _v: number;
};

/**
 * Compra: el cuerpo que acepta `POST /api/compras`.
 *
 * El comprador y el asistente son **dos usuarios distintos**: quien paga
 * puede comprarle la entrada a otra persona, y sus datos se copian al snapshot
 * del ticket. `referencia_pasarela` es la clave de idempotencia: repetir la
 * compra con la misma referencia no vuelve a cobrar ni a ocupar cupo.
 */
export type CompraEntrada = {
  evento_id: string;
  tipo_ticket_id: string;
  /** El usuario que paga. */
  usuario_id: string;
  /** El usuario que asiste. */
  asistente_id: string;
  metodo_pago: MetodoPago;
  /** La pasarela en la que vive el cargo. */
  pasarela: string;
  /** La clave de idempotencia del cargo. */
  referencia_pasarela: string;
  /** La promoción a aplicar, si la hay. */
  promocion_codigo?: string;
};

/**
 * Compra: lo que devuelve `POST /api/compras`.
 *
 * `idempotente` dice si la compra **ya existía**: es `true` cuando la
 * referencia se había usado antes y la API devolvió el mismo ticket en lugar
 * de cobrar otra vez.
 */
export type Compra = {
  ticket: Ticket;
  transaccion: Transaccion;
  idempotente: boolean;
  /** La promoción que se aplicó, o `null` si la compra fue sin promoción. */
  promocion_codigo: string | null;
};
