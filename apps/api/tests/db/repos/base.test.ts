import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { config } from "../../../src/config.js";
import { aplicarSetup } from "../../../src/db/setup.js";
import { LIMITE_MAXIMO, crearRepositorio } from "../../../src/db/repos/base.js";
import { crearRepositorioUsuarios } from "../../../src/db/repos/usuarios.js";
import { lugarABson } from "../../../src/db/mapeo.js";
import {
  lugarSchema,
  usuarioSchema,
  type Lugar,
  type Usuario,
} from "../../../src/domain/schemas/index.js";
import { ErrorIdInvalido, ErrorValidacion } from "../../../src/domain/errors.js";
import { IDS } from "../../domain/fixtures.js";
import { DOCUMENTOS_EJEMPLO } from "../../domain/documentos-ejemplo.js";
import { validar } from "../../../src/domain/validar.js";

/**
 * Repositorio base (tarea T3.1): paginación, filtros, orden y CRUD.
 *
 * Corre contra una base propia para no tocar la base de desarrollo.
 */

const DB_PRUEBA = `${config.MONGODB_DB}_repos`;

let cliente: MongoClient;
let db: Db;

function usuarioDeEjemplo(indice: number): Usuario {
  const base = validar(usuarioSchema, DOCUMENTOS_EJEMPLO.usuarios, "usuario") as Usuario;

  return {
    ...base,
    _id: undefined,
    email: `persona${indice}@example.com`,
    email_normalizado: `persona${indice}@example.com`,
    nombre: `Persona ${indice}`,
  };
}

beforeAll(async () => {
  cliente = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });
  await cliente.connect();
  db = cliente.db(DB_PRUEBA);
  await db.dropDatabase();
  await aplicarSetup(db);
});

afterAll(async () => {
  await db.dropDatabase();
  await cliente.close();
});

beforeEach(async () => {
  await db.collection("usuarios").deleteMany({});
});

