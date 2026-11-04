import { useEffect, useState } from "react";
import {
  resolverEsquema,
  tipoDeEsquema,
  type ContratoOpenApi,
  type EsquemaJson,
} from "@/api/contrato";
import { aCampoFechaHora, aIsoUtcDesdeCampo } from "@/formato/es-co";

/**
 * Campos construidos con el esquema que publica el contrato.
 *
 * La configuración del evento es la parte **flexible** del modelo (spec S10):
 * el mismo documento sirve a eventos de tipos distintos, y cada tipo puede
 * traer sus propios campos. La interfaz **no** mantiene una lista de campos
 * por tipo: este editor arma los controles con el esquema que el servidor
 * publica en `/api/openapi.json`, así que un bloque nuevo aparece en la
 * pantalla sin que nadie escriba su formulario.
 *
 * Tres decisiones que conviene tener presentes:
 *
 * - **El editor no valida.** Los límites del esquema (`minimum`, `maxLength`)
 *   se muestran, pero quien juzga es el dominio: su veredicto llega con el
 *   detalle por campo que la pantalla muestra (spec S6).
 * - **Un campo vacío no es un valor.** Si se borra, la propiedad desaparece
 *   del objeto en vez de quedarse con una cadena en blanco.
 * - **Lo que el editor no entiende, no lo muestra.** Una forma que no sabe
 *   leer (un arreglo de objetos, por ejemplo) se edita como JSON: es
 *   preferible a fingir que se sabe lo que se está haciendo.
 */

/** Las clases del control de formulario: todos los campos se ven igual. */
const CONTROL =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none";

/** Propiedades del editor de campos. */
export type CamposDeEsquemaProps = {
  /** El contrato que declara los esquemas. */
  contrato: ContratoOpenApi | undefined;
  /** El esquema del valor que se quiere editar. */
  esquema: EsquemaJson | undefined;
  /** El valor actual. */
  valor: unknown;
  /** Qué hacer cuando el valor cambia. */
  onCambiar: (valor: unknown) => void;
  /** Prefijo de los identificadores de los controles. */
  idBase: string;
};

/**
 * Los controles de un esquema.
 *
 * Un esquema de objeto se despliega en sus propiedades; cualquier otro tipo
 * se muestra como un control único.
 */
export function CamposDeEsquema({
  contrato,
  esquema,
  valor,
  onCambiar,
  idBase,
}: CamposDeEsquemaProps) {
  const resuelto = resolverEsquema(esquema, contrato);

  if (resuelto === undefined) {
    return null;
  }

  if (tipoDeEsquema(resuelto) === "object") {
    return (
      <CamposDeObjeto
        contrato={contrato}
        esquema={resuelto}
        valor={esObjeto(valor) ? valor : {}}
        onCambiar={onCambiar}
        idBase={idBase}
      />
    );
  }

  return (
    <CampoSimple
      contrato={contrato}
      esquema={resuelto}
      valor={valor}
      onCambiar={onCambiar}
      id={idBase}
      etiqueta=""
    />
  );
}

/** Propiedades del editor de un objeto. */
type CamposDeObjetoProps = {
  contrato: ContratoOpenApi | undefined;
  esquema: EsquemaJson;
  valor: Record<string, unknown>;
  onCambiar: (valor: unknown) => void;
  idBase: string;
};

/**
 * Las propiedades de un objeto, una por una.
 *
 * El nombre de la propiedad es la etiqueta: es la palabra del contrato, y
 * mostrarla tal cual es parte de la demostración —el profesor ve el nombre
 * que el servidor usa, no una traducción inventada—.
 */
function CamposDeObjeto({ contrato, esquema, valor, onCambiar, idBase }: CamposDeObjetoProps) {
  const propiedades = esquema.properties ?? {};

  return (
    <div className="space-y-4">
      {Object.entries(propiedades).map(([campo, campoEsquema]) => (
        <CampoDePropiedad
          key={campo}
          contrato={contrato}
          esquema={campoEsquema}
          base={esquema}
          valor={valor[campo]}
          onCambiar={(nuevo) => onCambiar(conCampo(valor, campo, nuevo))}
          id={`${idBase}-${campo}`}
          etiqueta={etiquetaDe(campo)}
        />
      ))}
    </div>
  );
}

