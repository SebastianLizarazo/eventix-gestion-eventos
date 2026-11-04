import {
  lugarDeParametro,
  nombreDeParametro,
  resolverEsquema,
  tipoDeEsquema,
  type ContratoOpenApi,
  type EsquemaJson,
  type OperacionContrato,
  type RespuestaContrato,
} from "@/api/contrato";
import { useContrato } from "@/api/hooks";
import { formatearNumero } from "@/formato/es-co";
import { AvisoError, Cargando, Dato, Tarjeta, Vacio } from "@/ui/piezas";

/**
 * Pantalla del contrato de la API (spec S14).
 *
 * Es un **explorador del contrato**: muestra el documento OpenAPI 3.1 que la
 * API ya publica en `/api/openapi.json`, tal como lo declara el servidor. La
 * pantalla es de **solo lectura** —no escribe nada, no ofrece botones— porque
 * el contrato es del servidor y lo único que la interfaz hace es mostrarlo.
 *
 * La regla que gobierna esta pantalla es una sola: **todo lo que se ve sale del
 * documento**. No hay una lista de rutas, ni de esquemas, ni de códigos de
 * error escrita en el código: los conteos se calculan del documento, los
 * recursos se agrupan por el primer segmento de cada ruta, los esquemas se
 * resuelven con el **mismo resolutor de `$ref`** que usa el editor de la
 * configuración (spec S10) y los códigos de error se leen del esquema
 * `Error`. Si el contrato cambia, la pantalla cambia con él.
 */

/** Los métodos HTTP que el contrato puede declarar en una ruta. */
const METODOS_HTTP = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];

/** Etiqueta de una ruta que el contrato no etiquetó. */
const SIN_ETIQUETA = "Sin etiqueta";

/** Cuántos niveles de anidamiento se muestran de un esquema. */
const PROFUNDIDAD_MAXIMA = 4;

/**
 * Una ruta del contrato con sus operaciones.
 */
type RutaDelContrato = {
  /** La plantilla de la ruta, tal como la declara el servidor (`/eventos/{id}`). */
  plantilla: string;
  /** Las operaciones de la ruta, con su método. */
  operaciones: { metodo: string; operacion: OperacionContrato }[];
};

/** Un grupo de rutas: las que el contrato etiqueta igual. */
type GrupoDeRutas = {
  etiqueta: string;
  rutas: RutaDelContrato[];
};

/** Un esquema de una colección, con su nombre. */
type Coleccion = {
  nombre: string;
  esquema: EsquemaJson;
};

/** Un campo de un esquema, con el esquema que lo contiene. */
type CampoAnidado = {
  nombre: string;
  esquema: EsquemaJson;
  /** El esquema que contiene al campo: la base de sus punteros locales. */
  base: EsquemaJson;
};

/**
 * Pantalla del contrato de la API.
 *
 * Los tres estados de una consulta —cargando, fallida, resuelta— son los de
 * toda la interfaz: `Cargando` mientras llega el documento y `AvisoError`
 * cuando la API falla. El error se muestra **por código** (spec S6): el
 * `AvisoError` enseña el mensaje de la API y el `request_id` con el que se
 * correlaciona con el log del servidor (spec S7).
 */
export function Contrato() {
  const consulta = useContrato();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Contrato de la API</h1>
        <p className="mt-1 text-sm text-slate-600">
          El documento OpenAPI que la API publica en{" "}
          <code className="font-mono">/api/openapi.json</code>, tal como lo declara el servidor.
        </p>
      </header>

      {consulta.isPending ? (
        <Cargando texto="Cargando el contrato…" />
      ) : consulta.isError ? (
        <AvisoError error={consulta.error} titulo="No se pudo leer el contrato de la API" />
      ) : (
        <Contenido contrato={consulta.data} />
      )}
    </div>
  );
}

