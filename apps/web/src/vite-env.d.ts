/// <reference types="vite/client" />

/**
 * Variables de entorno que la interfaz puede leer.
 *
 * Vite solo expone al bundle las variables que empiezan por `VITE_`, y lo hace
 * como texto: nunca como secreto.
 */
interface ImportMetaEnv {
  /** Base de la API. Por defecto, el mismo origen (el proxy de `/api`). */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