/** Propiedades de una propiedad del objeto. */
type CampoDePropiedadProps = {
  contrato: ContratoOpenApi | undefined;
  esquema: EsquemaJson;
  /** El esquema que contiene a este: es la base de sus punteros locales. */
  base?: EsquemaJson;
  valor: unknown;
  onCambiar: (valor: unknown) => void;
  id: string;
  etiqueta: string;
};

/**
 * Una propiedad del objeto: el control depende del tipo que declara el
 * esquema.
 */
function CampoDePropiedad({
  contrato,
  esquema,
  base,
  valor,
  onCambiar,
  id,
  etiqueta,
}: CampoDePropiedadProps) {
  const resuelto = resolverEsquema(esquema, contrato, base);

  if (resuelto === undefined) {
    return null;
  }

  const tipo = tipoDeEsquema(resuelto);

  if (tipo === "object") {
    return (
      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-sm font-medium text-slate-700">{etiqueta}</legend>
        <CamposDeObjeto
          contrato={contrato}
          esquema={resuelto}
          valor={esObjeto(valor) ? valor : {}}
          onCambiar={onCambiar}
          idBase={id}
        />
      </fieldset>
    );
  }

  return (
    <CampoSimple
      contrato={contrato}
      esquema={resuelto}
      valor={valor}
      onCambiar={onCambiar}
      id={id}
      etiqueta={etiqueta}
    />
  );
}

/** Propiedades de un control simple (un campo, no un grupo). */
type CampoSimpleProps = {
  contrato: ContratoOpenApi | undefined;
  esquema: EsquemaJson;
  valor: unknown;
  onCambiar: (valor: unknown) => void;
  id: string;
  etiqueta: string;
};

/**
 * El control de un valor simple.
 *
 * El tipo decide el control: un vocabulario cerrado es una lista, una fecha
 * es un campo de fecha y hora, un número es un campo numérico, y un texto es
 * un texto. El `enum` del esquema manda sobre el tipo: un campo con valores
 * cerrados no es texto libre.
 */
