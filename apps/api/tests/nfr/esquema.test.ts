import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db, type Document } from "mongodb";
import { config } from "../../src/config.js";
import { aplicarSetup } from "../../src/db/setup.js";
import { crearRepositorios, type Repositorios } from "../../src/db/repos/index.js";
import { prepararEvento, prepararLugar, prepararUsuario } from "../../src/domain/schemas/index.js";
import { VALIDADORES } from "../../src/db/validators.js";
import { arrancarServidorDeMedicion } from "../../src/nfr/servidor.js";
import {
  BLOQUE_ACADEMICO,
  contarDocumentosConBloque,
  leerArgumentos,
  demostrarEsquema,
  type ResultadoEsquema,
} from "../../src/nfr/esquema.js";
import { compararConteos } from "../../src/nfr/dataset.js";

/**
 * T8.2 · demostración del NFR-04 (adición de campos por tipo de evento sin
 * migración y sin downtime).
 *
 * La suite corre contra **su propia base** (`${config.MONGODB_DB}_nfr_esquema`),
 * que se borra al terminar: la base de desarrollo es la evidencia de los demás
 * hitos y esta unidad no puede ensuciarla.
 *
 * Lo que se afirma aquí es **la lógica de la demostración**, no el tiempo que
 * tarda la máquina: el bucle de tráfico se mide por su número de fallos (que
 * tiene que ser cero), nunca por su duración.
 */

const DB_PRUEBA = `${config.MONGODB_DB}_nfr_esquema`;

const ORGANIZADOR = "66a800000000000000000001";
const LUGAR = "66b000000000000000000002";

let cliente: MongoClient;
let db: Db;
let repos: Repositorios;
let resultado: ResultadoEsquema;

/**
 * Validator de `eventos` **sin** el bloque `academico`.
 *
 * Reproduce el estado real de la colección antes de que el campo existiera:
 * el servidor tiene un `$jsonSchema` que no conoce el bloque nuevo. Si el
 * almacén acepta la escritura de todas formas, la prueba de flexibilidad de
 * esquema es real y no depende de que el validador se haya actualizado antes.
 */
function validatorSinBloqueAcademico(): Document {
  const copia = structuredClone(VALIDADORES.eventos) as Document;
  const configuracion = copia.$jsonSchema.properties.configuracion_evento as Document;

  delete configuracion.properties.academico;

  return copia;
}

/** Siembra el mínimo para tener un evento académico y uno de otro tipo. */
async function sembrarEventos(): Promise<void> {
  await repos.usuarios.insertar(
    prepararUsuario({
      email: "organizador-nfr@eventix.test",
      nombre: "Organizador NFR",
      documento_identidad: "CC-NFR-001",
      tipo_usuario: ["organizador"],
    }),
  );

  await repos.lugares.insertar(
    prepararLugar({
      nombre: "Auditorio NFR",
      direccion: "Calle 1 # 2-3",
      ciudad: "Bogotá",
      pais: "CO",
      capacidad_total: 500,
      geometria: { type: "Point", coordinates: [-74.072, 4.711] },
    }),
  );

  await repos.eventos.insertar(
    prepararEvento({
      nombre: "Congreso de prueba",
      tipo_evento: "academico",
      descripcion: "Evento académico de la demostración del NFR-04",
      estado: "publicado",
      visibilidad: "publico",
      fecha_inicio: new Date("2026-03-01T14:00:00Z"),
      fecha_fin: new Date("2026-03-01T20:00:00Z"),
      organizador_id: ORGANIZADOR,
      lugar_id: LUGAR,
      configuracion_evento: { plantilla_id: "plantilla-nfr" },
    }),
  );

  await repos.eventos.insertar(
    prepararEvento({
      nombre: "Festival de prueba",
      tipo_evento: "masivo",
      descripcion: "Evento de otro tipo, para la coexistencia",
      estado: "publicado",
      visibilidad: "publico",
      fecha_inicio: new Date("2026-04-01T14:00:00Z"),
      fecha_fin: new Date("2026-04-01T22:00:00Z"),
      organizador_id: ORGANIZADOR,
      lugar_id: LUGAR,
      configuracion_evento: { plantilla_id: "plantilla-nfr" },
    }),
  );
}

beforeAll(async () => {
  cliente = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });
  await cliente.connect();

  db = cliente.db(DB_PRUEBA);
  await db.dropDatabase();
  await aplicarSetup(db);

  // La colección se deja con el validator que tenía antes del campo nuevo:
  // la demostración tiene que funcionar contra ese validator, sin tocarlo.
  await db.command({
    collMod: "eventos",
    validator: validatorSinBloqueAcademico(),
    validationLevel: "strict",
    validationAction: "error",
  });

  repos = crearRepositorios(db);
  await sembrarEventos();

  const servidor = await arrancarServidorDeMedicion(repos, cliente);

  try {
    resultado = await demostrarEsquema({ base: servidor.base, db, intervaloTraficoMs: 5 });
  } finally {
    await servidor.cerrar();
  }
});

afterAll(async () => {
  await db.dropDatabase();
  await cliente.close();
});

