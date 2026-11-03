import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { config } from "../../../src/config.js";
import { aplicarSetup } from "../../../src/db/setup.js";
import { crearRepositorioUsuarios } from "../../../src/db/repos/usuarios.js";
import { usuarioSchema, type Usuario } from "../../../src/domain/schemas/index.js";
import { validar } from "../../../src/domain/validar.js";
import { DOCUMENTOS_EJEMPLO } from "../../domain/documentos-ejemplo.js";

/**
 * Repositorio de `usuarios` (tarea T3.1): las consultas del documento 04 §4.1.
 *
 * Corre contra una base propia para no tocar la base de desarrollo.
 */

const DB_PRUEBA = `${config.MONGODB_DB}_repos_usuarios`;

let cliente: MongoClient;
let db: Db;

const USUARIO_BASE = validar(usuarioSchema, DOCUMENTOS_EJEMPLO.usuarios, "usuario") as Usuario;

function usuario(overrides: Partial<Usuario>): Usuario {
  return { ...USUARIO_BASE, _id: undefined, ...overrides };
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

describe("T3.1 · repositorio de usuarios", () => {
  it("busca por correo normalizado, con el mismo criterio que el dominio", async () => {
    const repositorio = crearRepositorioUsuarios(db.collection("usuarios"));

    await repositorio.insertar(
      usuario({ email: "ana.gomez@example.com", email_normalizado: "anagomez@example.com" }),
    );

    const encontrado = await repositorio.porEmailNormalizado("Ana.Gomez@Example.com");

    expect(encontrado?.email).toBe("ana.gomez@example.com");
    await expect(repositorio.porEmailNormalizado("otra@example.com")).resolves.toBeNull();
  });

  it("lista los usuarios de un tipo", async () => {
    const repositorio = crearRepositorioUsuarios(db.collection("usuarios"));

    await repositorio.insertar(
      usuario({
        email: "org1@example.com",
        email_normalizado: "org1@example.com",
        tipo_usuario: ["organizador"],
      }),
    );
    await repositorio.insertar(
      usuario({
        email: "org2@example.com",
        email_normalizado: "org2@example.com",
        tipo_usuario: ["asistente", "organizador"],
      }),
    );
    await repositorio.insertar(
      usuario({
        email: "asis1@example.com",
        email_normalizado: "asis1@example.com",
        tipo_usuario: ["asistente"],
      }),
    );

    const organizadores = await repositorio.porTipoUsuario("organizador");

    expect(organizadores.map((u) => u.email).sort()).toEqual([
      "org1@example.com",
      "org2@example.com",
    ]);
  });

  it("lista los usuarios que prefieren un idioma", async () => {
    const repositorio = crearRepositorioUsuarios(db.collection("usuarios"));

    await repositorio.insertar(
      usuario({
        email: "es1@example.com",
        email_normalizado: "es1@example.com",
        preferencias: { newsletter: true, idioma: "es-CO", canal_notif: ["email"] },
      }),
    );
    await repositorio.insertar(
      usuario({
        email: "en1@example.com",
        email_normalizado: "en1@example.com",
        preferencias: { newsletter: false, idioma: "en-US", canal_notif: [] },
      }),
    );

    const enEspanol = await repositorio.porIdioma("es-CO");

    expect(enEspanol.total).toBe(1);
    expect(enEspanol.items[0]?.email).toBe("es1@example.com");
  });
});
