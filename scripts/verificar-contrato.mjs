/**
 * Verificación del contrato entre la API y la interfaz web.
 *
 * La interfaz consume el contrato OpenAPI de la API, y sus tipos
 * (`apps/web/src/api/tipos.ts`) están **escritos a mano**: eso es lo que hace
 * que sean comprobables, y también lo que los deja expuestos a quedar viejos.
 * Un tipo que declara una clave que la API ya no manda hace que la pantalla
 * muestre `undefined`; una clave que la API manda y el tipo no declara es un
 * `undefined` que nadie ve venir.
 *
 * Este script **contrasta la respuesta real de la API contra los tipos
 * declarados**, sin mocks: pide los datos de verdad y los recorre con el
 * compilador de TypeScript, así que la comprobación es la misma que haría el
 * compilador, pero sobre la respuesta que el servidor devuelve de verdad.
 *
 *   pnpm verificar:contrato
 *
 * Cubre hoy **todo lo que la interfaz consume**: la salud, los eventos (la
 * colección y el detalle), los lugares, las promociones y las cuatro vistas
 * del reporting. Para verificar otro recurso basta con agregarlo a la tabla
 * `VERIFICACIONES` de este archivo.
 *
 * Requiere la API arriba (no hace falta el servidor de Vite: este script
 * habla con la API directamente).
 *
 *   EVENTIX_API_URL=http://localhost:3000 pnpm verificar:contrato
 */
import { join, resolve } from "node:path";
import ts from "typescript";

const RAIZ = resolve(import.meta.dirname, "..");
const ARCHIVO_TIPOS = join(RAIZ, "apps/web/src/api/tipos.ts");
const BASE = process.env.EVENTIX_API_URL ?? "http://localhost:3000";

/**
 * Las estructuras que se verifican.
 *
 * Cada entrada dice de dónde sale el valor real y contra qué tipo declarado se
 * compara. La comparación **recorre** el tipo: los objetos anidados, los
 * arrays y las uniones se verifican solos, así que aquí solo hace falta la
 * raíz de cada respuesta.
 *
 * Dos entradas necesitan una aclaración:
 *
 * - `Pagina<T>` es genérica, y el tipo de sus elementos es `unknown` en la
 *   firma: la página se compara con `Pagina` y su primer elemento aparte,
 *   contra el tipo concreto.
 * - Las promociones se devuelven como un **array**, no como una página: la
 *   entrada lleva `array: true` y se compara cada elemento contra `Promocion`.
 *
 * **No hace falta una lista de tipos "abiertos":** el esquema del servidor
 * (`z.object`) elimina las claves que no conoce, así que la API nunca manda
 * una clave que el tipo no declare. Si algún día el modelo se abriera, el
 * verificador fallaría y avisaría —que es justo lo que tiene que pasar—.
 */
const VERIFICACIONES = [
  { etiqueta: "salud", tipo: "Salud", valor: (datos) => datos.salud },
  { etiqueta: "página de eventos", tipo: "Pagina", valor: (datos) => datos.eventos },
  { etiqueta: "evento de la página", tipo: "Evento", valor: (datos) => datos.eventos.items[0] },
  { etiqueta: "evento", tipo: "Evento", valor: (datos) => datos.evento },
  { etiqueta: "página de lugares", tipo: "Pagina", valor: (datos) => datos.lugares },
  { etiqueta: "lugar de la página", tipo: "Lugar", valor: (datos) => datos.lugares.items[0] },
  {
    etiqueta: "promociones del evento",
    tipo: "Promocion",
    array: true,
    valor: (datos) => datos.promociones,
  },
  { etiqueta: "dashboard del evento", tipo: "DashboardEvento", valor: (datos) => datos.dashboard },
  { etiqueta: "página de asistentes", tipo: "Pagina", valor: (datos) => datos.asistentes },
  {
    etiqueta: "asistente de la página",
    tipo: "Asistente",
    valor: (datos) => datos.asistentes.items[0],
  },
  { etiqueta: "cierre contable", tipo: "CierreContable", valor: (datos) => datos.cierre },
  { etiqueta: "ranking de vendidos", tipo: "RankingVendidos", valor: (datos) => datos.ranking },
  { etiqueta: "página de usuarios", tipo: "Pagina", valor: (datos) => datos.usuarios },
  { etiqueta: "usuario de la página", tipo: "Usuario", valor: (datos) => datos.usuarios.items[0] },
  { etiqueta: "página de tickets", tipo: "Pagina", valor: (datos) => datos.tickets },
  { etiqueta: "ticket de la página", tipo: "Ticket", valor: (datos) => datos.tickets.items[0] },
  { etiqueta: "página de transacciones", tipo: "Pagina", valor: (datos) => datos.transacciones },
  {
    etiqueta: "transacción de la página",
    tipo: "Transaccion",
    valor: (datos) => datos.transacciones.items[0],
  },
];

