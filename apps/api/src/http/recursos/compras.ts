import { Router, type Request } from "express";
import type { MongoClient } from "mongodb";
import { ErrorHttp } from "../errores.js";
import { leerObjeto } from "./comun.js";
import { entradaCompraSchema } from "../../domain/schemas/index.js";
import { validar } from "../../domain/validar.js";
import { crearServicioCompra } from "../../services/compra.js";
import type { Repositorios } from "../../db/repos/index.js";

/**
 * Recurso `compras` (spec S9): la compra de un ticket por HTTP.
 *
 * El servicio de compra (Hito 6) ya existía; aquí solo se expone. El
 * servicio se crea **una vez** al montar el router: la compra abre una
 * sesión de MongoDB por petición (es una transacción multi-documento) y el
 * servicio es el que sabe usarla.
 *
 * El contrato de la respuesta:
 * - **201** con `Location` a `/api/tickets/{id}` cuando la compra es nueva;
 * - **200** sin `Location` cuando la clave de idempotencia ya existía: no se
 *   cobra dos veces ni se vuelve a emitir el rastro de auditoría.
 */
export function crearRouterCompras(repos: Repositorios, cliente: MongoClient): Router {
  const router = Router();
  const compras = crearServicioCompra(cliente, repos);

  router.post("/", async (req, res) => {
    const cuerpo = leerObjeto(req.body);

    verificarReferencia(req, cuerpo);

    const entrada = validar(entradaCompraSchema, cuerpo, "compra");

    const resultado = await compras.comprar(entrada);

    if (resultado.idempotente) {
      res.status(200).json(resultado);

      return;
    }

    res.status(201).location(`/api/tickets/${resultado.ticket._id}`).json(resultado);
  });

  return router;
}

/**
 * La clave de idempotencia de la compra.
 *
 * La fuente de verdad es el par (`pasarela`, `referencia_pasarela`) del
 * cuerpo: así lo modela el dominio (`referencia_pasarela` *es* la clave) y
 * así lo protege el índice único de `transacciones`.
 *
 * La cabecera `Idempotency-Key` es **opcional** y no suplanta al cuerpo: si
 * viene, tiene que coincidir con la referencia del cuerpo. Una cabecera que
 * afirma una clave que el cuerpo no lleva es una petición incoherente, y se
 * rechaza con 400 (no es un conflicto de estado).
 */
function verificarReferencia(req: Request, cuerpo: Record<string, unknown>): void {
  const cabecera = req.get("Idempotency-Key")?.trim();

  if (!cabecera) {
    return;
  }

  const delCuerpo = cuerpo.referencia_pasarela;

  if (delCuerpo === undefined) {
    throw ErrorHttp.peticionInvalida(
      "La cabecera 'Idempotency-Key' exige que el cuerpo traiga 'referencia_pasarela'",
    );
  }

  if (typeof delCuerpo !== "string" || delCuerpo.trim() !== cabecera) {
    throw ErrorHttp.peticionInvalida(
      "La cabecera 'Idempotency-Key' no coincide con 'referencia_pasarela' del cuerpo",
    );
  }
}