describe("T8.2 · dominio del bloque académico", () => {
  it("el bloque de la demostración trae los dos campos del dominio", () => {
    expect(BLOQUE_ACADEMICO.creditos).toBe(4);
    expect(BLOQUE_ACADEMICO.certificado_url).toMatch(/^https:\/\//);
  });

  it("la demostración se hizo sobre un evento de tipo académico", () => {
    expect(resultado.evento.tipo_evento).toBe("academico");
  });
});

describe("T8.2 · sin migración", () => {
  it("el campo nuevo se escribe sobre un solo documento", () => {
    expect(resultado.escrituraDirecta.comandos).toBe(1);
    expect(resultado.escrituraDirecta.matchedCount).toBe(1);
    expect(resultado.escrituraDirecta.modifiedCount).toBe(1);
    expect(resultado.escrituraDirecta.acknowledged).toBe(true);
  });

  it("el conteo de documentos de la colección no cambia", () => {
    expect(resultado.documentosEventosDespues).toBe(resultado.documentosEventosAntes);
  });

  it("exactamente un documento lleva el bloque nuevo", () => {
    expect(resultado.documentosConBloqueAntes).toBe(0);
    expect(resultado.documentosConBloqueDespues).toBe(1);
  });

  it("el validator del servidor no se tocó durante la corrida", () => {
    expect(resultado.validadorSinCambios).toBe(true);
    expect(resultado.validadorDeclarabaElBloque).toBe(false);
  });

  it("el almacén aceptó la escritura directa de un campo que su validator no declara", () => {
    expect(resultado.escrituraDirecta.acknowledged).toBe(true);
    expect(resultado.escrituraDirecta.modifiedCount).toBe(1);
  });
});

describe("T8.2 · sin downtime", () => {
  it("el bucle de tráfico corrió durante el cambio", () => {
    expect(resultado.trafico.peticiones).toBeGreaterThan(0);
    expect(resultado.peticionesDuranteElCambio).toBeGreaterThan(0);
  });

  it("ninguna respuesta del tráfico fue un no-2xx", () => {
    expect(resultado.trafico.fallos).toBe(0);
    expect(resultado.trafico.exitosas).toBe(resultado.trafico.peticiones);
  });
});

describe("T8.2 · la API expone el campo nuevo", () => {
  it("el bloque aparece en la respuesta de la lectura", () => {
    expect(resultado.lecturaApi.status).toBe(200);
    expect(resultado.lecturaApi.bloque).toEqual(BLOQUE_ACADEMICO);
  });

  it("la API acepta el bloque nuevo en la edición", () => {
    expect(resultado.patchAcademico.status).toBe(200);
    expect(resultado.patchAcademico.bloque).toEqual(BLOQUE_ACADEMICO);
  });

  it("la API rechaza el bloque nuevo en un evento de otro tipo", () => {
    expect(resultado.patchOtroTipo.status).toBeGreaterThanOrEqual(400);
    expect(resultado.patchOtroTipo.status).toBeLessThan(500);
  });
});

describe("T8.2 · coexistencia de dos formas en la misma colección", () => {
  it("el evento de otro tipo se lee igual, sin el bloque nuevo", () => {
    expect(resultado.coexistencia.status).toBe(200);
    expect(resultado.coexistencia.bloque).toBeNull();
  });

  it("los dos eventos conviven en la misma colección", () => {
    expect(resultado.evento.tipo_evento).toBe("academico");
    expect(resultado.eventoOtroTipo.tipo_evento).toBe("masivo");
  });
});

describe("T8.2 · el dataset queda intacto", () => {
  it("el documento modificado quedó exactamente como estaba", () => {
    expect(resultado.formaCanonicaIgual).toBe(true);
    expect(resultado.documentoRestaurado).toBe(true);
  });

  it("los conteos de las seis colecciones son los mismos", () => {
    expect(resultado.conteosIguales).toBe(true);
  });

  it("ningún documento quedó con el bloque nuevo", () => {
    expect(resultado.documentosConBloqueRestaurados).toBe(0);
  });

  it("la demostración no reporta errores", () => {
    expect(resultado.errores).toEqual([]);
    expect(resultado.cumple).toBe(true);
  });
});

describe("T8.2 · utilidades de la demostración", () => {
  it("compara los conteos de antes y después", () => {
    const comparacion = compararConteos({ eventos: 340 }, { eventos: 340 });

    expect(comparacion.iguales).toBe(true);
  });

  it("detecta una colección que quedó sucia", () => {
    const comparacion = compararConteos({ eventos: 340 }, { eventos: 341 });

    expect(comparacion.iguales).toBe(false);
    expect(comparacion.diferencias).toEqual([{ coleccion: "eventos", antes: 340, despues: 341 }]);
  });

  it("cuenta los documentos que llevan el bloque nuevo", async () => {
    const conteo = await contarDocumentosConBloque(db);

    expect(conteo).toBe(0);
  });

  it("lee los argumentos de la línea de comandos", () => {
    const argumentos = leerArgumentos([]);

    expect(argumentos.ayuda).toBe(false);
    expect(argumentos.intervaloTraficoMs).toBeGreaterThan(0);
  });

  it("una opción desconocida es un error", () => {
    expect(() => leerArgumentos(["--desconocida=1"])).toThrow(/desconocida/);
  });
});
