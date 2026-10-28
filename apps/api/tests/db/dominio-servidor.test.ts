import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Collection, type Db } from "mongodb";
import { z } from "zod";
import { config } from "../../src/config.js";
import { aplicarValidadores } from "../../src/db/setup.js";
import { VALIDADORES } from "../../src/db/validators.js";
import {
  auditoriaSchema,
  eventoSchema,
  lugarSchema,
  ticketSchema,
  transaccionSchema,
  usuarioSchema,
} from "../../src/domain/schemas/index.js";
import { DOCUMENTOS_EJEMPLO } from "../domain/documentos-ejemplo.js";

/**
 * Contraste entre las reglas del dominio (Zod) y las del servidor
 * (`$jsonSchema`), tarea T2.3. Automatiza el criterio de S4: "ninguna regla
 * de negocio queda solo en el schema JSON del server".
 *
 * Dos direcciones:
 *
 * 1. **Estática** — el `required`, los catálogos y los límites que declara el
 *    servidor se derivan del esquema del dominio: si divergen, el servidor
 *    queda más estricto (o más flojo) que el dominio.
 * 2. **Comportamental** — los seis documentos de ejemplo del documento 04 §3,
 *    validados por el dominio, los acepta el servidor.
 */

const DB_PRUEBA = `${config.MONGODB_DB}_contraste`;

let cliente: MongoClient;
let db: Db;

/** Campos que el dominio tipa como identificador y que se persisten como ObjectId. */
const CAMPOS_ID = new Set([
  "_id",
  "organizador_id",
  "lugar_id",
  "evento_id",
  "usuario_id",
  "comprado_por_usuario_id",
  "ticket_id",
  "transaccion_id",
  "sujeto_id",
  "actor_id",
  "tipo_ticket_id",
]);

/** Convierte un documento del dominio a su forma persistida (BSON). */
function aBson(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(aBson);
  }

  if (valor === null || typeof valor !== "object" || valor instanceof Date) {
    return valor;
  }

  const salida: Record<string, unknown> = {};

  for (const [clave, contenido] of Object.entries(valor as Record<string, unknown>)) {
    if (typeof contenido === "string" && CAMPOS_ID.has(clave)) {
      salida[clave] = new ObjectId(contenido);
    } else if (clave === "aplica_a_tipo_ticket_ids" && Array.isArray(contenido)) {
      salida[clave] = contenido.map((id) => new ObjectId(id as string));
    } else {
      salida[clave] = aBson(contenido);
    }
  }

  return salida;
}

type Forma = Record<string, z.ZodTypeAny>;

function desenrollar(tipo: z.ZodTypeAny): z.ZodTypeAny {
  let actual = tipo;

  for (;;) {
    if (actual instanceof z.ZodEffects) {
      actual = actual.innerType();
      continue;
    }
    if (actual instanceof z.ZodDefault) {
      actual = actual.removeDefault();
      continue;
    }
    if (actual instanceof z.ZodOptional) {
      actual = actual.unwrap();
      continue;
    }
    if (actual instanceof z.ZodNullable) {
      actual = actual.unwrap();
      continue;
    }
    return actual;
  }
}

/** El dominio exige el campo cuando no tiene valor por defecto ni es opcional. */
function esObligatorio(tipo: z.ZodTypeAny): boolean {
  if (tipo instanceof z.ZodDefault || tipo instanceof z.ZodOptional) {
    return false;
  }
  return true;
}

function valoresEnum(tipo: z.ZodTypeAny): string[] {
  const enumerado = tipo as unknown as { options?: string[]; _def?: { values?: string[] } };
  return enumerado.options ?? enumerado._def?.values ?? [];
}

function limites(tipo: z.ZodTypeAny): { min?: number; max?: number } {
  const resultado: { min?: number; max?: number } = {};
  const checks =
    (
      tipo as unknown as {
        _def?: { checks?: { kind: string; value?: number; inclusive?: boolean }[] };
      }
    )._def?.checks ?? [];

  for (const check of checks) {
    if (check.value === undefined) {
      continue;
    }
    if (check.kind === "min") {
      // `.positive()` es un mínimo exclusivo: el servidor no tiene FAM exclusive,
      // así que el piso equivalente es value + 1.
      resultado.min = check.inclusive === false ? check.value + 1 : check.value;
    }
    if (check.kind === "max") {
      resultado.max = check.value;
    }
  }

  return resultado;
}

function tipoBsonCompatible(regla: { bsonType?: unknown }, esperado: string): boolean {
  const declarado = regla.bsonType;

  if (Array.isArray(declarado)) {
    return declarado.includes(esperado);
  }

  return declarado === esperado;
}