/** Pide un recurso de la API y devuelve su cuerpo. */
async function pedir(ruta) {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    headers: { accept: "application/json" },
  });

  if (!respuesta.ok) {
    throw new Error(`GET ${ruta} respondió ${respuesta.status} ${respuesta.statusText}`);
  }

  return respuesta.json();
}

/**
 * El compilador de TypeScript, con los tipos del frontend cargados.
 *
 * Los tipos se leen **con el compilador**, no con una expresión regular: así
 * el script sabe distinguir una propiedad obligatoria de una opcional, y sabe
 * qué tipo tiene cada una, sin depender del formato con el que esté escrito
 * el archivo.
 */
const programa = ts.createProgram([ARCHIVO_TIPOS], {
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  noEmit: true,
});

const checker = programa.getTypeChecker();
const fuente = programa.getSourceFile(ARCHIVO_TIPOS);

/** Los símbolos que el archivo de tipos exporta. */
const exportados = checker.getExportsOfModule(checker.getSymbolAtLocation(fuente));

/** El símbolo de un tipo exportado, o `null` si no existe. */
function simboloDe(nombre) {
  return exportados.find((simbolo) => simbolo.name === nombre) ?? null;
}

/** El tipo declarado de un tipo exportado. */
function tipoDe(nombre) {
  const simbolo = simboloDe(nombre);

  if (simbolo === null) {
    throw new Error(`El archivo de tipos no exporta "${nombre}"`);
  }

  return checker.getDeclaredTypeOfSymbol(simbolo);
}

/** Las propiedades de un tipo, con su nombre, si es opcional y su tipo. */
function propiedadesDe(tipo) {
  return checker.getPropertiesOfType(tipo).map((simbolo) => ({
    nombre: simbolo.name,
    opcional: (simbolo.flags & ts.SymbolFlags.Optional) !== 0,
    tipo: checker.getTypeOfSymbolAtLocation(simbolo, simbolo.declarations?.[0] ?? fuente),
  }));
}

/**
 * El valor de un literal.
 *
 * Los literales de texto y de número llevan su valor en `.value`, pero los
 * booleanos no: llevan su nombre en `intrinsicName` ("true" / "false"). Sin
 * esta diferencia, un `activo: boolean` se compararía contra `undefined`.
 */
function valorDeLiteral(tipo) {
  if (tipo.flags & ts.TypeFlags.BooleanLiteral) {
    return tipo.intrinsicName === "true";
  }

  return tipo.value;
}

/** Contador de propiedades comprobadas: es lo que resume el trabajo hecho. */
let comprobadas = 0;

/**
 * Compara un valor real contra un tipo declarado.
 *
 * La comparación es la misma que haría el compilador, pero sobre la respuesta
 * que el servidor devuelve de verdad:
 *
 * - una clave que la API manda y el tipo no declara **falla**;
 * - una propiedad que el tipo declara y la API no manda **falla**, salvo que
 *   sea opcional;
 * - el tipo primitivo del valor tiene que ser el declarado;
 * - en una unión de literales, el valor tiene que ser uno de ellos.
 */
