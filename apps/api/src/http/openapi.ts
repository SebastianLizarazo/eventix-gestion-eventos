import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";
import {
  asistenteSchema,
  auditoriaInputSchema,
  auditoriaSchema,
  cierreContableSchema,
  dashboardEventoSchema,
  entradaCompraSchema,
  eventoInputSchema,
  eventoSchema,
  lugarInputSchema,
  lugarSchema,
  rankingVendidosSchema,
  ticketInputSchema,
  ticketSchema,
  transaccionInputSchema,
  transaccionSchema,
  usuarioInputSchema,
  usuarioSchema,
} from "../domain/schemas/index.js";

/**
 * Contrato OpenAPI 3.1 de la API.
 *
 * El contrato se **genera desde los esquemas del dominio**: los componentes
 * (`components.schemas`) son el JSON Schema de los esquemas de Zod que la
 * aplicación usa para validar, así que el contrato no puede quedarse viejo
 * respecto del dominio.
 *
 * Las rutas se describen a mano, pero con helpers: las seis colecciones
 * comparten la misma forma de CRUD, y esa forma se escribe **una vez**.
 */

/** Versión del contrato. */
export const VERSION_OPENAPI = "3.1.0";

/** Parámetro de una operación. */
type Parametro = {
  nombre: string;
  en: "path" | "query" | "header";
  descripcion: string;
  required?: boolean;
  esquema?: Record<string, unknown>;
};

/** Respuesta de error del contrato único de la API. */
type RespuestaError = {
  description: string;
  content: {
    "application/json": {
      schema: { $ref: string };
      examples?: Record<string, { value: unknown }>;
    };
  };
  headers?: Record<string, { description?: string; schema: Record<string, unknown> }>;
};

/** Objeto de una ruta del contrato. */
type Operacion = {
  summary: string;
  description?: string;
  tags: string[];
  parameters?: Parametro[];
  requestBody?: Record<string, unknown>;
  responses: Record<string, unknown>;
};

/**
 * Colapsa la unión del identificador del dominio.
 *
 * El identificador del dominio acepta el hexadecimal o el `ObjectId` nativo,
 * así que el JSON Schema generado es una unión con un esquema vacío. En el
 * contrato HTTP solo importa la forma hexadecimal: es la que viaja por la API.
 */
function colapsarIdentificadores(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(colapsarIdentificadores);
  }

  if (typeof valor !== "object" || valor === null) {
    return valor;
  }

  const objeto = valor as Record<string, unknown>;
  const cualquiera = objeto.anyOf;

  if (Array.isArray(cualquiera) && cualquiera.length === 2) {
    const [uno, otro] = cualquiera as [unknown, unknown];
    const vacio = (candidate: unknown): boolean =>
      typeof candidate === "object" && candidate !== null && Object.keys(candidate).length === 0;

    if (vacio(uno) && !vacio(otro)) {
      return colapsarIdentificadores(otro);
    }

    if (vacio(otro) && !vacio(uno)) {
      return colapsarIdentificadores(uno);
    }
  }

  return Object.fromEntries(
    Object.entries(objeto).map(([clave, interno]) => [clave, colapsarIdentificadores(interno)]),
  );
}

/** Genera el JSON Schema de un componente desde el esquema del dominio. */
function esquemaDe(esquema: ZodTypeAny): Record<string, unknown> {
  const generado = zodToJsonSchema(esquema, { target: "openApi3" }) as Record<string, unknown>;

  return colapsarIdentificadores(generado) as Record<string, unknown>;
}

/** Parámetros de paginación, los mismos que aplica el repositorio. */
const PAGINACION: Parametro[] = [
  {
    nombre: "skip",
    en: "query",
    descripcion: "Cuántos documentos se saltan",
    esquema: { type: "integer", minimum: 0, default: 0 },
  },
  {
    nombre: "limit",
    en: "query",
    descripcion: "Cuántos documentos trae la página",
    esquema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
  },
];

/** Parámetro de identificador en la ruta. */
function idParam(nombre: string, descripcion: string): Parametro {
  return {
    nombre,
    en: "path",
    descripcion,
    required: true,
    esquema: { type: "string", pattern: "^[0-9a-f]{24}$" },
  };
}

/** Respuesta que devuelve el documento de un recurso. */
function respuestaDe(referencia: string, descripcion: string): RespuestaError {
  return {
    description: descripcion,
    content: { "application/json": { schema: { $ref: `#/components/schemas/${referencia}` } } },
  };
}

