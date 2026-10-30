/**
 * Guardian of the repository encoding.
 *
 * On Windows, PowerShell 5.1 writes files with the ANSI code page
 * (Windows-1252) and `Out-File` uses UTF-16LE: a UTF-8 file written from the
 * console ends up **double encoded** (every accented character turns into two
 * characters) and nobody notices until a comment or a string literal looks
 * broken.
 *
 * This script detects that state and points at file, line and column:
 *
 *   pnpm check:utf8          scans the repository and fails if it finds any
 *   pnpm check:utf8 -- --fix repairs the double encoded files
 *
 * The repair is the exact inverse of the corruption (read the bytes as
 * Latin-1 and encode them again as UTF-8), and it is only applied when the
 * result has no trace of the corruption left: if the result contained invalid
 * characters the file was mixed and a human has to look at it.
 *
 * NOTE: this source file is deliberately ASCII-only. It carries the mojibake
 * patterns it looks for, and a detector that flags its own source is useless.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..");

const IGNORAR_DIRECTORIOS = new Set([
  ".git",
  ".codegraph",
  ".engram",
  ".atl",
  "coverage",
  "dist",
  "node_modules",
]);

const EXTENSIONES = new Set([
  ".cjs",
  ".gitattributes",
  ".gitignore",
  ".js",
  ".json",
  ".jsonc",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

/**
 * Traces that give away double encoded text: an accented latin letter that
 * went through Latin-1 ("A-tilde + o with acute" is an accented "o",
 * "a-circumflex + euro" is a quote, "i-diaeresis + question marks" is a BOM).
 */
const RASTROS = [
  {
    nombre: "acentos latin-1",
    patron: /[\u00C2-\u00C5\u00E0-\u00E5][\u0080-\u00FF\u20AC\u2122\u2018-\u201F\u2126]/gu,
  },
  { nombre: "emoji rotos", patron: /\u00F0[\u0080-\u00FF]/gu },
  { nombre: "BOM como texto", patron: /\u00EF\u00BB\u00BF/gu },
];

const argumentos = process.argv.slice(2);
const corregir = argumentos.includes("--fix");

/** Text files that have to be scanned. */
function archivosTextuales(directorio) {
  const encontrados = [];

  for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
    if (entrada.isDirectory()) {
      if (IGNORAR_DIRECTORIOS.has(entrada.name)) continue;
      encontrados.push(...archivosTextuales(join(directorio, entrada.name)));
      continue;
    }

    if (!entrada.isFile()) continue;

    const ruta = join(directorio, entrada.name);
    const extension = extname(entrada.name);

    if (!EXTENSIONES.has(extension) && !entrada.name.startsWith(".env")) continue;
    if (statSync(ruta).size > 2_000_000) continue;

    encontrados.push(ruta);
  }

  return encontrados;
}

/** Positions (line and column) of the corruption traces. */
function hallazgos(texto) {
  const encontrados = [];

  for (const { nombre, patron } of RASTROS) {
    for (const coincidencia of texto.matchAll(patron)) {
      const antes = texto.slice(0, coincidencia.index);
      const linea = antes.split("\n").length;
      const columna = coincidencia.index - antes.lastIndexOf("\n");

      encontrados.push({ nombre, linea, columna, fragmento: coincidencia[0] });
    }
  }

  return encontrados;
}

/**
 * Reverses the corruption: the text was read as Latin-1 and UTF-8 is wanted.
 * Returns `null` when the result is not valid UTF-8 (a mixed file).
 */
function reparar(texto) {
  const invertido = Buffer.from(texto, "latin1").toString("utf8");

  if (invertido.includes("\uFFFD")) return null;

  return invertido;
}

const rutas = archivosTextuales(RAIZ).sort();
const problemas = [];

for (const ruta of rutas) {
  const texto = readFileSync(ruta, "utf8");
  const encontrados = hallazgos(texto);

  if (encontrados.length === 0) continue;

  const relativo = relative(RAIZ, ruta);

  if (corregir) {
    const invertido = reparar(texto);

    if (invertido === null || hallazgos(invertido).length > 0) {
      problemas.push({ relativo, encontrados, reparable: false });
      continue;
    }

    writeFileSync(ruta, invertido, "utf8");
    problemas.push({ relativo, encontrados, reparable: true, reparado: true });
    continue;
  }

  problemas.push({ relativo, encontrados, reparable: true });
}

if (problemas.length === 0) {
  console.log(`[eventix] Encoding is correct in ${rutas.length} text files.`);
  process.exit(0);
}

for (const problema of problemas) {
  const estado = problema.reparado
    ? "repaired"
    : problema.reparable
      ? "double encoded"
      : "DOUBLE ENCODED AND MIXED (needs a human)";

  console.error(`\n[eventix] ${problema.relativo}: ${estado}`);

  for (const encontrado of problema.encontrados.slice(0, 5)) {
    console.error(
      `  line ${encontrado.linea}, column ${encontrado.columna}: ${encontrado.nombre} -> ${JSON.stringify(encontrado.fragmento)}`,
    );
  }

  if (problema.encontrados.length > 5) {
    console.error(`  ... and ${problema.encontrados.length - 5} more`);
  }
}

console.error(
  `\n[eventix] ${problemas.length} file(s) with badly encoded text.${corregir ? "" : " Run `pnpm check:utf8 -- --fix` to repair them."}`,
);
process.exit(1);