function verificar(etiqueta, valor, tipo, problemas) {
  // Un valor ausente: solo es un problema si el tipo no lo admite.
  if (valor === null || valor === undefined) {
    if (tipo.flags & ts.TypeFlags.Null || tipo.flags & ts.TypeFlags.Undefined) {
      return;
    }

    if (tipo.isUnion() && tipo.types.some((t) => t.flags & ts.TypeFlags.Null)) {
      return;
    }

    problemas.push(`${etiqueta}: el valor es ${valor} y el tipo no lo admite`);

    return;
  }

  // Una unión: se descarta el `null` y se sigue con lo que queda.
  if (tipo.isUnion()) {
    const sinNulo = tipo.types.filter((t) => !(t.flags & ts.TypeFlags.Null));

    if (sinNulo.length === 1) {
      verificar(etiqueta, valor, sinNulo[0], problemas);

      return;
    }

    const literales = sinNulo.filter(
      (t) =>
        t.flags & ts.TypeFlags.StringLiteral ||
        t.flags & ts.TypeFlags.NumberLiteral ||
        t.flags & ts.TypeFlags.BooleanLiteral,
    );

    if (literales.length === sinNulo.length) {
      if (!literales.some((t) => valorDeLiteral(t) === valor)) {
        const admitidos = literales.map((t) => JSON.stringify(valorDeLiteral(t))).join(", ");

        problemas.push(`${etiqueta}: "${valor}" no es ninguno de los valores admitidos (${admitidos})`);
      }

      return;
    }

    // Una unión de objetos: el valor tiene que encajar en alguno.
    const encaja = sinNulo.some((miembro) => {
      const problemasDelMiembro = [];

      verificar(etiqueta, valor, miembro, problemasDelMiembro);

      return problemasDelMiembro.length === 0;
    });

    if (!encaja) {
      problemas.push(`${etiqueta}: el valor no encaja en ninguno de los tipos de la unión`);
    }

    return;
  }

  // Los literales: "publicado", 25, true.
  //
  // Un literal tiene su propio flag y **no** el del primitivo que widened: por
  // eso se comprueba antes. Y `boolean` es, por dentro, la unión `true |
  // false`, así que sin esto un `activo: boolean` se tomaría por una unión que
  // no acepta el valor.
  if (tipo.flags & ts.TypeFlags.StringLiteral) {
    comprobadas += 1;

    if (valor !== valorDeLiteral(tipo)) {
      problemas.push(
        `${etiqueta}: el tipo declara ${JSON.stringify(valorDeLiteral(tipo))} y la API mandó ${JSON.stringify(valor)}`,
      );
    }

    return;
  }

  if (tipo.flags & ts.TypeFlags.NumberLiteral) {
    comprobadas += 1;

    if (valor !== valorDeLiteral(tipo)) {
      problemas.push(
        `${etiqueta}: el tipo declara ${JSON.stringify(valorDeLiteral(tipo))} y la API mandó ${JSON.stringify(valor)}`,
      );
    }

    return;
  }

  if (tipo.flags & ts.TypeFlags.BooleanLiteral) {
    comprobadas += 1;

    if (valor !== valorDeLiteral(tipo)) {
      problemas.push(
        `${etiqueta}: el tipo declara ${JSON.stringify(valorDeLiteral(tipo))} y la API mandó ${JSON.stringify(valor)}`,
      );
    }

    return;
  }

  // Los primitivos.
  if (tipo.flags & ts.TypeFlags.String) {
    comprobadas += 1;

    if (typeof valor !== "string") {
      problemas.push(`${etiqueta}: el tipo declara string y la API mandó ${typeof valor}`);
    }

    return;
  }

  if (tipo.flags & ts.TypeFlags.Number) {
    comprobadas += 1;

    if (typeof valor !== "number") {
      problemas.push(`${etiqueta}: el tipo declara number y la API mandó ${typeof valor}`);
    }

    return;
  }

  if (tipo.flags & ts.TypeFlags.Boolean) {
    comprobadas += 1;

    if (typeof valor !== "boolean") {
      problemas.push(`${etiqueta}: el tipo declara boolean y la API mandó ${typeof valor}`);
    }

    return;
  }

  // Los arrays.
  if (checker.isArrayType(tipo)) {
    comprobadas += 1;

    if (!Array.isArray(valor)) {
      problemas.push(`${etiqueta}: el tipo declara un array y la API mandó ${typeof valor}`);

      return;
    }

    const elemento = checker.getTypeArguments(tipo)[0];

    valor.forEach((item, indice) => {
      verificar(`${etiqueta}[${indice}]`, item, elemento, problemas);
    });

    return;
  }

  // Una tupla: cada elemento con su propio tipo.
  if (checker.isTupleType(tipo)) {
    comprobadas += 1;

    if (!Array.isArray(valor)) {
      problemas.push(`${etiqueta}: el tipo declara una tupla y la API mandó ${typeof valor}`);

      return;
    }

    const argumentos = checker.getTypeArguments(tipo);

    valor.forEach((item, indice) => {
      if (indice < argumentos.length) {
        verificar(`${etiqueta}[${indice}]`, item, argumentos[indice], problemas);
      }
    });

    return;
  }

  // Un tipo sin propiedades y sin índice no se puede comprobar: es `unknown`,
  // `any` o un tipo que no dice nada de su forma.
  const propiedades = propiedadesDe(tipo);
  const indice = checker.getIndexTypeOfType(tipo);

  if (propiedades.length === 0 && indice === undefined) {
    return;
  }

  // Un objeto.
  comprobadas += 1;

  if (typeof valor !== "object" || Array.isArray(valor)) {
    problemas.push(`${etiqueta}: el tipo declara un objeto y la API mandó ${typeof valor}`);

    return;
  }

  for (const clave of Object.keys(valor)) {
    const declarada = propiedades.find((propiedad) => propiedad.nombre === clave);

    if (declarada !== undefined) {
      verificar(`${etiqueta}.${clave}`, valor[clave], declarada.tipo, problemas);
      continue;
    }

    if (indice !== undefined) {
      verificar(`${etiqueta}.${clave}`, valor[clave], indice, problemas);
      continue;
    }

    problemas.push(`${etiqueta}.${clave}: la API lo manda y el tipo no lo declara`);
  }

  for (const propiedad of propiedades) {
    if (!propiedad.opcional && !(propiedad.nombre in valor)) {
      problemas.push(`${etiqueta}.${propiedad.nombre}: el tipo lo declara y la API no lo manda`);
    }
  }
}

