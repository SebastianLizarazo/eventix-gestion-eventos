import { Router, type Request } from "express";
import type { Document, Filter } from "mongodb";
import { toObjectId } from "../../domain/ids.js";
import { normalizarCodigo } from "../../domain/normalization.js";
import {
  ESTADO_EVENTO,
  TIPO_EVENTO,
  eventoSchema,
  prepararEvento,
  prepararPromocion,
  prepararTipoTicket,
  promocionSchema,
  tipoTicketSchema,
} from "../../domain/schemas/index.js";
import { validar } from "../../domain/validar.js";
import type { Repositorios } from "../../db/repos/index.js";
import { promocionABson, tipoTicketABson } from "../../db/mapeo.js";
import { ErrorHttp } from "../errores.js";
import { crearRouterCrud } from "./crud.js";
import {
  camposPermitidos,
  leerEnum,
  leerFecha,
  leerId,
  leerObjeto,
  leerPaginacionDe,
  pagina,
} from "./comun.js";

/**
 * Recurso de `eventos` (documento 04 §3.3).
 *
 * El evento es la colección central: sus tipos de ticket y sus promociones van
 * embebidos, así que se editan como sub-recursos del evento y no como
 * colecciones aparte.
 *
 * Dos reglas gobiernan las escrituras:
 *
 * 1. **El sistema es dueño de sus contadores.** `metricas_evento`, el
 *    `aforo_vendido` de un tipo de ticket y el `usos_realizados` de una
 *    promoción los escribe el flujo de compra, no el cliente: la API no los
 *    expone como campos editables.
 * 2. **Una edición se valida completa.** Antes de escribir se valida el
 *    documento entero (el que queda tras la edición), no solo el fragmento
 *    que el cliente manda: las reglas del evento (fechas coherentes,
 *    promociones que apuntan a tipos de ticket del mismo evento, topes de
 *    tipos y promociones activas) se comprueban sobre el documento final.
 */

/** Campos del evento que el cliente puede editar. */
const CAMPOS_EDITABLES = [
  "slug",
  "nombre",
  "tipo_evento",
  "descripcion",
  "fecha_inicio",
  "fecha_fin",
  "estado",
  "visibilidad",
  "organizador_id",
  "lugar_id",
  "categorias",
  "configuracion_evento",
  "tags",
] as const;

/** Campos de un tipo de ticket que el cliente puede editar. */
const CAMPOS_TIPO_TICKET = ["nombre", "precio_cop", "aforo_total", "restricciones"] as const;

/** Campos de una promoción que el cliente puede editar. */
const CAMPOS_PROMOCION = [
  "codigo",
  "tipo",
  "valor",
  "aplica_a_tipo_ticket_ids",
  "vigencia_inicio",
  "vigencia_fin",
  "usos_maximos",
  "activo",
] as const;