describe("T3.1 · repositorio base", () => {
  it("inserta un documento del dominio y lo devuelve con identificador hexadecimal", async () => {
    const repositorio = crearRepositorioUsuarios(db.collection("usuarios"));
    const usuario = usuarioDeEjemplo(1);

    const id = await repositorio.insertar(usuario);

    expect(id).toMatch(/^[0-9a-f]{24}$/);

    const leido = await repositorio.obtenerPorId(id);

    expect(leido).not.toBeNull();
    expect(leido?._id).toBe(id);
    expect(leido?.email).toBe("persona1@example.com");
    expect(leido?.creado_en).toBeInstanceOf(Date);
    expect(leido?.preferencias.idioma).toBe("es-CO");
  });

  it("respeta el _id que ya trae el documento del dominio", async () => {
    const repositorio = crearRepositorioUsuarios(db.collection("usuarios"));
    const usuario = { ...usuarioDeEjemplo(1), _id: IDS.usuario };

    const id = await repositorio.insertar(usuario);

    expect(id).toBe(IDS.usuario);
    await expect(repositorio.obtenerPorId(IDS.usuario)).resolves.not.toBeNull();
  });

  it("pagina: total, skip y limit son consistentes", async () => {
    const repositorio = crearRepositorioUsuarios(db.collection("usuarios"));
    await repositorio.insertar(usuarioDeEjemplo(1));
    await repositorio.insertar(usuarioDeEjemplo(2));
    await repositorio.insertar(usuarioDeEjemplo(3));

    const pagina = await repositorio.listar({}, { skip: 1, limit: 1, orden: { email: 1 } });

    expect(pagina.total).toBe(3);
    expect(pagina.skip).toBe(1);
    expect(pagina.limit).toBe(1);
    expect(pagina.items).toHaveLength(1);
    expect(pagina.items[0]?.email).toBe("persona2@example.com");
  });

  it("filtra y ordena por el campo indicado", async () => {
    const repositorio = crearRepositorioUsuarios(db.collection("usuarios"));
    await repositorio.insertar(usuarioDeEjemplo(1));
    await repositorio.insertar(usuarioDeEjemplo(2));
    await repositorio.insertar(usuarioDeEjemplo(3));

    const filtrados = await repositorio.listar(
      { email_normalizado: { $in: ["persona1@example.com", "persona3@example.com"] } },
      { orden: { email: -1 } },
    );

    expect(filtrados.total).toBe(2);
    expect(filtrados.items.map((usuario) => usuario.email)).toEqual([
      "persona3@example.com",
      "persona1@example.com",
    ]);
  });

  it("cuenta con el mismo filtro que la lectura", async () => {
    const repositorio = crearRepositorioUsuarios(db.collection("usuarios"));
    await repositorio.insertar(usuarioDeEjemplo(1));
    await repositorio.insertar(usuarioDeEjemplo(2));

    await expect(repositorio.contar({})).resolves.toBe(2);
    await expect(repositorio.contar({ email_normalizado: "persona1@example.com" })).resolves.toBe(
      1,
    );
  });

  it("acota el límite de una lectura para no escanear la colección entera", async () => {
    const repositorio = crearRepositorioUsuarios(db.collection("usuarios"));

    const pagina = await repositorio.listar({}, { limit: 10_000 });

    expect(pagina.limit).toBe(LIMITE_MAXIMO);
  });

  it("actualiza y elimina por identificador, e informa si el documento existía", async () => {
    const repositorio = crearRepositorioUsuarios(db.collection("usuarios"));
    const id = await repositorio.insertar(usuarioDeEjemplo(1));

    await expect(
      repositorio.actualizarPorId(id, { $set: { "estadisticas.tickets_comprados": 7 } }),
    ).resolves.toBe(true);
    await expect(repositorio.obtenerPorId(id)).resolves.toMatchObject({
      estadisticas: { tickets_comprados: 7 },
    });

    await expect(repositorio.eliminarPorId(id)).resolves.toBe(true);
    await expect(repositorio.eliminarPorId(id)).resolves.toBe(false);
    await expect(repositorio.obtenerPorId(id)).resolves.toBeNull();
  });

  it("rechaza un identificador que no es un ObjectId válido", async () => {
    const repositorio = crearRepositorioUsuarios(db.collection("usuarios"));

    await expect(repositorio.obtenerPorId("no-es-un-objectid")).rejects.toThrow(ErrorIdInvalido);
  });

  it("omite el conteo cuando el filtro no lo admite (el caso de $near)", async () => {
    const lugares = db.collection("lugares");
    await lugares.deleteMany({});
    await lugares.insertOne({
      nombre: "Corferias",
      direccion: "Carrera 37",
      ciudad: "Bogotá",
      pais: "CO",
      capacidad_total: 2500,
      geometria: { type: "Point", coordinates: [-74.09, 4.654] },
      salas: [],
      activo: true,
      creado_en: new Date("2023-08-01T10:00:00Z"),
    });

    const cerca = {
      geometria: {
        $near: { $geometry: { type: "Point", coordinates: [-74.09, 4.654] } },
      },
    };

    // Sin el flag, el conteo falla: `$near` no se permite en `countDocuments`.
    await expect(lugares.countDocuments(cerca)).rejects.toThrow();

    const pagina = await crearRepositorio<Lugar>({
      coleccion: lugares,
      esquema: lugarSchema,
      aBson: lugarABson,
    }).listar(cerca, { total: false });

    expect(pagina.total).toBeNull();
    expect(pagina.items).toHaveLength(1);
    expect(pagina.items[0]?.nombre).toBe("Corferias");
  });

  it("falla al leer un documento que no cumple el dominio, con detalle por campo", async () => {
    // Se inserta saltándose el dominio: el servidor lo acepta (ambos correos son
    // cadenas) pero el dominio exige que el normalizado sea el derivado.
    await db.collection("usuarios").insertOne({
      email: "ana.gomez@example.com",
      email_normalizado: "otra-persona@example.com",
      nombre: "Ana Gómez",
      documento_identidad: "1234567890",
      tipo_usuario: ["asistente"],
      creado_en: new Date("2024-02-12T14:00:00Z"),
      actualizado_en: new Date("2024-09-01T09:30:00Z"),
    });

    const repositorio = crearRepositorioUsuarios(db.collection("usuarios"));

    await expect(repositorio.listar({})).rejects.toThrow(ErrorValidacion);
  });
});
