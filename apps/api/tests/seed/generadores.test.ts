import { describe, expect, it } from "vitest";
import { crearPlan } from "../../src/seed/plan.js";
import { generarEventos, generarLugares, generarUsuarios } from "../../src/seed/generadores.js";
import { ESCALAS, SEMILLA_POR_DEFECTO } from "../../src/seed/volumenes.js";
import { eventoSchema, lugarSchema, usuarioSchema } from "../../src/domain/schemas/index.js";
import { normalizeEmail } from "../../src/domain/normalization.js";

/**
 * Generador determinista del seed (tarea T5.1): `lugares`, `usuarios` y
 * `eventos` con sus embebidos.
 *
 * El contrato del generador es que **dos corridas con la misma semilla producen
 * el mismo dataset** y que **todo documento que produce es válido contra el
 * dominio**: el seed no puede escribir en la base algo que la API no aceptaría.
 */

const ESCALA_DEV = ESCALAS.dev;

describe("T5.1 · generador determinista", () => {
  it("genera los documentos que declara la escala", () => {
    const plan = crearPlan({ semilla: SEMILLA_POR_DEFECTO, volumenes: ESCALA_DEV });

    expect(generarLugares(plan)).toHaveLength(ESCALA_DEV.lugares);
    expect(generarUsuarios(plan)).toHaveLength(ESCALA_DEV.usuarios);
    expect(generarEventos(plan)).toHaveLength(ESCALA_DEV.eventos);
  });

  it("es determinista: dos corridas con la misma semilla producen los mismos documentos", () => {
    const primerPlan = crearPlan({ semilla: SEMILLA_POR_DEFECTO, volumenes: ESCALA_DEV });
    const segundoPlan = crearPlan({ semilla: SEMILLA_POR_DEFECTO, volumenes: ESCALA_DEV });

    expect(generarLugares(segundoPlan)).toEqual(generarLugares(primerPlan));
    expect(generarUsuarios(segundoPlan)).toEqual(generarUsuarios(primerPlan));
    expect(generarEventos(segundoPlan)).toEqual(generarEventos(primerPlan));
  });

  it("semillas distintas producen documentos distintos", () => {
    const primerPlan = crearPlan({ semilla: SEMILLA_POR_DEFECTO, volumenes: ESCALA_DEV });
    const otroPlan = crearPlan({ semilla: SEMILLA_POR_DEFECTO + 1, volumenes: ESCALA_DEV });

    expect(generarUsuarios(otroPlan)).not.toEqual(generarUsuarios(primerPlan));
    expect(generarEventos(otroPlan)).not.toEqual(generarEventos(primerPlan));
  });

  it("todo documento generado valida contra el esquema del dominio", () => {
    const plan = crearPlan({ semilla: SEMILLA_POR_DEFECTO, volumenes: ESCALA_DEV });

    for (const lugar of generarLugares(plan)) {
      expect(() => lugarSchema.parse(lugar)).not.toThrow();
    }

    for (const usuario of generarUsuarios(plan)) {
      expect(() => usuarioSchema.parse(usuario)).not.toThrow();
    }

    for (const evento of generarEventos(plan)) {
      expect(() => eventoSchema.parse(evento)).not.toThrow();
    }
  });

  it("cada evento referencia un lugar y un organizador que existen", () => {
    const plan = crearPlan({ semilla: SEMILLA_POR_DEFECTO, volumenes: ESCALA_DEV });

    const idsLugar = new Set(generarLugares(plan).map((lugar) => lugar._id));
    const idsUsuario = new Set(generarUsuarios(plan).map((usuario) => usuario._id));

    for (const evento of generarEventos(plan)) {
      expect(idsLugar.has(evento.lugar_id)).toBe(true);
      expect(idsUsuario.has(evento.organizador_id)).toBe(true);
    }
  });

  it("las promociones de un evento solo apuntan a sus propios tipos de ticket", () => {
    const plan = crearPlan({ semilla: SEMILLA_POR_DEFECTO, volumenes: ESCALA_DEV });

    for (const evento of generarEventos(plan)) {
      const idsTipo = new Set(evento.tipos_ticket.map((tipo) => tipo._id));

      for (const promocion of evento.promociones) {
        for (const id of promocion.aplica_a_tipo_ticket_ids) {
          expect(idsTipo.has(id)).toBe(true);
        }
      }
    }
  });

  it("los correos son del dominio .test y su normalizado es el derivado (R-07)", () => {
    const plan = crearPlan({ semilla: SEMILLA_POR_DEFECTO, volumenes: ESCALA_DEV });

    const correos = new Set<string>();

    for (const usuario of generarUsuarios(plan)) {
      expect(usuario.email.endsWith("@eventix.test")).toBe(true);
      expect(usuario.email_normalizado).toBe(normalizeEmail(usuario.email));
      correos.add(usuario.email_normalizado);
    }

    // El índice unique de `usuarios.email_normalizado` solo se sostiene si el
    // seed no repite correos.
    expect(correos.size).toBe(ESCALA_DEV.usuarios);
  });

  it("cada evento tiene un slug único", () => {
    const plan = crearPlan({ semilla: SEMILLA_POR_DEFECTO, volumenes: ESCALA_DEV });

    const slugs = new Set(generarEventos(plan).map((evento) => evento.slug));

    expect(slugs.size).toBe(ESCALA_DEV.eventos);
  });
});
