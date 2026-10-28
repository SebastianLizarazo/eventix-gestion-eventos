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
