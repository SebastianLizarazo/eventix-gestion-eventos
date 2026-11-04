import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContratoOpenApi } from "@/api/contrato";
import { CamposDeEsquema } from "@/ui/campos-contrato";

/**
 * Pruebas del editor que construye los campos con el esquema del contrato.
 *
 * Lo que se comprueba es la promesa de la spec S10: **la interfaz no
 * escribe los campos, los lee del contrato**. El esquema de la prueba trae
 * un texto, un número, un booleano, un vocabulario cerrado, un bloque
 * anidado y una forma que el editor no maneja; los seis tienen que salir en
 * pantalla sin que el componente sepa nada de ellos.
 */

/** El contrato de la prueba: un esquema de configuración con un bloque dentro. */
const CONTRATO: ContratoOpenApi = {
  openapi: "3.1.0",
  info: { title: "Eventix API", version: "0.1.0" },
  paths: {},
  components: {
    schemas: {
      Configuracion: {
        type: "object",
        properties: {
          plantilla_id: { type: "string" },
          creditos: { type: "integer" },
          habilitado: { type: "boolean" },
          tipo: { type: "string", enum: ["escala", "abierta"] },
          bloque: {
            type: "object",
            properties: { url: { type: "string" } },
          },
          preguntas: {
            type: "array",
            items: { type: "object", properties: { texto: { type: "string" } } },
          },
        },
      },
    },
  },
};

/** El esquema que se edita: el de la configuración. */
const ESQUEMA = CONTRATO.components.schemas.Configuracion;

/** El valor con el que se abre el editor. */
const VALOR = {
  plantilla_id: "base",
  creditos: 3,
  bloque: { url: "https://eventix.dev" },
};

/**
 * La limpieza es explícita porque la suite no activa `globals`: sin esto, cada
 * prueba dejaría su pantalla en el documento y la siguiente buscaría entre
 * varias copias del mismo campo.
 */
afterEach(() => {
  cleanup();
});

describe("Campos construidos con el esquema del contrato", () => {
  it("muestra un control por cada propiedad que declara el esquema", () => {
    render(
      <CamposDeEsquema
        contrato={CONTRATO}
        esquema={ESQUEMA}
        valor={VALOR}
        onCambiar={vi.fn()}
        idBase="cfg"
      />,
    );

    expect(screen.getByLabelText("Plantilla id")).toHaveValue("base");
    expect(screen.getByLabelText("Creditos")).toHaveValue(3);
    expect(screen.getByLabelText("Habilitado")).not.toBeChecked();
    expect(screen.getByLabelText("Tipo")).toHaveValue("");
    expect(screen.getByRole("group", { name: "Bloque" })).toBeInTheDocument();
    expect(screen.getByLabelText("Url")).toHaveValue("https://eventix.dev");
  });

  it("el vocabulario cerrado se ofrece como lista, no como texto libre", () => {
    render(
      <CamposDeEsquema
        contrato={CONTRATO}
        esquema={ESQUEMA}
        valor={VALOR}
        onCambiar={vi.fn()}
        idBase="cfg"
      />,
    );

    const opciones = Array.from(screen.getByLabelText("Tipo").querySelectorAll("option")).map(
      (opcion) => opcion.textContent,
    );

    expect(opciones).toEqual(["—", "escala", "abierta"]);
  });

  it("una forma que el editor no maneja se edita como JSON", () => {
    render(
      <CamposDeEsquema
        contrato={CONTRATO}
        esquema={ESQUEMA}
        valor={VALOR}
        onCambiar={vi.fn()}
        idBase="cfg"
      />,
    );

    expect(screen.getByLabelText("Preguntas").tagName).toBe("TEXTAREA");
  });

  it("cambiar un campo devuelve el objeto con la propiedad cambiada", () => {
    const onCambiar = vi.fn();

    render(
      <CamposDeEsquema
        contrato={CONTRATO}
        esquema={ESQUEMA}
        valor={VALOR}
        onCambiar={onCambiar}
        idBase="cfg"
      />,
    );

    fireEvent.change(screen.getByLabelText("Plantilla id"), { target: { value: "otra" } });

    expect(onCambiar).toHaveBeenCalledWith({
      plantilla_id: "otra",
      creditos: 3,
      bloque: { url: "https://eventix.dev" },
    });
  });

  it("vaciar un campo quita la propiedad del objeto", () => {
    const onCambiar = vi.fn();

    render(
      <CamposDeEsquema
        contrato={CONTRATO}
        esquema={ESQUEMA}
        valor={VALOR}
        onCambiar={onCambiar}
        idBase="cfg"
      />,
    );

    fireEvent.change(screen.getByLabelText("Plantilla id"), { target: { value: "" } });

    expect(onCambiar).toHaveBeenCalledWith({
      creditos: 3,
      bloque: { url: "https://eventix.dev" },
    });
  });

  it("un campo anidado se cambia sin tocar el resto del bloque", () => {
    const onCambiar = vi.fn();

    render(
      <CamposDeEsquema
        contrato={CONTRATO}
        esquema={ESQUEMA}
        valor={VALOR}
        onCambiar={onCambiar}
        idBase="cfg"
      />,
    );

    fireEvent.change(screen.getByLabelText("Url"), { target: { value: "https://otro.dev" } });

    expect(onCambiar).toHaveBeenCalledWith({
      plantilla_id: "base",
      creditos: 3,
      bloque: { url: "https://otro.dev" },
    });
  });

  it("un puntero local se resuelve contra el esquema que lo contiene", () => {
    const contrato: ContratoOpenApi = {
      ...CONTRATO,
      components: {
        schemas: {
          ConPuntero: {
            type: "object",
            properties: {
              nombre: { type: "string" },
              copia: { $ref: "#/properties/nombre" },
            },
          },
        },
      },
    };

    render(
      <CamposDeEsquema
        contrato={contrato}
        esquema={contrato.components.schemas.ConPuntero}
        valor={{}}
        onCambiar={vi.fn()}
        idBase="cfg"
      />,
    );

    // `copia` apunta a `nombre`: el puntero local se resuelve y el campo sale.
    expect(screen.getByLabelText("Copia")).toHaveAttribute("type", "text");
  });

  it("una referencia cíclica no revienta la pantalla", () => {
    const contrato: ContratoOpenApi = {
      ...CONTRATO,
      components: {
        schemas: {
          ConCiclo: {
            type: "object",
            properties: {
              nombre: { type: "string" },
              ciclo: { $ref: "#/properties/ciclo" },
            },
          },
        },
      },
    };

    render(
      <CamposDeEsquema
        contrato={contrato}
        esquema={contrato.components.schemas.ConCiclo}
        valor={{}}
        onCambiar={vi.fn()}
        idBase="cfg"
      />,
    );

    // El campo cíclico no se muestra (no se sabe leer), pero el resto de la
    // pantalla sigue en pie.
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ciclo")).not.toBeInTheDocument();
  });
});
