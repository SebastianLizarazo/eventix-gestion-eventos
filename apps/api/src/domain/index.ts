/**
 * Capa de dominio: reglas de negocio, esquemas de validación y mappers.
 *
 * No depende de Express ni del driver de MongoDB más allá del tipo `ObjectId`
 * que usan los mappers de identificadores.
 */
export * from "./errors.js";
export * from "./error-map.js";
export * from "./ids.js";
export * from "./normalization.js";
export * from "./validar.js";
export * from "./schemas/index.js";
