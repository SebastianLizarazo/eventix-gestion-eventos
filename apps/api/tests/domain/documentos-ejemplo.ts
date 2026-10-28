import { IDS } from "./fixtures.js";

/**
 * Los seis documentos representativos del documento 04 §3, con los ObjectId
 * truncados del documento sustituidos por hexadecimales completos.
 *
 * Fuente única de verdad: los usa el test de dominio (que los valida contra
 * los esquemas Zod) y el test de contraste dominio ⟷ servidor (que los
 * inserta contra los validadores `$jsonSchema` del servidor).
 */
export const DOCUMENTOS_EJEMPLO = {
  usuarios: {
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
  },
  lugares: {
    _id: IDS.lugar,
    nombre: "Corferias - Pabellón 4",
    direccion: "Carrera 37 #24-67, Bogotá",
    ciudad: "Bogotá",
    pais: "CO",
    capacidad_total: 2500,
    geometria: {
      type: "Point",
      coordinates: [-74.09, 4.654],
    },
    salas: [
      { nombre: "Sala A", capacidad: 1500, piso: 1 },
      { nombre: "Sala B", capacidad: 800, piso: 1 },
      { nombre: "Streaming", capacidad: 5000, tipo: "virtual" },
    ],
    activo: true,
    creado_en: "2023-08-01T10:00:00Z",
  },
  eventos: {
    _id: IDS.evento,
    slug: "rock-al-parque-2025",
    nombre: "Rock al Parque 2025",
    tipo_evento: "masivo",
    descripcion: "Festival de rock con 4 escenarios",
    fecha_inicio: "2025-09-12T16:00:00Z",
    fecha_fin: "2025-09-14T23:00:00Z",
    estado: "publicado",
    visibilidad: "publico",
    organizador_id: IDS.usuario,
    lugar_id: IDS.lugar,
    categorias: ["musica", "rock", "festival"],
    configuracion_evento: {
      plantilla_id: "festival_v2",
      branding: {
        color_primario: "#FF6B35",
        color_secundario: "#004E89",
        logo_url: "https://cdn.eventix.test/brands/rock2025.png",
      },
      encuesta_post_evento: {
        habilitada: true,
        preguntas: [
          { id: "q1", tipo: "escala", texto: "¿Cómo calificarías el evento?", rango: [1, 5] },
          { id: "q2", tipo: "abierta", texto: "¿Qué artista disfrutaste más?" },
        ],
      },
      hibrido: {
        habilitado: true,
        url_streaming: "https://stream.eventix.test/rock2025",
      },
    },
    tipos_ticket: [
      {
        _id: IDS.tipoTicket1,
        nombre: "General Día 1",
        precio_cop: 120000,
        aforo_total: 8000,
        aforo_vendido: 1234,
        restricciones: {
          edad_minima: 0,
          max_por_compra: 6,
          venta_inicio: "2025-06-01T00:00:00Z",
          venta_fin: "2025-09-12T15:00:00Z",
        },
      },
      {
        _id: IDS.tipoTicket2,
        nombre: "VIP 3 días",
        precio_cop: 850000,
        aforo_total: 500,
        aforo_vendido: 487,
        restricciones: { edad_minima: 18, max_por_compra: 2 },
      },
    ],
    promociones: [
      {
        codigo: "EARLY2025",
        tipo: "porcentaje",
        valor: 25,
        aplica_a_tipo_ticket_ids: [IDS.tipoTicket1],
        vigencia_inicio: "2025-01-01T00:00:00Z",
        vigencia_fin: "2025-03-31T23:59:59Z",
        usos_maximos: 1000,
        usos_realizados: 234,
        activo: false,
      },
    ],
    metricas_evento: {
      tickets_vendidos_total: 1721,
      ingresos_cop: 415000000,
      ultima_actualizacion: "2025-09-01T12:00:00Z",
    },
    tags: ["2025", "festival", "bogota"],
    creado_en: "2024-11-20T10:00:00Z",
    actualizado_en: "2025-09-01T12:00:00Z",
    _v: 17,
  },
  tickets: {
    _id: IDS.ticket,
    codigo_qr: "QR-RK25-AB12CD34",
    estado: "emitido",
    evento_id: IDS.evento,
    comprado_por_usuario_id: IDS.usuario,
    snapshot_tipo_ticket: {
      tipo_ticket_id: IDS.tipoTicket1,
      nombre: "General Día 1",
      precio_cop: 120000,
    },
    asistente_snapshot: {
      usuario_id: IDS.usuario,
      nombre: "Ana Gómez",
      documento_identidad: "1234567890",
      email: "ana.gomez@example.com",
    },
    precio_pagado_cop: 90000,
    promocion_aplicada_codigo: "EARLY2025",
    transaccion_id: IDS.transaccion,
    emitido_en: "2025-02-15T11:24:00Z",
    validado_en: null,
    validado_por_puerta: null,
    revalidaciones: [],
    _v: 1,
  },
  transacciones: {
    _id: IDS.transaccion,
    usuario_id: IDS.usuario,
    ticket_id: IDS.ticket,
    monto_cop: 90000,
    moneda: "COP",
    metodo_pago: "tarjeta_credito",
    pasarela: "wompi_mock",
    estado: "aprobada",
    referencia_pasarela: "TXN-MOCK-987654",
    creada_en: "2025-02-15T11:24:00Z",
    confirmada_en: "2025-02-15T11:24:03Z",
  },
  auditoria_eventos: {
    _id: IDS.auditoria,
    actor_id: IDS.usuario,
    actor_rol: "organizador",
    accion: "ticket.emitido",
    sujeto_tipo: "ticket",
    sujeto_id: IDS.ticket,
    metadata: {
      evento_id: IDS.evento,
      ip: "190.24.1.10",
      user_agent: "Mozilla/5.0",
      monto_cop: 90000,
    },
    ocurrido_en: "2025-02-15T11:24:00Z",
  },
} as const;