/** Crea el router del recurso `eventos`. */
export function crearRouterEventos(repos: Repositorios): Router {
  const router = Router();

  router.get("/catalogo", async (req, res) => {
    const resultado = await repos.eventos.catalogoPublico(leerPaginacionDe(req));

    res.status(200).json(pagina(resultado));
  });

  router.get("/:id/tipos-ticket", async (req, res) => {
    const evento = await repos.eventos.obtenerPorId(leerId(req.params.id));

    if (!evento) {
      throw ErrorHttp.noEncontrado("No existe el evento");
    }

    res.status(200).json(evento.tipos_ticket);
  });

  router.post("/:id/tipos-ticket", async (req, res) => {
    const id = leerId(req.params.id);
    const evento = await repos.eventos.obtenerPorId(id);

    if (!evento) {
      throw ErrorHttp.noEncontrado("No existe el evento");
    }

    const tipo = prepararTipoTicket(leerObjeto(req.body));

    validar(eventoSchema, { ...evento, tipos_ticket: [...evento.tipos_ticket, tipo] }, "evento");

    await repos.eventos.actualizarPorId(id, { $push: { tipos_ticket: tipoTicketABson(tipo) } });

    res.status(201).location(`/api/eventos/${id}/tipos-ticket/${tipo._id}`).json(tipo);
  });

  router.patch("/:id/tipos-ticket/:tipoId", async (req, res) => {
    const id = leerId(req.params.id);
    const tipoId = leerId(req.params.tipoId, "tipoId");
    const evento = await repos.eventos.obtenerPorId(id);

    if (!evento) {
      throw ErrorHttp.noEncontrado("No existe el evento");
    }

    const tipo = evento.tipos_ticket.find((item) => item._id === tipoId);

    if (!tipo) {
      throw ErrorHttp.noEncontrado("No existe el tipo de ticket en el evento");
    }

    const editable = camposPermitidos(leerObjeto(req.body), CAMPOS_TIPO_TICKET);
    const fusionado = validar(tipoTicketSchema, { ...tipo, ...editable }, "tipo de ticket");

    if (Object.keys(editable).length === 0) {
      throw ErrorHttp.peticionInvalida("La petición no incluye ningún campo editable");
    }

    // El cliente edita **solo** sus campos. `aforo_vendido` lo lleva el
    // sistema (lo escribe el flujo de compra) y una edición no puede
    // revertir un cupo ya vendido: por eso el elemento **no se reescribe
    // entero** —se escriben los campos editables uno a uno— y así el
    // contador sobrevive a la edición.
    const bson = tipoTicketABson(fusionado);
    const cambios: Document = {};

    for (const campo of CAMPOS_TIPO_TICKET) {
      if (campo in editable) {
        cambios[`tipos_ticket.$[tipo].${campo}`] = bson[campo];
      }
    }

    // Si la edición cambia el aforo total, la escritura **exige** que el
    // aforo vendido actual (el de ahora, no el de la lectura) quepa en el
    // nuevo aforo: si no, el documento quedaría con más entradas vendidas
    // que capacidad. La condición vive en el filtro, así que es atómica: si
    // hubo una venta mientras tanto, la edición no se aplica y el cliente
    // recibe un 409 en vez de un documento corrupto.
    const filtro: Filter<Document> = {
      _id: toObjectId(id),
      tipos_ticket: {
        $elemMatch: {
          _id: toObjectId(tipoId),
          ...("aforo_total" in editable ? { aforo_vendido: { $lte: fusionado.aforo_total } } : {}),
        },
      },
    };

    const escrito = await repos.eventos.actualizarConFiltro(
      filtro,
      { $set: cambios },
      { arrayFilters: [{ "tipo._id": toObjectId(tipoId) }] },
    );

    if (!escrito) {
      throw ErrorHttp.conflicto(
        "El evento cambió mientras se editaba: reintenta con el estado actual",
      );
    }

    // La respuesta es el estado real del tipo después de la edición, con el
    // aforo vendido que lleva el sistema.
    const actualizado = await repos.eventos.obtenerPorId(id);
    const tipoActualizado = actualizado?.tipos_ticket.find((item) => item._id === tipoId);

    if (!tipoActualizado) {
      throw ErrorHttp.noEncontrado("No existe el tipo de ticket en el evento");
    }

    res.status(200).json(tipoActualizado);
  });

  router.delete("/:id/tipos-ticket/:tipoId", async (req, res) => {
    const id = leerId(req.params.id);
    const tipoId = leerId(req.params.tipoId, "tipoId");
    const evento = await repos.eventos.obtenerPorId(id);

    if (!evento) {
      throw ErrorHttp.noEncontrado("No existe el evento");
    }

    const tipo = evento.tipos_ticket.find((item) => item._id === tipoId);

    if (!tipo) {
      throw ErrorHttp.noEncontrado("No existe el tipo de ticket en el evento");
    }

    const referenciado = evento.promociones.some((promocion) =>
      promocion.aplica_a_tipo_ticket_ids.includes(tipoId),
    );

    if (referenciado) {
      throw ErrorHttp.conflicto(
        "El tipo de ticket tiene promociones que lo aplican: quítalas primero",
      );
    }

    await repos.eventos.actualizarPorId(id, {
      $pull: { tipos_ticket: { _id: toObjectId(tipoId) } },
    });

    res.status(204).end();
  });

  router.get("/:id/promociones", async (req, res) => {
    const evento = await repos.eventos.obtenerPorId(leerId(req.params.id));

    if (!evento) {
      throw ErrorHttp.noEncontrado("No existe el evento");
    }

    res.status(200).json(evento.promociones);
  });

  router.post("/:id/promociones", async (req, res) => {
    const id = leerId(req.params.id);
    const evento = await repos.eventos.obtenerPorId(id);

    if (!evento) {
      throw ErrorHttp.noEncontrado("No existe el evento");
    }

    const promocion = prepararPromocion(leerObjeto(req.body));

    validar(eventoSchema, { ...evento, promociones: [...evento.promociones, promocion] }, "evento");

    await repos.eventos.actualizarPorId(id, { $push: { promociones: promocionABson(promocion) } });

    res.status(201).location(`/api/eventos/${id}/promociones/${promocion.codigo}`).json(promocion);
  });

  router.patch("/:id/promociones/:codigo", async (req, res) => {
    const id = leerId(req.params.id);
    const codigo = normalizarCodigo(String(req.params.codigo));
    const evento = await repos.eventos.obtenerPorId(id);

    if (!evento) {
      throw ErrorHttp.noEncontrado("No existe el evento");
    }

    const promocion = evento.promociones.find((item) => item.codigo === codigo);

    if (!promocion) {
      throw ErrorHttp.noEncontrado("No existe la promoción en el evento");
    }

    const editable = camposPermitidos(leerObjeto(req.body), CAMPOS_PROMOCION);
    const fusionado = validar(promocionSchema, { ...promocion, ...editable }, "promoción");

    if (Object.keys(editable).length === 0) {
      throw ErrorHttp.peticionInvalida("La petición no incluye ningún campo editable");
    }

    validar(
      eventoSchema,
      {
        ...evento,
        promociones: evento.promociones.map((item) => (item.codigo === codigo ? fusionado : item)),
      },
      "evento",
    );

    // Igual que en el tipo de ticket: el cliente escribe **solo** sus campos.
    // `usos_realizados` lo lleva el sistema (lo cuenta el flujo de compra) y
    // una edición no puede reescribirlo con el valor de la lectura.
    const bson = promocionABson(fusionado);
    const cambios: Document = {};

    for (const campo of CAMPOS_PROMOCION) {
      if (campo in editable) {
        cambios[`promociones.$[promo].${campo}`] = bson[campo];
      }
    }

    // Si la edición cambia el tope de usos, la escritura exige que los usos
    // realizados **de ahora** quepan en el tope nuevo: si no, el documento
    // quedaría con más usos que los permitidos y el dominio no lo aceptaría.
    const filtro: Filter<Document> = {
      _id: toObjectId(id),
      promociones: {
        $elemMatch: {
          codigo,
          ...("usos_maximos" in editable && fusionado.usos_maximos !== undefined
            ? { usos_realizados: { $lte: fusionado.usos_maximos } }
            : {}),
        },
      },
    };

    const escrito = await repos.eventos.actualizarConFiltro(
      filtro,
      { $set: cambios },
      { arrayFilters: [{ "promo.codigo": codigo }] },
    );

    if (!escrito) {
      throw ErrorHttp.conflicto(
        "El evento cambió mientras se editaba: reintenta con el estado actual",
      );
    }

    const actualizado = await repos.eventos.obtenerPorId(id);
    const promocionActualizada = actualizado?.promociones.find(
      (item) => item.codigo === fusionado.codigo,
    );

    if (!promocionActualizada) {
      throw ErrorHttp.noEncontrado("No existe la promoción en el evento");
    }

    res.status(200).json(promocionActualizada);
  });

  router.delete("/:id/promociones/:codigo", async (req, res) => {
    const id = leerId(req.params.id);
    const codigo = normalizarCodigo(String(req.params.codigo));
    const evento = await repos.eventos.obtenerPorId(id);

    if (!evento) {
      throw ErrorHttp.noEncontrado("No existe el evento");
    }

    const existe = evento.promociones.some((item) => item.codigo === codigo);

    if (!existe) {
      throw ErrorHttp.noEncontrado("No existe la promoción en el evento");
    }

    await repos.eventos.actualizarPorId(id, { $pull: { promociones: { codigo } } });

    res.status(204).end();
  });

  router.use(
    crearRouterCrud({
      repositorio: repos.eventos,
      esquema: eventoSchema,
      preparar: prepararEvento,
      camposEditables: CAMPOS_EDITABLES,
      camposConId: ["organizador_id", "lugar_id"],
      nombre: "evento",
      ruta: "/api/eventos",
      conVersion: true,
      campoActualizacion: "actualizado_en",
      filtro: filtroDeEventos,
      orden: { fecha_inicio: 1 },
    }),
  );

  return router;
}