/** Pide a la API los datos reales que hay que comparar. */
async function datosReales() {
  const [salud, eventos, lugares, usuarios, tickets, transacciones] = await Promise.all([
    pedir("/api/health"),
    pedir("/api/eventos?limit=1&estado=publicado"),
    pedir("/api/lugares?limit=1"),
    pedir("/api/usuarios?limit=1"),
    pedir("/api/tickets?limit=1"),
    pedir("/api/transacciones?limit=1"),
  ]);

  const evento = eventos.items?.[0];

  if (evento === undefined) {
    throw new Error("La API no devolvió ningún evento: no hay nada que verificar");
  }

  const [detalle, promociones, dashboard, asistentes, cierre, ranking] = await Promise.all([
    pedir(`/api/eventos/${evento._id}`),
    pedir(`/api/eventos/${evento._id}/promociones`),
    pedir(`/api/reportes/eventos/${evento._id}/dashboard`),
    pedir(`/api/reportes/asistentes/${evento._id}?limit=2`),
    pedir("/api/reportes/cierre-contable?desde=2023-06-01&hasta=2023-07-01"),
    pedir("/api/reportes/mas-vendidos?limite=2"),
  ]);

  return {
    salud,
    eventos,
    evento: detalle,
    lugares,
    promociones,
    dashboard,
    asistentes,
    cierre,
    ranking,
    usuarios,
    tickets,
    transacciones,
  };
}

let datos;

try {
  datos = await datosReales();
} catch (error) {
  console.error(`\n[eventix] No se pudo hablar con la API: ${error.message}`);
  console.error(
    `[eventix] ¿Está la API arriba en ${BASE}? (pnpm dev, o docker compose -f docker-compose.entrega.yml up)`,
  );
  process.exit(1);
}

try {
  const problemas = [];

  for (const verificacion of VERIFICACIONES) {
    const valor = verificacion.valor(datos);

    if (valor === undefined) {
      problemas.push(`${verificacion.etiqueta}: la respuesta no trae esa parte`);
      continue;
    }

    // Una respuesta que es un array se compara elemento por elemento.
    if (verificacion.array === true) {
      if (!Array.isArray(valor)) {
        problemas.push(`${verificacion.etiqueta}: el tipo declara un array y la API mandó ${typeof valor}`);
        continue;
      }

      const tipoElemento = tipoDe(verificacion.tipo);

      valor.forEach((item, indice) => {
        verificar(`${verificacion.etiqueta}[${indice}]`, item, tipoElemento, problemas);
      });

      continue;
    }

    verificar(verificacion.etiqueta, valor, tipoDe(verificacion.tipo), problemas);
  }

  if (problemas.length > 0) {
    console.error(`\n[eventix] El contrato NO cuadra (${problemas.length} problema(s)):`);

    for (const problema of problemas) {
      console.error(`  - ${problema}`);
    }

    console.error(
      "\n[eventix] Si la API cambió, actualiza los tipos de apps/web/src/api/tipos.ts; si no cambió, el problema es de la API.",
    );
    process.exit(1);
  }

  console.log(
    `[eventix] El contrato cuadra: ${VERIFICACIONES.length} estructuras, ${comprobadas} propiedades comprobadas contra la API real.`,
  );
  process.exit(0);
} catch (error) {
  console.error(`\n[eventix] El verificador falló: ${error.message}`);
  process.exit(1);
}