/** Respuesta de error con el cuerpo único de la API. */
function respuestaDeError(descripcion: string, codigo: string): RespuestaError {
  return {
    description: descripcion,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
        examples: {
          codigo: { value: { error: { codigo, mensaje: descripcion, request_id: "9f0c…" } } },
        },
      },
    },
  };
}

/** Respuestas de error que comparten todas las operaciones. */
const ERRORES: Record<string, RespuestaError> = {
  "400": respuestaDeError("La petición no se puede entender", "peticion_invalida"),
  "404": respuestaDeError("El recurso no existe", "no_encontrado"),
  "409": respuestaDeError("Conflicto con el estado actual del recurso", "conflicto"),
  "422": respuestaDeError("La petición viola una regla del dominio", "validacion"),
  "500": respuestaDeError("Error interno", "error_interno"),
};

/** Cuerpo de una petición: el documento que se quiere escribir. */
function cuerpoDe(referencia: string, requerido = true): Record<string, unknown> {
  return {
    required: requerido,
    content: { "application/json": { schema: { $ref: `#/components/schemas/${referencia}` } } },
  };
}

/**
 * Rutas de una colección: lista paginada y alta.
 *
 * @param componente nombre del componente del documento.
 * @param etiqueta nombre de la colección en las etiquetas del contrato.
 * @param filtros filtros propios de la lista.
 */
function rutasDeColeccion(
  componente: string,
  etiqueta: string,
  filtros: Parametro[] = [],
): Record<string, Operacion> {
  return {
    get: {
      summary: `Lista ${etiqueta}`,
      tags: [etiqueta],
      parameters: [...filtros, ...PAGINACION],
      responses: {
        "200": respuestaDe(`Pagina${componente}`, "Página de resultados"),
        ...ERRORES,
      },
    },
    post: {
      summary: `Crea ${etiqueta}`,
      tags: [etiqueta],
      requestBody: cuerpoDe(`${componente}Entrada`),
      responses: {
        "201": respuestaDe(componente, "Recurso creado"),
        ...ERRORES,
      },
    },
  };
}

/**
 * Rutas de un recurso: lectura, edición y baja.
 *
 * @param componente nombre del componente del documento.
 * @param etiqueta nombre de la colección en las etiquetas del contrato.
 * @param parametros parámetros de la ruta.
 * @param soloLectura el recurso no se puede modificar ni borrar.
 */
function rutasDeRecurso(
  componente: string,
  etiqueta: string,
  parametros: Parametro[],
  soloLectura = false,
): Record<string, Operacion> {
  const respuestas: Record<string, unknown> = {
    "200": respuestaDe(componente, "El recurso"),
    ...ERRORES,
  };

  if (soloLectura) {
    return {
      get: {
        summary: `Lee ${etiqueta}`,
        tags: [etiqueta],
        parameters: parametros,
        responses: respuestas,
      },
    };
  }

  return {
    get: {
      summary: `Lee ${etiqueta}`,
      tags: [etiqueta],
      parameters: parametros,
      responses: respuestas,
    },
    patch: {
      summary: `Edita ${etiqueta}`,
      tags: [etiqueta],
      parameters: parametros,
      requestBody: cuerpoDe(`${componente}Entrada`),
      responses: {
        "200": respuestaDe(componente, "El recurso editado"),
        ...ERRORES,
      },
    },
    delete: {
      summary: `Borra ${etiqueta}`,
      tags: [etiqueta],
      parameters: parametros,
      responses: {
        "204": { description: "El recurso se borró" },
        ...ERRORES,
      },
    },
  };
}

/** Los esquemas de los componentes, generados desde el dominio. */
const ESQUEMAS: Record<string, Record<string, unknown>> = {
  Usuario: esquemaDe(usuarioSchema),
  Lugar: esquemaDe(lugarSchema),
  Evento: esquemaDe(eventoSchema),
  Ticket: esquemaDe(ticketSchema),
  Transaccion: esquemaDe(transaccionSchema),
  Auditoria: esquemaDe(auditoriaSchema),
  Error: {
    type: "object",
    required: ["error"],
    properties: {
      error: {
        type: "object",
        required: ["codigo", "mensaje", "request_id"],
        properties: {
          codigo: {
            type: "string",
            enum: [
              "peticion_invalida",
              "no_encontrado",
              "conflicto",
              "validacion",
              "metodo_no_permitido",
              "error_interno",
            ],
          },
          mensaje: { type: "string" },
          detalles: {
            type: "array",
            items: {
              type: "object",
              required: ["campo", "mensaje"],
              properties: {
                campo: { type: "string" },
                mensaje: { type: "string" },
                codigo: { type: "string" },
              },
            },
          },
          request_id: { type: "string" },
        },
      },
    },
  },
};