function contrastarTipo(
  ruta: string,
  tipo: z.ZodTypeAny,
  regla: {
    bsonType?: unknown;
    enum?: unknown;
    minimum?: unknown;
    maximum?: unknown;
    minLength?: unknown;
    maxLength?: unknown;
    minItems?: unknown;
    maxItems?: unknown;
    items?: unknown;
    properties?: unknown;
    required?: unknown;
  },
  problemas: string[],
): void {
  const real = desenrollar(tipo);

  if (real instanceof z.ZodEnum) {
    const esperado = valoresEnum(real);
    const obtenido = (regla.enum ?? []) as string[];

    if (JSON.stringify(esperado) !== JSON.stringify(obtenido)) {
      problemas.push(
        `${ruta}: enum servidor=${JSON.stringify(obtenido)} dominio=${JSON.stringify(esperado)}`,
      );
    }
    return;
  }

  if (real instanceof z.ZodLiteral) {
    const esperado = [String((real as unknown as { value: unknown }).value)];
    const obtenido = (regla.enum ?? []) as string[];

    if (JSON.stringify(esperado) !== JSON.stringify(obtenido)) {
      problemas.push(
        `${ruta}: enum servidor=${JSON.stringify(obtenido)} dominio=${JSON.stringify(esperado)}`,
      );
    }
    return;
  }

  if (real instanceof z.ZodNumber) {
    if (!tipoBsonCompatible(regla, "number")) {
      problemas.push(`${ruta}: bsonType=${JSON.stringify(regla.bsonType)} se esperaba number`);
    }

    const { min, max } = limites(real);
    if (min !== undefined && regla.minimum !== min) {
      problemas.push(`${ruta}: minimum servidor=${String(regla.minimum)} dominio=${min}`);
    }
    if (max !== undefined && regla.maximum !== max) {
      problemas.push(`${ruta}: maximum servidor=${String(regla.maximum)} dominio=${max}`);
    }
    return;
  }

  if (real instanceof z.ZodString) {
    if (!tipoBsonCompatible(regla, "string")) {
      problemas.push(`${ruta}: bsonType=${JSON.stringify(regla.bsonType)} se esperaba string`);
    }

    const { min, max } = limites(real);
    if (min !== undefined && regla.minLength !== min) {
      problemas.push(`${ruta}: minLength servidor=${String(regla.minLength)} dominio=${min}`);
    }
    if (max !== undefined && regla.maxLength !== max) {
      problemas.push(`${ruta}: maxLength servidor=${String(regla.maxLength)} dominio=${max}`);
    }
    return;
  }

  if (real instanceof z.ZodDate) {
    if (!tipoBsonCompatible(regla, "date")) {
      problemas.push(`${ruta}: bsonType=${JSON.stringify(regla.bsonType)} se esperaba date`);
    }
    return;
  }

  if (real instanceof z.ZodBoolean) {
    if (!tipoBsonCompatible(regla, "bool")) {
      problemas.push(`${ruta}: bsonType=${JSON.stringify(regla.bsonType)} se esperaba bool`);
    }
    return;
  }

  if (real instanceof z.ZodArray) {
    if (!tipoBsonCompatible(regla, "array")) {
      problemas.push(`${ruta}: bsonType=${JSON.stringify(regla.bsonType)} se esperaba array`);
    }

    const { min, max } = limites(real);
    if (min !== undefined && regla.minItems !== min) {
      problemas.push(`${ruta}: minItems servidor=${String(regla.minItems)} dominio=${min}`);
    }
    if (max !== undefined && regla.maxItems !== max) {
      problemas.push(`${ruta}: maxItems servidor=${String(regla.maxItems)} dominio=${max}`);
    }

    if (regla.items !== undefined && !Array.isArray(regla.items)) {
      const elemento = (real as unknown as { _def: { type: z.ZodTypeAny } })._def.type;
      contrastarTipo(`${ruta}[]`, elemento, regla.items as never, problemas);
    }
    return;
  }

  if (real instanceof z.ZodTuple) {
    if (!tipoBsonCompatible(regla, "array")) {
      problemas.push(`${ruta}: bsonType=${JSON.stringify(regla.bsonType)} se esperaba array`);
    }

    const elementos = (real as unknown as { _def: { items: z.ZodTypeAny[] } })._def.items;

    if (!Array.isArray(regla.items)) {
      problemas.push(`${ruta}: el servidor no declara los items en forma de tupla`);
    } else if (regla.items.length !== elementos.length) {
      problemas.push(`${ruta}: items servidor=${regla.items.length} dominio=${elementos.length}`);
    }
    return;
  }

  if (real instanceof z.ZodObject) {
    if (!tipoBsonCompatible(regla, "object")) {
      problemas.push(`${ruta}: bsonType=${JSON.stringify(regla.bsonType)} se esperaba object`);
    }

    contrastarForma(ruta, real.shape, regla, problemas);
    return;
  }

  if (real instanceof z.ZodRecord) {
    if (!tipoBsonCompatible(regla, "object")) {
      problemas.push(`${ruta}: bsonType=${JSON.stringify(regla.bsonType)} se esperaba object`);
    }
    return;
  }

  if (real instanceof z.ZodUnion) {
    // La unión del dominio (hexadecimal u ObjectId) se persiste como ObjectId.
    if (!tipoBsonCompatible(regla, "objectId")) {
      problemas.push(`${ruta}: bsonType=${JSON.stringify(regla.bsonType)} se esperaba objectId`);
    }
    return;
  }
}