function CampoSimple({ contrato, esquema, valor, onCambiar, id, etiqueta }: CampoSimpleProps) {
  const resuelto = resolverEsquema(esquema, contrato) ?? esquema;
  const tipo = tipoDeEsquema(resuelto);

  if (resuelto.enum !== undefined && resuelto.enum.length > 0) {
    const opciones = resuelto.enum.filter((opcion): opcion is string => typeof opcion === "string");

    return (
      <div className="space-y-1">
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {etiqueta}
        </label>
        <select
          id={id}
          className={CONTROL}
          value={typeof valor === "string" ? valor : ""}
          onChange={(evento) =>
            onCambiar(evento.target.value === "" ? undefined : evento.target.value)
          }
        >
          <option value="">—</option>
          {opciones.map((opcion) => (
            <option key={opcion} value={opcion}>
              {opcion}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (tipo === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="checkbox"
          checked={valor === true}
          onChange={(evento) => onCambiar(evento.target.checked)}
        />
        <label htmlFor={id} className="text-sm text-slate-700">
          {etiqueta}
        </label>
      </div>
    );
  }

  if (tipo === "integer" || tipo === "number") {
    return (
      <div className="space-y-1">
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {etiqueta}
        </label>
        <input
          id={id}
          type="number"
          className={CONTROL}
          value={typeof valor === "number" && Number.isFinite(valor) ? String(valor) : ""}
          min={resuelto.minimum}
          max={resuelto.maximum}
          onChange={(evento) => {
            const texto = evento.target.value;

            if (texto.trim() === "") {
              onCambiar(undefined);
              return;
            }

            const numero = Number(texto);

            onCambiar(Number.isFinite(numero) ? numero : undefined);
          }}
        />
      </div>
    );
  }

  if (tipo === "array") {
    const elementos = resuelto.items;
    const esDeTextos = elementos !== undefined && tipoDeEsquema(elementos) === "string";

    if (!esDeTextos) {
      return <CampoJson valor={valor} onCambiar={onCambiar} id={id} etiqueta={etiqueta} />;
    }

    return (
      <div className="space-y-1">
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {etiqueta}
        </label>
        <input
          id={id}
          type="text"
          className={CONTROL}
          value={
            Array.isArray(valor)
              ? valor.filter((item): item is string => typeof item === "string").join(", ")
              : ""
          }
          onChange={(evento) => {
            const partes = evento.target.value
              .split(",")
              .map((parte) => parte.trim())
              .filter((parte) => parte !== "");

            onCambiar(partes.length === 0 ? undefined : partes);
          }}
        />
      </div>
    );
  }

  if (tipo === "string" && resuelto.format === "date-time") {
    return (
      <div className="space-y-1">
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {etiqueta}
        </label>
        <input
          id={id}
          type="datetime-local"
          className={CONTROL}
          value={typeof valor === "string" ? aCampoFechaHora(valor) : ""}
          onChange={(evento) => {
            const iso = aIsoUtcDesdeCampo(evento.target.value);

            if (iso !== null) {
              onCambiar(iso);
            }
          }}
        />
      </div>
    );
  }

  if (tipo === "string") {
    return (
      <div className="space-y-1">
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {etiqueta}
        </label>
        <input
          id={id}
          type="text"
          className={CONTROL}
          value={typeof valor === "string" ? valor : ""}
          minLength={resuelto.minLength}
          maxLength={resuelto.maxLength}
          onChange={(evento) =>
            onCambiar(evento.target.value === "" ? undefined : evento.target.value)
          }
        />
      </div>
    );
  }

  return <CampoJson valor={valor} onCambiar={onCambiar} id={id} etiqueta={etiqueta} />;
}

/** Propiedades del control JSON: la salida para lo que el editor no entiende. */
type CampoJsonProps = {
  valor: unknown;
  onCambiar: (valor: unknown) => void;
  id: string;
  etiqueta: string;
};

/**
 * Un valor que se edita como JSON.
 *
 * Es la salida honesta para las formas que el editor no sabe leer: se ve
 * exactamente lo que se va a mandar, y un JSON inválido no se manda.
 */
function CampoJson({ valor, onCambiar, id, etiqueta }: CampoJsonProps) {
  const [texto, setTexto] = useState(() => JSON.stringify(valor ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTexto(JSON.stringify(valor ?? {}, null, 2));
  }, [valor]);

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {etiqueta}
      </label>
      <textarea
        id={id}
        rows={5}
        className={`${CONTROL} font-mono text-xs`}
        value={texto}
        onChange={(evento) => {
          setTexto(evento.target.value);
          setError(null);

          if (evento.target.value.trim() === "") {
            onCambiar(undefined);
            return;
          }

          try {
            onCambiar(JSON.parse(evento.target.value) as unknown);
          } catch {
            setError("El JSON no está bien formado: todavía no se ha guardado.");
          }
        }}
      />
      {error !== null ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Un objeto del contrato.
 *
 * `noUncheckedIndexedAccess` hace que leer una clave que no existe dé
 * `undefined`: por eso el valor de una propiedad ausente es `undefined` y no
 * una cadena en blanco.
 */
function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Un objeto con una propiedad cambiada (o quitada, si el valor es `undefined`). */
function conCampo(
  valor: Record<string, unknown>,
  campo: string,
  nuevo: unknown,
): Record<string, unknown> {
  const copia = { ...valor };

  if (nuevo === undefined) {
    delete copia[campo];
  } else {
    copia[campo] = nuevo;
  }

  return copia;
}

/**
 * La etiqueta de una propiedad.
 *
 * El nombre del contrato se vuelve legible sin traducirlo: los guiones bajos
 * se vuelven espacios y la primera letra sube. Traducirlo sería escribir en
 * la interfaz una lista de campos por tipo —justo lo que la spec S10
 * prohíbe—, y dejar el nombre crudo sería leerle al profesor el nombre de una
 * variable.
 */
function etiquetaDe(campo: string): string {
  const palabras = campo.replace(/_/g, " ").trim();

  if (palabras === "") {
    return campo;
  }

  return palabras.charAt(0).toUpperCase() + palabras.slice(1);
}