/** Página de resultados de una colección. */
function paginaDe(componente: string): Record<string, unknown> {
  return {
    type: "object",
    required: ["items", "total", "skip", "limit"],
    properties: {
      items: { type: "array", items: { $ref: `#/components/schemas/${componente}` } },
      total: {
        type: ["integer", "null"],
        description: "Documentos que cumplen el filtro (null si la lectura no lo calculó)",
      },
      skip: { type: "integer" },
      limit: { type: "integer" },
    },
  };
}

/** Parámetros de filtrado de la lista de eventos. */
const FILTROS_EVENTOS: Parametro[] = [
  { nombre: "tipo_evento", en: "query", descripcion: "Tipo de evento" },
  { nombre: "estado", en: "query", descripcion: "Estado del evento" },
  { nombre: "categoria", en: "query", descripcion: "Categoría del evento" },
  {
    nombre: "categorias",
    en: "query",
    descripcion: "Varias categorías, separadas por comas",
  },
  { nombre: "lugar_id", en: "query", descripcion: "Lugar del evento" },
  { nombre: "organizador_id", en: "query", descripcion: "Organizador del evento" },
  { nombre: "desde", en: "query", descripcion: "Eventos que empiezan desde esa fecha" },
  { nombre: "q", en: "query", descripcion: "Búsqueda de texto libre" },
];

/** Parámetros de filtrado de la lista de tickets. */
const FILTROS_TICKETS: Parametro[] = [
  { nombre: "evento_id", en: "query", descripcion: "Evento del ticket" },
  { nombre: "estado", en: "query", descripcion: "Estado del ticket" },
  { nombre: "usuario_id", en: "query", descripcion: "Comprador del ticket" },
];

/** Parámetros de filtrado de la lista de transacciones. */
const FILTROS_TRANSACCIONES: Parametro[] = [
  { nombre: "usuario_id", en: "query", descripcion: "Usuario de la transacción" },
  { nombre: "estado", en: "query", descripcion: "Estado de la transacción" },
  { nombre: "desde", en: "query", descripcion: "Transacciones creadas desde esa fecha" },
  { nombre: "hasta", en: "query", descripcion: "Transacciones creadas hasta esa fecha" },
];

/** Parámetros de filtrado de la lista de auditoría. */
const FILTROS_AUDITORIA: Parametro[] = [
  { nombre: "actor_id", en: "query", descripcion: "Actor del registro" },
  { nombre: "actor_rol", en: "query", descripcion: "Rol del actor" },
  { nombre: "sujeto_tipo", en: "query", descripcion: "Tipo del sujeto" },
  { nombre: "sujeto_id", en: "query", descripcion: "Sujeto del registro" },
  { nombre: "desde", en: "query", descripcion: "Registros ocurridos desde esa fecha" },
  { nombre: "hasta", en: "query", descripcion: "Registros ocurridos hasta esa fecha" },
];