/** Filtro de la lista de eventos, con los parámetros de la query. */
function filtroDeEventos(req: Request): Filter<Document> {
  const query = (req.query ?? {}) as Record<string, unknown>;
  const filtro: Filter<Document> = {};

  const tipo = leerEnum(query.tipo_evento, "tipo_evento", TIPO_EVENTO);

  if (tipo) {
    filtro.tipo_evento = tipo;
  }

  const estado = leerEnum(query.estado, "estado", ESTADO_EVENTO);

  if (estado) {
    filtro.estado = estado;
  }

  const categoria = query.categoria;

  if (typeof categoria === "string" && categoria.length > 0) {
    filtro.categorias = categoria;
  }

  const categorias = query.categorias;

  if (typeof categorias === "string" && categorias.length > 0) {
    filtro.categorias = {
      $in: categorias
        .split(",")
        .map((valor) => valor.trim())
        .filter((valor) => valor.length > 0),
    };
  }

  if (query.lugar_id !== undefined) {
    filtro.lugar_id = toObjectId(leerId(query.lugar_id, "lugar_id"));
  }

  if (query.organizador_id !== undefined) {
    filtro.organizador_id = toObjectId(leerId(query.organizador_id, "organizador_id"));
  }

  if (query.desde !== undefined) {
    filtro.fecha_inicio = { $gte: leerFecha(query.desde, "desde") };
  }

  if (typeof query.q === "string" && query.q.length > 0) {
    filtro.$text = { $search: query.q };
  }

  return filtro;
}
