/**
 * Contexto de la petición: el identificador que correlaciona la respuesta, el
 * log y el cuerpo de error de una misma llamada.
 *
 * La ampliación de `Request` es global a propósito: el `request-id` viaja por
 * los middlewares y los manejadores como un dato de la petición, no como un
 * parámetro que cada función tiene que recibir. Es el patrón de ampliación de
 * tipos de Express (`declare global` + `namespace`): la regla de ESLint que
 * prohíbe `namespace` se desactiva solo aquí, porque no es un espacio de
 * nombres en tiempo de ejecución sino una declaración de tipos.
 */
/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      /** Identificador de la petición (propagado por el cliente o generado). */
      requestId: string;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

export {};