function contrastarForma(ruta: string, forma: Forma, regla: never, problemas: string[]): void {
  const servidor = regla as unknown as {
    required?: string[];
    properties?: Record<string, never>;
  };

  const requeridosDominio = Object.entries(forma)
    .filter(([, tipo]) => esObligatorio(tipo))
    .map(([campo]) => campo)
    .sort();
  const requeridosServidor = [...(servidor.required ?? [])].sort();

  if (JSON.stringify(requeridosDominio) !== JSON.stringify(requeridosServidor)) {
    problemas.push(
      `${ruta}: required servidor=${JSON.stringify(requeridosServidor)} dominio=${JSON.stringify(requeridosDominio)}`,
    );
  }

  for (const [campo, tipo] of Object.entries(forma)) {
    const reglaCampo = (servidor.properties ?? {})[campo];

    if (reglaCampo === undefined) {
      continue;
    }

    contrastarTipo(`${ruta}.${campo}`, tipo, reglaCampo as never, problemas);
  }
}

beforeAll(async () => {
  cliente = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });
  await cliente.connect();
  db = cliente.db(DB_PRUEBA);
  await db.dropDatabase();
  await aplicarValidadores(db);
});

afterAll(async () => {
  await db.dropDatabase();
  await cliente.close();
});

describe("T2.3 · contraste entre el dominio y el servidor", () => {
  it("las reglas del servidor son las del dominio (required, catálogos y límites)", () => {
    const esquemas = {
      usuarios: usuarioSchema,
      lugares: lugarSchema,
      eventos: eventoSchema,
      tickets: ticketSchema,
      transacciones: transaccionSchema,
      auditoria_eventos: auditoriaSchema,
    };

    const problemas: string[] = [];

    for (const [coleccion, esquema] of Object.entries(esquemas)) {
      const regla = VALIDADORES[coleccion]?.$jsonSchema;

      if (!regla) {
        problemas.push(`${coleccion}: no hay validator declarado`);
        continue;
      }

      const forma = (desenrollar(esquema) as unknown as { shape: Forma }).shape;
      contrastarForma(coleccion, forma, regla as never, problemas);
    }

    expect(problemas).toEqual([]);
  });

  it("el servidor acepta los seis documentos de ejemplo del documento 04 §3", async () => {
    const documentos = {
      usuarios: usuarioSchema.parse(DOCUMENTOS_EJEMPLO.usuarios),
      lugares: lugarSchema.parse(DOCUMENTOS_EJEMPLO.lugares),
      eventos: eventoSchema.parse(DOCUMENTOS_EJEMPLO.eventos),
      tickets: ticketSchema.parse(DOCUMENTOS_EJEMPLO.tickets),
      transacciones: transaccionSchema.parse(DOCUMENTOS_EJEMPLO.transacciones),
      auditoria_eventos: auditoriaSchema.parse(DOCUMENTOS_EJEMPLO.auditoria_eventos),
    };

    for (const [coleccion, documento] of Object.entries(documentos)) {
      const coleccionMongo = db.collection(coleccion) as Collection;

      try {
        const insertado = await coleccionMongo.insertOne(aBson(documento) as never);
        expect(insertado.acknowledged, `insertar en ${coleccion}`).toBe(true);
      } catch (error) {
        const detalles = (error as { errInfo?: { details?: unknown } }).errInfo?.details;
        throw new Error(`el servidor rechazó ${coleccion}: ${JSON.stringify(detalles ?? error)}`);
      }

      await coleccionMongo.deleteMany({});
    }
  });
});