/** Rutas del contrato, con la base `/api` implícita. */
const RUTAS: Record<string, Record<string, Operacion>> = {
  "/health": {
    get: {
      summary: "Estado de la API y de MongoDB",
      tags: ["salud"],
      responses: {
        "200": {
          description: "La API responde y MongoDB está arriba",
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["status", "mongo"],
                properties: {
                  status: { type: "string", enum: ["ok", "degraded"] },
                  mongo: { type: "string", enum: ["up", "down"] },
                  version: { type: "string" },
                  uptimeSeconds: { type: "integer" },
                },
              },
            },
          },
        },
        "503": { description: "MongoDB no responde" },
      },
    },
  },
  "/openapi.json": {
    get: {
      summary: "Este contrato",
      tags: ["salud"],
      responses: {
        "200": {
          description: "El contrato OpenAPI 3.1 de la API",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  "/usuarios": rutasDeColeccion("Usuario", "usuarios", [
    { nombre: "tipo_usuario", en: "query", descripcion: "Tipo del usuario" },
    { nombre: "idioma", en: "query", descripcion: "Idioma preferido" },
  ]),
  "/usuarios/{id}": rutasDeRecurso("Usuario", "un usuario", [idParam("id", "Identificador")]),
  "/usuarios/{id}/tickets": {
    get: {
      summary: "Lista los tickets de un usuario",
      tags: ["usuarios"],
      parameters: [idParam("id", "Identificador"), ...PAGINACION],
      responses: {
        "200": respuestaDe("PaginaTicket", "Página de resultados"),
        ...ERRORES,
      },
    },
  },
  "/lugares": rutasDeColeccion("Lugar", "lugares", [
    { nombre: "ciudad", en: "query", descripcion: "Ciudad del lugar" },
    { nombre: "activo", en: "query", descripcion: "Solo los lugares activos" },
  ]),
  "/lugares/cerca": {
    get: {
      summary: "Busca lugares cercanos",
      tags: ["lugares"],
      parameters: [
        { nombre: "longitud", en: "query", descripcion: "Longitud del punto", required: true },
        { nombre: "latitud", en: "query", descripcion: "Latitud del punto", required: true },
        {
          nombre: "distancia",
          en: "query",
          descripcion: "Distancia máxima en metros",
        },
        ...PAGINACION,
      ],
      responses: {
        "200": respuestaDe("PaginaLugar", "Página de resultados"),
        ...ERRORES,
      },
    },
  },
  "/lugares/{id}": rutasDeRecurso("Lugar", "un lugar", [idParam("id", "Identificador")]),
  "/eventos": rutasDeColeccion("Evento", "eventos", FILTROS_EVENTOS),
  "/eventos/catalogo": {
    get: {
      summary: "Catálogo público de eventos",
      tags: ["eventos"],
      parameters: PAGINACION,
      responses: {
        "200": respuestaDe("PaginaEvento", "Página de resultados"),
        ...ERRORES,
      },
    },
  },
  "/eventos/{id}": rutasDeRecurso("Evento", "un evento", [idParam("id", "Identificador")]),
  "/eventos/{id}/tipos-ticket": {
    get: {
      summary: "Lista los tipos de ticket del evento",
      tags: ["eventos"],
      parameters: [idParam("id", "Identificador")],
      responses: {
        "200": respuestaDe("TiposTicket", "Los tipos de ticket del evento"),
        ...ERRORES,
      },
    },
    post: {
      summary: "Agrega un tipo de ticket al evento",
      tags: ["eventos"],
      parameters: [idParam("id", "Identificador")],
      requestBody: cuerpoDe("TipoTicket"),
      responses: {
        "201": respuestaDe("TipoTicket", "El tipo de ticket creado"),
        ...ERRORES,
      },
    },
  },
  "/eventos/{id}/tipos-ticket/{tipoId}": {
    patch: {
      summary: "Edita un tipo de ticket del evento",
      tags: ["eventos"],
      parameters: [
        idParam("id", "Identificador del evento"),
        idParam("tipoId", "Identificador del tipo de ticket"),
      ],
      requestBody: cuerpoDe("TipoTicket"),
      responses: {
        "200": respuestaDe("TipoTicket", "El tipo de ticket editado"),
        ...ERRORES,
      },
    },
    delete: {
      summary: "Elimina un tipo de ticket del evento",
      tags: ["eventos"],
      parameters: [
        idParam("id", "Identificador del evento"),
        idParam("tipoId", "Identificador del tipo de ticket"),
      ],
      responses: {
        "204": { description: "El tipo de ticket se eliminó" },
        ...ERRORES,
      },
    },
  },
  "/eventos/{id}/promociones": {
    get: {
      summary: "Lista las promociones del evento",
      tags: ["eventos"],
      parameters: [idParam("id", "Identificador")],
      responses: {
        "200": respuestaDe("Promociones", "Las promociones del evento"),
        ...ERRORES,
      },
    },
    post: {
      summary: "Agrega una promoción al evento",
      tags: ["eventos"],
      parameters: [idParam("id", "Identificador")],
      requestBody: cuerpoDe("Promocion"),
      responses: {
        "201": respuestaDe("Promocion", "La promoción creada"),
        ...ERRORES,
      },
    },
  },
  "/eventos/{id}/promociones/{codigo}": {
    patch: {
      summary: "Edita una promoción del evento",
      tags: ["eventos"],
      parameters: [
        idParam("id", "Identificador del evento"),
        { nombre: "codigo", en: "path", descripcion: "Código de la promoción", required: true },
      ],
      requestBody: cuerpoDe("Promocion"),
      responses: {
        "200": respuestaDe("Promocion", "La promoción editada"),
        ...ERRORES,
      },
    },
    delete: {
      summary: "Elimina una promoción del evento",
      tags: ["eventos"],
      parameters: [
        idParam("id", "Identificador del evento"),
        { nombre: "codigo", en: "path", descripcion: "Código de la promoción", required: true },
      ],
      responses: {
        "204": { description: "La promoción se eliminó" },
        ...ERRORES,
      },
    },
  },
  "/tickets": rutasDeColeccion("Ticket", "tickets", FILTROS_TICKETS),
  "/tickets/codigo/{codigo}": {
    get: {
      summary: "Busca un ticket por su código QR",
      tags: ["tickets"],
      parameters: [
        { nombre: "codigo", en: "path", descripcion: "Código QR del ticket", required: true },
      ],
      responses: {
        "200": respuestaDe("Ticket", "El ticket"),
        ...ERRORES,
      },
    },
  },
  "/tickets/{id}": rutasDeRecurso("Ticket", "un ticket", [idParam("id", "Identificador")]),
  "/transacciones": rutasDeColeccion("Transaccion", "transacciones", FILTROS_TRANSACCIONES),
  "/transacciones/{id}": rutasDeRecurso("Transaccion", "una transacción", [
    idParam("id", "Identificador"),
  ]),
  "/auditoria": rutasDeColeccion("Auditoria", "auditoria", FILTROS_AUDITORIA),
  "/auditoria/{id}": rutasDeRecurso(
    "Auditoria",
    "un registro de auditoría",
    [idParam("id", "Identificador")],
    true,
  ),
  "/reportes/eventos/{id}/dashboard": {
    get: {
      summary: "Dashboard live del evento",
      tags: ["reportes"],
      description:
        "Se resuelve con una única lectura sobre `eventos`: el evento embeba sus tipos de ticket y sus métricas, así que el dashboard no necesita unir colecciones.",
      parameters: [idParam("id", "Identificador del evento")],
      responses: {
        "200": respuestaDe("DashboardEvento", "El dashboard del evento"),
        ...ERRORES,
      },
    },
  },
  "/reportes/cierre-contable": {
    get: {
      summary: "Cierre contable diario",
      tags: ["reportes"],
      description:
        "Agrupa las transacciones confirmadas por día (UTC) y por estado. El neto del día descuenta las reembolsadas del monto aprobado; las transacciones pendientes salen aparte porque no tienen fecha de confirmación.",
      parameters: [
        {
          nombre: "desde",
          en: "query",
          descripcion: "Transacciones confirmadas desde esa fecha (inclusive)",
        },
        {
          nombre: "hasta",
          en: "query",
          descripcion: "Transacciones confirmadas hasta esa fecha (inclusive)",
        },
      ],
      responses: {
        "200": respuestaDe("CierreContable", "El cierre contable por día"),
        ...ERRORES,
      },
    },
  },
  "/reportes/mas-vendidos": {
    get: {
      summary: "Ranking de los eventos más vendidos",
      tags: ["reportes"],
      description:
        "Ordena por tickets vendidos y trae la ocupación por tipo de ticket. Solo entran los eventos operativos: publicados o finalizados (un borrador no vendió nada y uno cancelado no se va a vender).",
      parameters: [
        {
          nombre: "limite",
          en: "query",
          descripcion: "Cuántos eventos trae el ranking (por defecto: 10, máximo: 100)",
          esquema: { type: "integer", minimum: 1, maximum: 100, default: 10 },
        },
      ],
      responses: {
        "200": respuestaDe("RankingVendidos", "El ranking de vendidos"),
        ...ERRORES,
      },
    },
  },
  "/reportes/asistentes/{eventoId}": {
    get: {
      summary: "Exporta los asistentes de un evento",
      tags: ["reportes"],
      description:
        "Página de asistentes del evento, con el snapshot del asistente y del tipo de ticket que guarda el ticket. No une colecciones.",
      parameters: [
        idParam("eventoId", "Identificador del evento"),
        {
          nombre: "estado",
          en: "query",
          descripcion: "Estado del ticket (emitido, usado, anulado)",
        },
        ...PAGINACION,
      ],
      responses: {
        "200": respuestaDe("PaginaAsistente", "Página de asistentes"),
        ...ERRORES,
      },
    },
  },
  "/compras": {
    post: {
      summary: "Compra un ticket",
      tags: ["compras"],
      parameters: [
        {
          nombre: "Idempotency-Key",
          en: "header",
          descripcion:
            "Clave de idempotencia de la compra. Opcional; si viene, tiene que coincidir con `referencia_pasarela` del cuerpo, que es la fuente de verdad.",
          required: false,
        },
      ],
      requestBody: cuerpoDe("CompraEntrada"),
      responses: {
        "200": respuestaDe("Compra", "La compra ya existía (misma clave de idempotencia)"),
        "201": {
          ...respuestaDe("Compra", "Ticket comprado"),
          headers: {
            Location: {
              description: "Ubicación del ticket emitido",
              schema: { type: "string" },
            },
          },
        },
        ...ERRORES,
      },
    },
  },
};

/**
 * Los esquemas de entrada (lo que acepta el cliente) y los tipos embebidos.
 *
 * Los de entrada son los esquemas de entrada del dominio: los mismos menos lo
 * que escribe el sistema (identificadores, marcas de tiempo, contadores).
 */
const ESQUEMAS_ENTRADA: Record<string, Record<string, unknown>> = {
  UsuarioEntrada: esquemaDe(usuarioInputSchema),
  LugarEntrada: esquemaDe(lugarInputSchema),
  EventoEntrada: esquemaDe(eventoInputSchema),
  TicketEntrada: esquemaDe(ticketInputSchema),
  TransaccionEntrada: esquemaDe(transaccionInputSchema),
  AuditoriaEntrada: esquemaDe(auditoriaInputSchema),
  CompraEntrada: esquemaDe(entradaCompraSchema),
};

/** Componentes del contrato. */
const COMPONENTES = {
  schemas: {
    ...ESQUEMAS,
    ...ESQUEMAS_ENTRADA,
    PaginaUsuario: paginaDe("Usuario"),
    PaginaLugar: paginaDe("Lugar"),
    PaginaEvento: paginaDe("Evento"),
    PaginaTicket: paginaDe("Ticket"),
    PaginaTransaccion: paginaDe("Transaccion"),
    PaginaAuditoria: paginaDe("Auditoria"),
    TiposTicket: {
      type: "array",
      items: { $ref: "#/components/schemas/TipoTicket" },
    },
    Promociones: {
      type: "array",
      items: { $ref: "#/components/schemas/Promocion" },
    },
    TipoTicket: esquemaDeTipoTicket(),
    Promocion: esquemaDePromocion(),
    Compra: {
      type: "object",
      required: ["ticket", "transaccion", "idempotente", "promocion_codigo"],
      properties: {
        ticket: { $ref: "#/components/schemas/Ticket" },
        transaccion: { $ref: "#/components/schemas/Transaccion" },
        idempotente: { type: "boolean" },
        promocion_codigo: { type: ["string", "null"] },
      },
    },
    DashboardEvento: esquemaDe(dashboardEventoSchema),
    CierreContable: esquemaDe(cierreContableSchema),
    RankingVendidos: esquemaDe(rankingVendidosSchema),
    Asistente: esquemaDe(asistenteSchema),
    PaginaAsistente: paginaDe("Asistente"),
  },
};

/** Esquema del tipo de ticket embebido en el evento. */
function esquemaDeTipoTicket(): Record<string, unknown> {
  const evento = ESQUEMAS.Evento as {
    properties?: { tipos_ticket?: { items?: Record<string, unknown> } };
  };

  return evento.properties?.tipos_ticket?.items ?? { type: "object" };
}

/** Esquema de la promoción embebida en el evento. */
function esquemaDePromocion(): Record<string, unknown> {
  const evento = ESQUEMAS.Evento as {
    properties?: { promociones?: { items?: Record<string, unknown> } };
  };

  return evento.properties?.promociones?.items ?? { type: "object" };
}

/** El contrato OpenAPI 3.1 de la API. */
export const openapi = {
  openapi: VERSION_OPENAPI,
  info: {
    title: "Eventix API",
    version: "0.1.0",
    description:
      "API REST del prototipo Eventix sobre MongoDB 7.x. Todos los errores salen con el mismo cuerpo: `{ error: { codigo, mensaje, detalles?, request_id } }`.",
  },
  servers: [{ url: "/api", description: "La API" }],
  paths: RUTAS,
  components: COMPONENTES,
};

/** Rutas declaradas en el contrato, en la forma `MÉTODO /ruta`. */
export function rutasDelContrato(): string[] {
  const rutas: string[] = [];

  for (const [ruta, operaciones] of Object.entries(RUTAS)) {
    for (const metodo of Object.keys(operaciones)) {
      rutas.push(`${metodo.toUpperCase()} ${ruta}`);
    }
  }

  return rutas.sort();
}
