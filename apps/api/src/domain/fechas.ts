/**
 * Parseo de fechas ISO 8601.
 *
 * Se parsea a mano (y no con `new Date(texto)`) por dos razones concretas:
 *
 * 1. `new Date` **desplaza** las fechas de calendario inexistentes: "2025-02-30"
 *    se convierte en el 2 de marzo sin avisar. Una capa de validación no puede
 *    guardar una fecha distinta de la que pidió el usuario.
 * 2. `new Date` interpreta las fechas sin zona en la zona horaria **local** del
 *    servidor, así que el mismo texto produce instantes distintos según dónde
 *    corra el proceso.
 *
 * Regla de este módulo: lo que no es ISO 8601 extendido se rechaza, y lo que no
 * trae zona se interpreta como UTC (determinista, independiente del servidor).
 */

const PATRON_ISO =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:[.,](\d+))?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** Convierte un texto ISO 8601 en `Date`, o devuelve `null` si no es válido. */
export function parsearFechaIso(texto: string): Date | null {
  const coincidencia = PATRON_ISO.exec(texto.trim());

  if (!coincidencia) {
    return null;
  }

  const [, anio, mes, dia, hora = "00", minuto = "00", segundo = "00", fraccion, zona] =
    coincidencia;

  const anioNumero = Number(anio);
  const mesNumero = Number(mes);
  const diaNumero = Number(dia);
  const horaNumero = Number(hora);
  const minutoNumero = Number(minuto);
  const segundoNumero = Number(segundo);

  if (mesNumero < 1 || mesNumero > 12) {
    return null;
  }

  if (horaNumero > 23 || minutoNumero > 59 || segundoNumero > 59) {
    return null;
  }

  // El último día del mes (0 = último día del mes anterior en la API de Date).
  const diasDelMes = new Date(Date.UTC(anioNumero, mesNumero, 0)).getUTCDate();

  if (diaNumero < 1 || diaNumero > diasDelMes) {
    return null;
  }

  const milisegundos = fraccion ? Math.floor(Number(`0.${fraccion}`) * 1000) : 0;
  const instante = Date.UTC(
    anioNumero,
    mesNumero - 1,
    diaNumero,
    horaNumero,
    minutoNumero,
    segundoNumero,
    milisegundos,
  );

  if (!zona || zona === "Z") {
    return new Date(instante);
  }

  const signo = zona.startsWith("-") ? -1 : 1;
  const digitos = zona.slice(1).replace(":", "");
  const horasZona = Number(digitos.slice(0, 2));
  const minutosZona = Number(digitos.slice(2, 4));

  if (horasZona > 23 || minutosZona > 59) {
    return null;
  }

  return new Date(instante - signo * (horasZona * 60 + minutosZona) * 60_000);
}
