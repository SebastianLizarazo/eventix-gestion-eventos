import type { Db } from "mongodb";
import { crearRepositorioAuditoria, type RepositorioAuditoria } from "./auditoria.js";
import { crearRepositorioEventos, type RepositorioEventos } from "./eventos.js";
import { crearRepositorioLugares, type RepositorioLugares } from "./lugares.js";
import { crearRepositorioTickets, type RepositorioTickets } from "./tickets.js";
import { crearRepositorioTransacciones, type RepositorioTransacciones } from "./transacciones.js";
import { crearRepositorioUsuarios, type RepositorioUsuarios } from "./usuarios.js";

/**
 * Barril de los repositorios de colección.
 *
 * Cada repositorio expone la superficie común del `base.ts` (CRUD, paginación,
 * filtros y orden) más las consultas propias del patrón de query del
 * documento 04 §4 de su colección.
 */
export * from "./base.js";
export * from "./usuarios.js";
export * from "./lugares.js";
export * from "./eventos.js";
export * from "./tickets.js";
export * from "./transacciones.js";
export * from "./auditoria.js";

/** Los seis repositorios de colección, como los usa la capa HTTP. */
export type Repositorios = {
  usuarios: RepositorioUsuarios;
  lugares: RepositorioLugares;
  eventos: RepositorioEventos;
  tickets: RepositorioTickets;
  transacciones: RepositorioTransacciones;
  auditoria: RepositorioAuditoria;
};

/**
 * Crea los seis repositorios sobre una base.
 *
 * @param db base de datos física.
 */
export function crearRepositorios(db: Db): Repositorios {
  return {
    usuarios: crearRepositorioUsuarios(db.collection("usuarios")),
    lugares: crearRepositorioLugares(db.collection("lugares")),
    eventos: crearRepositorioEventos(db.collection("eventos")),
    tickets: crearRepositorioTickets(db.collection("tickets")),
    transacciones: crearRepositorioTransacciones(db.collection("transacciones")),
    auditoria: crearRepositorioAuditoria(db.collection("auditoria_eventos")),
  };
}
