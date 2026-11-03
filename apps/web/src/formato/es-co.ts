/**
 * Formateadores de la interfaz: fechas, horas, números y moneda.
 *
 * La interfaz está en español (spec S7) y el dominio es colombiano, así que
 * todo se formatea con el locale `es-CO`: `15/03/2026`, `COP 120.000`.
 *
 * **Las fechas se formatean en UTC a propósito.** La API guarda y devuelve las
 * fechas en UTC (una fecha sin zona se interpreta como UTC, no como la hora
 * local del servidor), así que formatear en otra zona movería los eventos de
 * día: un evento del 15 de marzo a las 00:00 se vería el 14 de marzo. Fijar la
 * zona hace, además, que la interfaz muestre exactamente la fecha que se
 * escribió y que las pruebas no dependan de la máquina donde corren.
 */

/** Zona horaria de presentación: la misma en la que la API guarda los datos. */
const ZONA = "UTC";

/** Texto que se muestra cuando no hay un valor que formatear. */
const SIN_VALOR = "—";

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: ZONA,
});

const formatoHora = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: ZONA,
});

const formatoNumero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/**
 * Convierte el valor recibido en una `Date` válida, o `null` si no lo es.
 *
 * La API devuelve las fechas como texto ISO 8601; los constructores de la
 * interfaz trabajan con `Date`. Un valor que no se puede interpretar no es un
 * error: es un dato ausente, y se muestra como tal.
 */
function aFecha(valor: string | Date | null | undefined): Date | null {
  if (valor === null || valor === undefined) {
    return null;
  }

  const fecha = valor instanceof Date ? valor : new Date(valor);

  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Fecha en formato `dd/mm/aaaa`. */
export function formatearFecha(valor: string | Date | null | undefined): string {
  const fecha = aFecha(valor);

  return fecha === null ? SIN_VALOR : formatoFecha.format(fecha);
}

/**
 * Fecha y hora en formato `dd/mm/aaaa hh:mm`.
 *
 * La fecha y la hora se formatean por separado y se unen con un espacio: si se
 * formatearan juntas, el separador sería el que traiga la versión de ICU de
 * cada máquina (`15/03/2026, 14:30` en unas, `15/03/2026 14:30` en otras) y la
 * interfaz se vería distinta según dónde corra.
 */
export function formatearFechaHora(valor: string | Date | null | undefined): string {
  const fecha = aFecha(valor);

  if (fecha === null) {
    return SIN_VALOR;
  }

  return `${formatoFecha.format(fecha)} ${formatoHora.format(fecha)}`;
}

/** Número con separador de miles: `120.000`. */
export function formatearNumero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) {
    return SIN_VALOR;
  }

  return formatoNumero.format(valor);
}

/** Importe en pesos colombianos: `COP 120.000`. */
export function formatearMoneda(valor: number | null | undefined): string {
  const numero = formatearNumero(valor);

  return numero === SIN_VALOR ? SIN_VALOR : `COP ${numero}`;
}

/** Porcentaje con su unidad: `45 %`. */
export function formatearPorcentaje(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) {
    return SIN_VALOR;
  }

  return `${formatoNumero.format(valor)} %`;
}

/**
 * Forma del valor de un `<input type="datetime-local">`: `aaaa-mm-ddThh:mm`.
 *
 * El campo del navegador **no lleva zona**: son fecha y hora de calendario, sin
 * instante. Por eso el patrón acepta los segundos como opcionales.
 */
const PATRON_CAMPO_HORA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Convierte el valor de un campo de fecha y hora en un instante ISO UTC.
 *
 * La conversión es **manual y determinista** (igual que el parseo de fechas del
 * lado de la API): `new Date("2026-03-15T14:30")` se interpretaría en la zona
 * horaria **local** de quien tiene el navegador abierto, así que el mismo
 * formulario produciría instantes distintos en cada máquina. Como la interfaz
 * muestra las fechas en UTC, el campo se lee como UTC.
 *
 * Devuelve `null` cuando el valor no es un campo de fecha y hora válido: un
 * campo vacío o mal escrito no es una fecha, y la API es quien juzga si el
 * instante resultante existe.
 */
export function aIsoUtcDesdeCampo(valor: string): string | null {
  const coincidencia = PATRON_CAMPO_HORA.exec(valor.trim());

  if (!coincidencia) {
    return null;
  }

  const [, anio, mes, dia, hora, minuto, segundo = "00"] = coincidencia;
  const mesNumero = Number(mes);
  const diaNumero = Number(dia);
  const horaNumero = Number(hora);
  const minutoNumero = Number(minuto);
  const segundoNumero = Number(segundo);

  if (mesNumero < 1 || mesNumero > 12) {
    return null;
  }

  if (diaNumero < 1 || diaNumero > 31) {
    return null;
  }

  if (horaNumero > 23 || minutoNumero > 59 || segundoNumero > 59) {
    return null;
  }

  return `${anio}-${mes}-${dia}T${hora}:${minuto}:${segundo}.000Z`;
}

/**
 * Convierte un instante ISO en el valor que espera un campo de fecha y hora.
 *
 * La conversión es la inversa de `aIsoUtcDesdeCampo` y usa la misma zona (UTC),
 * de modo que el campo muestra exactamente la fecha y la hora que la interfaz
 * muestra en pantalla.
 */
export function aCampoFechaHora(valor: string | Date | null | undefined): string {
  const fecha = aFecha(valor);

  if (fecha === null) {
    return "";
  }

  const iso = fecha.toISOString();

  return `${iso.slice(0, 10)}T${iso.slice(11, 16)}`;
}
