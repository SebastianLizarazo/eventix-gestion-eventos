import type { Collection, Document } from "mongodb";
import { normalizeEmail } from "../../domain/normalization.js";
import { usuarioSchema, type Usuario } from "../../domain/schemas/index.js";
import { usuarioABson } from "../mapeo.js";
import { crearRepositorio, type Repositorio } from "./base.js";

/**
 * Repositorio de `usuarios` (documento 04 §3.1).
 *
 * Es la implementación de referencia de un repositorio de colección: la parte
 * común vive en `base.ts` y aquí solo están las consultas propias del
 * documento 04 §4.1.
 */
export type RepositorioUsuarios = Repositorio<Usuario> & {
  /** Busca por correo normalizado (índice `usuarios_email_normalizado_unique`). */
  porEmailNormalizado(email: string): Promise<Usuario | null>;
  /** Lista los usuarios de un tipo (índice `usuarios_tipo_usuario`). */
  porTipoUsuario(tipo: Usuario["tipo_usuario"][number]): Promise<Usuario[]>;
};

/**
 * Crea el repositorio de `usuarios`.
 *
 * @param coleccion colección física `usuarios`.
 */
export function crearRepositorioUsuarios(coleccion: Collection<Document>): RepositorioUsuarios {
  const base = crearRepositorio<Usuario>({
    coleccion,
    esquema: usuarioSchema,
    aBson: usuarioABson,
  });

  return {
    ...base,

    async porEmailNormalizado(email) {
      return base.obtenerUno({ email_normalizado: normalizeEmail(email) });
    },

    async porTipoUsuario(tipo) {
      const { items } = await base.listar({ tipo_usuario: tipo });

      return items;
    },
  };
}
