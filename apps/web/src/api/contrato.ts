/**
 * El contrato OpenAPI 3.1 que la API publica, del lado del consumidor.
 *
 * La API ya sirve su contrato en `/api/openapi.json` y la interfaz lo
 * consume: es la frontera que hace que el frontend no necesite saber nada del
 * backend (spec S3) y, a la vez, lo que permite que un formulario se construya
 * con **los campos que el servidor declara** en vez de con una lista escrita a
 * mano (spec S10).
 *
 * Solo se declara **el subconjunto del JSON Schema que la interfaz sabe
 * leer**. Un esquema que traiga algo más no se rompe: se ignora lo que no se
 * entiende y se sigue adelante. El contrato es del servidor; aquí no se decide
 * nada sobre él.
 */

/**
 * Un esquema JSON: el subconjunto que la interfaz sabe interpretar.
 *
 * Los límites (`minimum`, `maxLength`…) se declaran para poder mostrarlos,
 * no para validar: **el que juzga es el dominio**, y su veredicto llega con
 * el detalle por campo que la interfaz muestra (spec S6).
 */
export type EsquemaJson = {
  /** Referencia a otro esquema del contrato (`#/components/schemas/…`). */
  $ref?: string;
  /** Tipo del valor: texto, número, entero, booleano, arreglo u objeto. */
  type?: string | string[];
  /** Propiedades del objeto, por nombre de campo. */
  properties?: Record<string, EsquemaJson>;
  /** Campos que el esquema exige. */
  required?: string[];
  /** Esquema de cada elemento del arreglo. */
  items?: EsquemaJson;
  /** Valores admitidos, cuando el campo es un vocabulario cerrado. */
  enum?: unknown[];
  /** Formato del texto: `date-time`, `uri`… */
  format?: string;
  /** Valor por defecto del dominio. */
  default?: unknown;
  /** Límites declarados por el dominio. */
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  /** Descripción del campo, cuando el dominio la escribe. */
  description?: string;
  /** Alternativas de esquema (`anyOf`). */
  anyOf?: EsquemaJson[];
};

/** Una operación del contrato: lo que hace una ruta con un método. */
export type OperacionContrato = {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: {
    name: string;
    in: string;
    required?: boolean;
    description?: string;
    schema?: EsquemaJson;
  }[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: EsquemaJson }>;
  };
  responses?: Record<
    string,
    { description?: string; content?: Record<string, { schema?: EsquemaJson }> }
  >;
};

/** El documento del contrato que publica la API. */
export type ContratoOpenApi = {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, OperacionContrato>>;
  components: { schemas: Record<string, EsquemaJson> };
};

/**
 * Resuelve una referencia `$ref` del contrato.
 *
 * El contrato publica los esquemas por nombre y los referencia entre sí: el
 * `Evento` embebe el `TipoTicket`, que a su vez es el mismo esquema que
 * publica la ruta de los tipos de ticket. Sin resolver la referencia, el
 * editor genérico no vería los campos del tipo de ticket.
 *
 * Devuelve `undefined` cuando la referencia no apunta a nada: es un contrato
 * que no se conoce, y un campo que no se conoce no se muestra.
 */
export function resolverEsquema(
  esquema: EsquemaJson | undefined,
  contrato: ContratoOpenApi | undefined,
): EsquemaJson | undefined {
  if (esquema === undefined || contrato === undefined) {
    return undefined;
  }

  if (esquema.$ref === undefined) {
    return esquema;
  }

  const nombre = esquema.$ref.split("/").pop() ?? "";
  const destino = contrato.components.schemas[nombre];

  return destino === undefined ? undefined : resolverEsquema(destino, contrato);
}

/**
 * El tipo de un valor según el esquema.
 *
 * El esquema puede declarar varios tipos (`["string", "null"]`): el que
 * importa es el primero que no sea `null`, porque `null` es la forma de
 * decir "este campo no está".
 */
export function tipoDeEsquema(esquema: EsquemaJson): string | undefined {
  if (Array.isArray(esquema.type)) {
    return esquema.type.find((tipo) => tipo !== "null");
  }

  return esquema.type;
}
