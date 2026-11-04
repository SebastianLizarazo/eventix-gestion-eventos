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

/**
 * Un parámetro de una operación, como lo publica el contrato.
 *
 * Hay dos grafías y las dos se declaran: la **canónica de OpenAPI** (`name`,
 * `in`, `description`, `schema`) y la que el contrato que publica la API usa
 * hoy, **en español** (`nombre`, `en`, `descripcion`, `esquema`). La segunda
 * es una deuda del lado del servidor —un cliente generado solo con este
 * documento perdería los parámetros— y la interfaz no deja de mostrar por
 * eso: lee la que llegue.
 *
 * Para no repetir la decisión en cada pantalla, el nombre y el lugar se leen
 * con `nombreDeParametro` y `lugarDeParametro`.
 */
export type ParametroContrato = {
  /** Nombre del parámetro, en la grafía canónica. */
  name?: string;
  /** Dónde va el parámetro (`path`, `query`, `header`), en la grafía canónica. */
  in?: string;
  /** Qué es el parámetro, en la grafía canónica. */
  description?: string;
  /** El esquema del parámetro, en la grafía canónica. */
  schema?: EsquemaJson;
  /** Nombre del parámetro, en la grafía que usa el contrato de la API. */
  nombre?: string;
  /** Dónde va el parámetro, en la grafía que usa el contrato de la API. */
  en?: string;
  /** Qué es el parámetro, en la grafía que usa el contrato de la API. */
  descripcion?: string;
  /** El esquema del parámetro, en la grafía que usa el contrato de la API. */
  esquema?: EsquemaJson;
  /** Si el parámetro es obligatorio. */
  required?: boolean;
};

/** El nombre del parámetro, venga en la grafía que venga. */
export function nombreDeParametro(parametro: ParametroContrato): string {
  return parametro.name ?? parametro.nombre ?? "";
}

/** El lugar del parámetro, venga en la grafía que venga. */
export function lugarDeParametro(parametro: ParametroContrato): string {
  return parametro.in ?? parametro.en ?? "";
}

/**
 * Una respuesta del contrato: lo que la API devuelve para un estado.
 *
 * El `examples` es lo que liga cada respuesta de error con su código: el
 * ejemplo trae el cuerpo del contrato de error y la `description` dice qué
 * significa.
 */
export type RespuestaContrato = {
  description?: string;
  content?: Record<
    string,
    { schema?: EsquemaJson; examples?: Record<string, { value?: unknown }> }
  >;
};

/** Una operación del contrato: lo que hace una ruta con un método. */
export type OperacionContrato = {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: ParametroContrato[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: EsquemaJson }>;
  };
  responses?: Record<string, RespuestaContrato>;
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
 * Hay dos formas de referencia y las dos se resuelven:
 *
 * - **`#/components/schemas/<nombre>`**: un puntero al documento del
 *   contrato.
 * - **`#/<ruta>`**: un puntero **local**, relativo al esquema que lo
 *   contiene (así los declara el generador de esquemas: `fecha_fin` puede
 *   apuntar a `fecha_inicio`).
 *
 * Devuelve `undefined` cuando la referencia no apunta a nada: es un contrato
 * que no se conoce, y un campo que no se conoce no se muestra. Una referencia
 * **cíclica** también devuelve `undefined` en vez de desbordar la pila.
 */
export function resolverEsquema(
  esquema: EsquemaJson | undefined,
  contrato: ContratoOpenApi | undefined,
  base?: EsquemaJson,
): EsquemaJson | undefined {
  return resolver(esquema, contrato, base, new Set<string>());
}

/** Resuelve una referencia, llevando la cuenta de las ya visitsadas. */
function resolver(
  esquema: EsquemaJson | undefined,
  contrato: ContratoOpenApi | undefined,
  base: EsquemaJson | undefined,
  visitados: Set<string>,
): EsquemaJson | undefined {
  if (esquema === undefined || contrato === undefined) {
    return undefined;
  }

  if (esquema.$ref === undefined) {
    return esquema;
  }

  // Una referencia que se apunta a sí misma (directa o por el camino largo)
  // no tiene salida: se corta en lugar de reventar la pila.
  if (visitados.has(esquema.$ref)) {
    return undefined;
  }

  visitados.add(esquema.$ref);

  const destino = apuntaA(esquema.$ref, contrato, base);

  return destino === undefined ? undefined : resolver(destino, contrato, base, visitados);
}

/**
 * A dónde apunta una referencia del contrato.
 *
 * Un puntero que empieza por `components/schemas` se busca en el documento
 * del contrato; cualquier otro es local y se busca dentro del esquema que lo
 * contiene.
 */
function apuntaA(
  referencia: string,
  contrato: ContratoOpenApi,
  base: EsquemaJson | undefined,
): EsquemaJson | undefined {
  const partes = referencia
    .replace(/^#\//, "")
    .split("/")
    .filter((parte) => parte !== "");

  if (partes[0] === "components" && partes[1] === "schemas") {
    const nombre = partes[2];

    return nombre === undefined ? undefined : contrato.components.schemas[nombre];
  }

  if (base === undefined) {
    return undefined;
  }

  let actual: unknown = base;

  for (const parte of partes) {
    if (typeof actual !== "object" || actual === null) {
      return undefined;
    }

    actual = (actual as Record<string, unknown>)[parte];
  }

  return actual === undefined ? undefined : (actual as EsquemaJson);
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
