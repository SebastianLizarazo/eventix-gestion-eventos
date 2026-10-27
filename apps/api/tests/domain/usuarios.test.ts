import { describe, expect, it } from "vitest";
import { ErrorValidacion } from "../../src/domain/errors.js";
import { prepararUsuario, usuarioSchema } from "../../src/domain/schemas/usuarios.js";
import { IDS } from "./fixtures.js";

const USUARIO_VALIDO = {
  _id: IDS.usuario,
  email: "ana.gomez@example.com",
  email_normalizado: "anagomez@example.com",
  nombre: "Ana Gómez",
  telefono: "+57 311 555 1234",
  documento_identidad: "1234567890",
  tipo_usuario: ["asistente", "organizador"],
  fecha_nacimiento: "1992-04-15",
  preferencias: {
    newsletter: true,
    idioma: "es-CO",
    canal_notif: ["email", "sms"],
  },
  estadisticas: {
    eventos_asistidos: 12,
    tickets_comprados: 18,
    ltv_cop: 2450000,
  },
  creado_en: "2024-02-12T14:00:00Z",
  actualizado_en: "2024-09-01T09:30:00Z",
  _v: 3,
};

describe("usuarioSchema", () => {
  it("acepta el usuario de ejemplo del documento 04", () => {
    const usuario = usuarioSchema.parse(USUARIO_VALIDO);

    expect(usuario.email_normalizado).toBe("anagomez@example.com");
    expect(usuario.preferencias.idioma).toBe("es-CO");
  });

  it("rechaza un correo que no es un email", () => {
    const resultado = usuarioSchema.safeParse({ ...USUARIO_VALIDO, email: "no-es-un-email" });

    expect(resultado.success).toBe(false);
  });

  it("rechaza un usuario sin nombre", () => {
    const { nombre: _nombre, ...sinNombre } = USUARIO_VALIDO;

    expect(usuarioSchema.safeParse(sinNombre).success).toBe(false);
  });

  it("rechaza un email_normalizado que no corresponde al email", () => {
    const resultado = usuarioSchema.safeParse({
      ...USUARIO_VALIDO,
      email_normalizado: "ana.gomez@example.com",
    });

    expect(resultado.success).toBe(false);
  });

  it("exige al menos un tipo_usuario", () => {
    expect(usuarioSchema.safeParse({ ...USUARIO_VALIDO, tipo_usuario: [] }).success).toBe(false);
  });

  it("rechaza un tipo_usuario fuera del catálogo", () => {
    expect(usuarioSchema.safeParse({ ...USUARIO_VALIDO, tipo_usuario: ["root"] }).success).toBe(
      false,
    );
  });

  it("aplica las preferencias por defecto cuando no vienen informadas", () => {
    const { preferencias: _preferencias, ...sinPreferencias } = USUARIO_VALIDO;
    const usuario = usuarioSchema.parse(sinPreferencias);

    expect(usuario.preferencias).toEqual({
      newsletter: false,
      idioma: "es-CO",
      canal_notif: [],
    });
  });

  it("rechaza estadísticas con ltv_cop negativo", () => {
    const usuario = {
      ...USUARIO_VALIDO,
      estadisticas: { ...USUARIO_VALIDO.estadisticas, ltv_cop: -1 },
    };

    expect(usuarioSchema.safeParse(usuario).success).toBe(false);
  });

  it("rechaza un documento de identidad con formato inválido", () => {
    expect(usuarioSchema.safeParse({ ...USUARIO_VALIDO, documento_identidad: "@@" }).success).toBe(
      false,
    );
  });

  it("acepta un teléfono en formato local o internacional", () => {
    expect(usuarioSchema.safeParse({ ...USUARIO_VALIDO, telefono: "3115551234" }).success).toBe(
      true,
    );
    expect(
      usuarioSchema.safeParse({ ...USUARIO_VALIDO, telefono: "+57 311 555 1234" }).success,
    ).toBe(true);
  });

  it("rechaza un teléfono sin dígitos", () => {
    expect(usuarioSchema.safeParse({ ...USUARIO_VALIDO, telefono: "sin numero" }).success).toBe(
      false,
    );
  });
});

describe("prepararUsuario", () => {
  it("deriva email_normalizado del email recibido", () => {
    const usuario = prepararUsuario({
      email: "Ana.Gomez@Example.com",
      nombre: "Ana Gómez",
      documento_identidad: "1234567890",
      tipo_usuario: ["asistente"],
    });

    expect(usuario.email_normalizado).toBe("anagomez@example.com");
  });

  it("asigna las marcas de tiempo y la versión inicial", () => {
    const ahora = new Date("2025-01-01T00:00:00Z");
    const usuario = prepararUsuario(
      {
        email: "ana.gomez@example.com",
        nombre: "Ana Gómez",
        documento_identidad: "1234567890",
        tipo_usuario: ["asistente"],
      },
      ahora,
    );

    expect(usuario.creado_en).toEqual(ahora);
    expect(usuario.actualizado_en).toEqual(ahora);
    expect(usuario._v).toBe(0);
  });

  it("lanza ErrorValidacion con el campo culpable cuando el input es inválido", () => {
    try {
      prepararUsuario({ nombre: "Ana Gómez" });
      expect.unreachable("la preparación should've fallado");
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorValidacion);
      expect((error as ErrorValidacion).campos.map((campo) => campo.campo)).toContain("email");
    }
  });
});