/** El contrato ya cargado, con sus cuatro secciones. */
function Contenido({ contrato }: { contrato: ContratoOpenApi }) {
  const grupos = agruparRutas(contrato);
  const colecciones = coleccionesDe(contrato);
  const codigos = codigosDeError(contrato);
  const descripciones = descripcionesDeCodigos(contrato);

  return (
    <div className="space-y-6">
      <Tarjeta titulo={contrato.info.title} descripcion={contrato.info.description}>
        <dl className="grid gap-x-8 sm:grid-cols-2">
          <Dato etiqueta="Versión" valor={contrato.info.version} />
          <Dato etiqueta="Documento" valor={`OpenAPI ${contrato.openapi}`} />
          <Dato
            etiqueta="Rutas"
            valor={`${formatearNumero(Object.keys(contrato.paths).length)} rutas`}
          />
          <Dato
            etiqueta="Operaciones"
            valor={`${formatearNumero(totalDeOperaciones(contrato))} operaciones`}
          />
        </dl>
      </Tarjeta>

      <Tarjeta
        titulo="Recursos y rutas"
        descripcion="Cada ruta del contrato, agrupada por el recurso al que pertenece."
      >
        {grupos.length === 0 ? (
          <Vacio texto="El contrato no declara ninguna ruta." />
        ) : (
          <div className="space-y-6">
            {grupos.map((grupo) => (
              <section key={grupo.etiqueta}>
                <h3 className="font-mono text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {grupo.etiqueta}
                </h3>

                <ul className="mt-2 space-y-4">
                  {grupo.rutas.map((ruta) => (
                    <li key={ruta.plantilla}>
                      <code className="font-mono text-sm font-semibold text-slate-900">
                        {ruta.plantilla}
                      </code>

                      <ul className="mt-2 space-y-3">
                        {ruta.operaciones.map((operacion) => (
                          <li key={operacion.metodo} className="border-l-2 border-slate-200 pl-3">
                            <p className="text-sm">
                              <span className="mr-2 font-mono text-xs font-bold uppercase text-slate-700">
                                {operacion.metodo}
                              </span>
                              <span className="font-medium text-slate-900">
                                {operacion.operacion.summary}
                              </span>
                            </p>

                            {operacion.operacion.description !== undefined ? (
                              <p className="mt-1 text-sm text-slate-600">
                                {operacion.operacion.description}
                              </p>
                            ) : null}

                            <ParametrosDe operacion={operacion.operacion} />
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Tarjeta>

      <Tarjeta
        titulo="Esquemas de las colecciones"
        descripcion="Los campos de cada colección: su tipo, si son obligatorios, su vocabulario y sus límites."
      >
        {colecciones.length === 0 ? (
          <Vacio texto="El contrato no declara esquemas de colecciones." />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {colecciones.map((coleccion) => (
              <section key={coleccion.nombre}>
                <h3 className="font-mono text-sm font-semibold text-slate-900">
                  {coleccion.nombre}
                </h3>

                <ul className="mt-2 space-y-2">
                  {Object.entries(coleccion.esquema.properties ?? {}).map(([campo, esquema]) => (
                    <li key={campo}>
                      <CampoDeEsquema
                        contrato={contrato}
                        nombre={campo}
                        esquema={esquema}
                        base={coleccion.esquema}
                        requerido={coleccion.esquema.required?.includes(campo) ?? false}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Tarjeta>

      <Tarjeta
        titulo="Códigos de error"
        descripcion="El contrato único de error: la misma forma de cuerpo para todos los fallos."
      >
        {codigos.length === 0 ? (
          <Vacio texto="El contrato no declara códigos de error." />
        ) : (
          <ul className="space-y-2">
            {codigos.map((codigo) => (
              <li key={codigo}>
                <span className="font-mono text-sm font-medium text-slate-900">{codigo}</span>

                {descripciones[codigo] !== undefined ? (
                  <p className="text-sm text-slate-600">{descripciones[codigo]}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}

/**
 * Los parámetros que declara una operación.
 *
 * El nombre y el lugar del parámetro (`path`, `query`, `header`) son lo que el
 * servidor publica; si el parámetro es requerido, se dice. Los parámetros
 * que el documento no declara no se inventan.
 */
function ParametrosDe({ operacion }: { operacion: OperacionContrato }) {
  const parametros = operacion.parameters ?? [];

  if (parametros.length === 0) {
    return null;
  }

  return (
    <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
      {parametros.map((parametro, indice) => {
        const nombre = nombreDeParametro(parametro);
        const lugar = lugarDeParametro(parametro);

        return (
          <li
            key={`${nombre}:${lugar}:${indice}`}
            className="flex items-center gap-1 text-xs text-slate-600"
          >
            <span className="font-mono text-slate-800">{nombre}</span>
            {lugar !== "" ? <span className="font-mono text-slate-500">{lugar}</span> : null}
            <span>{parametro.required === true ? "requerido" : "opcional"}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Un campo de un esquema, con lo que el documento declara de él.
 *
 * La referencia se resuelve con el **mismo resolutor que usa el editor de la
 * configuración**: los esquemas se referencian entre sí (y con punteros
 * locales, como el `creado_en` de un usuario, que apunta a su propio
 * `fecha_nacimiento`), así que sin resolver no se vería ni el tipo ni los
 * límites de esos campos.
 */
function CampoDeEsquema({
  contrato,
  nombre,
  esquema,
  base,
  requerido,
  nivel = 0,
}: {
  contrato: ContratoOpenApi;
  nombre: string;
  esquema: EsquemaJson;
  base: EsquemaJson | undefined;
  requerido: boolean;
  nivel?: number;
}) {
  const resuelto = resolverEsquema(esquema, contrato, base);

  if (resuelto === undefined) {
    return null;
  }

  const tipo = tipoDeEsquema(resuelto);
  const vocabulario = vocabularioDe(resuelto);
  const limites = limitesDe(resuelto);
  const anidados = nivel < PROFUNDIDAD_MAXIMA ? camposAnidados(contrato, resuelto, base) : [];

  return (
    <div>
      <p className="text-sm">
        <span className="font-mono font-medium text-slate-900">{nombre}</span>
        {tipo !== undefined ? <span className="ml-2 text-xs text-slate-500">{tipo}</span> : null}
        {requerido ? (
          <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
            obligatorio
          </span>
        ) : null}
      </p>

      {vocabulario.length > 0 ? (
        <p className="mt-0.5 font-mono text-xs text-slate-600">{vocabulario.join(" · ")}</p>
      ) : null}

      {limites.length > 0 ? (
        <p className="mt-0.5 text-xs text-slate-600">{limites.join(" · ")}</p>
      ) : null}

      {resuelto.description !== undefined ? (
        <p className="mt-0.5 text-xs text-slate-600">{resuelto.description}</p>
      ) : null}

      {anidados.length > 0 ? (
        <ul className="mt-1 space-y-1 border-l border-slate-200 pl-3">
          {anidados.map((campo) => (
            <li key={campo.nombre}>
              <CampoDeEsquema
                contrato={contrato}
                nombre={campo.nombre}
                esquema={campo.esquema}
                base={campo.base}
                requerido={false}
                nivel={nivel + 1}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Los campos que viven dentro de un campo.
 *
 * Un objeto trae sus propiedades y un arreglo de objetos trae las del
 * elemento: en los dos casos el esquema que los contiene es el que resuelve
 * sus punteros locales.
 */
function camposAnidados(
  contrato: ContratoOpenApi,
  esquema: EsquemaJson,
  base: EsquemaJson | undefined,
): CampoAnidado[] {
  const tipo = tipoDeEsquema(esquema);

  if (tipo === "object") {
    return Object.entries(esquema.properties ?? {}).map(([nombre, propiedad]) => ({
      nombre,
      esquema: propiedad,
      base: esquema,
    }));
  }

  if (tipo === "array") {
    const elementos = resolverEsquema(esquema.items, contrato, base);

    if (elementos === undefined || tipoDeEsquema(elementos) !== "object") {
      return [];
    }

    return Object.entries(elementos.properties ?? {}).map(([nombre, propiedad]) => ({
      nombre,
      esquema: propiedad,
      base: elementos,
    }));
  }

  return [];
}

/**
 * Las rutas del contrato, agrupadas por recurso.
 *
 * El recurso es **el primer segmento de la ruta**: `/eventos/{id}` es del
 * recurso `eventos`, y `/reportes/cierre-contable` del recurso `reportes`. Se
 * agrupa por la ruta y no por la etiqueta que el servidor le pone a cada
 * operación porque esas etiquetas no son uniformes —la ruta de un recurso y la
 * de un documento de ese recurso llevan etiquetas distintas («usuarios» y «un
 * usuario»)— y agrupar por ellas abriría quince grupos donde el modelo tiene
 * nueve colecciones.
 */
function agruparRutas(contrato: ContratoOpenApi): GrupoDeRutas[] {
  const grupos = new Map<string, RutaDelContrato[]>();

  for (const [plantilla, operaciones] of Object.entries(contrato.paths)) {
    const metodos = Object.entries(operaciones).filter(([metodo]) => esMetodoHttp(metodo));

    if (metodos.length === 0) {
      continue;
    }

    const recurso = recursoDe(plantilla);

    const rutas = grupos.get(recurso) ?? [];

    rutas.push({
      plantilla,
      operaciones: metodos.map(([metodo, operacion]) => ({
        metodo: metodo.toUpperCase(),
        operacion,
      })),
    });

    grupos.set(recurso, rutas);
  }

  return [...grupos.entries()].map(([etiqueta, rutas]) => ({ etiqueta, rutas }));
}

/**
 * El recurso al que pertenece una ruta: su primer segmento.
 *
 * `/eventos/{id}` → `eventos`; `/health` → `health`. Una ruta sin segmento
 * —que el contrato no tiene— queda sin recurso, y el grupo lo diría.
 */
function recursoDe(plantilla: string): string {
  const segmentos = plantilla.split("/").filter((segmento) => segmento !== "");

  return segmentos[0] ?? SIN_ETIQUETA;
}

/** Cuántas operaciones declara el contrato en total. */
function totalDeOperaciones(contrato: ContratoOpenApi): number {
  return Object.values(contrato.paths).reduce(
    (total, operaciones) => total + Object.keys(operaciones).filter(esMetodoHttp).length,
    0,
  );
}

/** ¿La clave de una ruta es un método HTTP? */
function esMetodoHttp(metodo: string): boolean {
  return METODOS_HTTP.includes(metodo.toLowerCase());
}

/**
 * Los esquemas de las colecciones, tal como los publica el contrato.
 *
 * Una colección aparece en el documento de tres maneras: como una **página de
 * resultados** (que declara sus elementos en `items`), como el **documento**
 * de la colección y como la **forma de entrada** (`<colección>Entrada`) con la
 * que el cliente escribe. Los tres caminos juntos dicen qué es una colección y
 * qué no: un esquema que solo se lee —un *snapshot*— no tiene forma de
 * entrada, así que no es una colección.
 *
 * La lista sale del documento, no de una lista escrita en el código: una
 * colección nueva aparecería en pantalla sin tocar la interfaz.
 */
function coleccionesDe(contrato: ContratoOpenApi): Coleccion[] {
  const esquemas = contrato.components.schemas;
  const colecciones = new Map<string, EsquemaJson>();

  for (const esquema of Object.values(esquemas)) {
    for (const propiedad of Object.values(esquema.properties ?? {})) {
      const referencia = propiedad.items?.$ref;

      if (referencia === undefined) {
        continue;
      }

      const nombre = nombreDeEsquema(referencia);

      if (nombre === undefined) {
        continue;
      }

      const coleccion = esquemas[nombre];

      if (coleccion === undefined || esquemas[`${nombre}Entrada`] === undefined) {
        continue;
      }

      colecciones.set(nombre, coleccion);
    }
  }

  return [...colecciones.entries()].map(([nombre, esquema]) => ({ nombre, esquema }));
}

/** El nombre del esquema al que apunta una referencia del contrato. */
function nombreDeEsquema(referencia: string): string | undefined {
  const partes = referencia
    .replace(/^#\//, "")
    .split("/")
    .filter((parte) => parte !== "");

  if (partes[0] !== "components" || partes[1] !== "schemas") {
    return undefined;
  }

  return partes[2];
}

/**
 * Los códigos de error del contrato único.
 *
 * Se leen del esquema `Error` que el contrato publica: el `enum` de `codigo`
 * es la lista de códigos que la API puede devolver, y esa lista la mantiene
 * el servidor, no la interfaz.
 */
function codigosDeError(contrato: ContratoOpenApi): string[] {
  const valores = contrato.components.schemas.Error?.properties?.error?.properties?.codigo?.enum;

  if (valores === undefined) {
    return [];
  }

  return valores.map((valor) => String(valor));
}

/**
 * La descripción de la respuesta que produce cada código.
 *
 * El contrato publica, en cada respuesta de error, un ejemplo con el código y
 * el mensaje: el ejemplo dice **qué código** produce esa respuesta y su
 * `description` dice **qué significa**. Un código que el contrato no ejemplo
 * se queda sin descripción, en lugar de que la interfaz se la invente.
 */
function descripcionesDeCodigos(contrato: ContratoOpenApi): Record<string, string> {
  const descripciones: Record<string, string> = {};

  for (const operaciones of Object.values(contrato.paths)) {
    for (const operacion of Object.values(operaciones)) {
      for (const respuesta of Object.values(operacion.responses ?? {})) {
        const codigo = codigoDeEjemplo(respuesta);

        if (codigo === undefined || descripciones[codigo] !== undefined) {
          continue;
        }

        if (respuesta.description !== undefined) {
          descripciones[codigo] = respuesta.description;
        }
      }
    }
  }

  return descripciones;
}

/** El código de error que produce una respuesta, según su ejemplo. */
function codigoDeEjemplo(respuesta: RespuestaContrato): string | undefined {
  const ejemplos = respuesta.content?.["application/json"]?.examples;

  if (ejemplos === undefined) {
    return undefined;
  }

  for (const ejemplo of Object.values(ejemplos)) {
    const valor = ejemplo.value;

    if (esRegistro(valor) && esRegistro(valor.error) && typeof valor.error.codigo === "string") {
      return valor.error.codigo;
    }
  }

  return undefined;
}

/** Los valores de vocabulario cerrado de un campo. */
function vocabularioDe(esquema: EsquemaJson): string[] {
  const directo = esquema.enum;

  if (directo !== undefined && directo.length > 0) {
    return directo.map((valor) => String(valor));
  }

  const deElementos = esquema.items?.enum;

  if (deElementos !== undefined && deElementos.length > 0) {
    return deElementos.map((valor) => String(valor));
  }

  return [];
}

/** Los límites que declara el dominio para un campo. */
function limitesDe(esquema: EsquemaJson): string[] {
  const limites: string[] = [];

  if (esquema.minimum !== undefined) {
    limites.push(`mínimo ${esquema.minimum}`);
  }

  if (esquema.maximum !== undefined) {
    limites.push(`máximo ${esquema.maximum}`);
  }

  if (esquema.minLength !== undefined) {
    limites.push(`longitud mínima ${esquema.minLength}`);
  }

  if (esquema.maxLength !== undefined) {
    limites.push(`longitud máxima ${esquema.maxLength}`);
  }

  return limites;
}

/** ¿El valor es un objeto que se puede leer por clave? */
function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}
