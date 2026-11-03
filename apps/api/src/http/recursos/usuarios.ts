import { Router, type Request } from "express";
import type { Document, Filter } from "mongodb";
import { normalizeEmail } from "../../domain/normalization.js";
import { TIPO_USUARIO, prepararUsuario, usuarioSchema } from "../../domain/schemas/index.js";
import type { Repositorios } from "../../db/repos/index.js";
import { ErrorHttp } from "../errores.js";
import { crearRouterCrud } from "./crud.js";
import { leerEnum, leerId, leerPaginacionDe, pagina } from "./comun.js";

/**
 * Recurso de `usuarios` (documento 04 §3.1).
 *
 * El correo normalizado es derivado: si el cliente cambia el correo, la API
 * vuelve a derivarlo, porque es el índice unique que sostiene la búsqueda por
 * correo.
 */
export function crearRouterUsuarios(repos: Repositorios): Router {
  const router = Router();

  router.get("/:id/tickets", async (req, res) => {
    const usuarioId = leerId(req.params.id);
    const usuario = await repos.usuarios.obtenerPorId(usuarioId);

    if (!usuario) {
      throw ErrorHttp.noEncontrado("No existe el usuario");
    }

    const resultado = await repos.tickets.misTickets(usuarioId, leerPaginacionDe(req));

    res.status(200).json(pagina(resultado));
  });

  router.use(
    crearRouterCrud({
      repositorio: repos.usuarios,
      esquema: usuarioSchema,
      preparar: prepararUsuario,
      camposEditables: [
        "email",
        "nombre",
        "telefono",
        "documento_identidad",
        "tipo_usuario",
        "fecha_nacimiento",
        "preferencias",
      ],
      nombre: "usuario",
      ruta: "/api/usuarios",
      conVersion: true,
      campoActualizacion: "actualizado_en",
      derivar: (fusionado) => ({ email_normalizado: normalizeEmail(String(fusionado.email)) }),
      filtro: filtroDeUsuarios,
      orden: { nombre: 1 },
    }),
  );

  return router;
}

/** Filtro de la lista de usuarios. */
function filtroDeUsuarios(req: Request): Filter<Document> {
  const query = req.query as unknown as Record<string, unknown>;
  const filtro: Filter<Document> = {};

  const tipo = leerEnum(query.tipo_usuario, "tipo_usuario", TIPO_USUARIO);

  if (tipo) {
    filtro.tipo_usuario = tipo;
  }

  if (typeof query.idioma === "string" && query.idioma.length > 0) {
    filtro["preferencias.idioma"] = query.idioma;
  }

  return filtro;
}
