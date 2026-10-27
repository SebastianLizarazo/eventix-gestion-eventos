
--   * meta_config JSONB sin índice GIN           (CB-5)
--   * sin índices compuestos para búsquedas       (CB-4)
--   * cantidad_vendida sin CHECK contra el total  (CB-2, nota crítica)
--   * updated_at existe pero la app no lo verifica (sin optimistic locking)
-- =====================================================================

DROP TABLE IF EXISTS transacciones        CASCADE;
DROP TABLE IF EXISTS tickets              CASCADE;
DROP TABLE IF EXISTS asistentes           CASCADE;
DROP TABLE IF EXISTS eventos_promociones  CASCADE;
DROP TABLE IF EXISTS eventos_categorias   CASCADE;
DROP TABLE IF EXISTS tipos_ticket         CASCADE;
DROP TABLE IF EXISTS promociones          CASCADE;
DROP TABLE IF EXISTS categorias           CASCADE;
DROP TABLE IF EXISTS eventos              CASCADE;
DROP TABLE IF EXISTS lugares              CASCADE;
DROP TABLE IF EXISTS usuarios             CASCADE;

-- ---------------------------------------------------------------------
-- 1. Tablas base
-- ---------------------------------------------------------------------

CREATE TABLE usuarios (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre      VARCHAR(150) NOT NULL,
    email       VARCHAR(255) NOT NULL UNIQUE,
    telefono    VARCHAR(30),
    creado_en   TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE lugares (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(200) NOT NULL,
    direccion       VARCHAR(300),
    capacidad_total INT CHECK (capacidad_total >= 0),
    geometria       JSONB            -- punto geográfico guardado como JSON
);

CREATE TABLE categorias (
    id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre  VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE promociones (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre                VARCHAR(150) NOT NULL,
    descuento_porcentaje  NUMERIC(5,2) CHECK (descuento_porcentaje BETWEEN 0 AND 100),
    vigencia_inicio       TIMESTAMP,
    vigencia_fin          TIMESTAMP,
    condiciones           JSONB      -- reglas (2x1, early-bird...) en JSON
);

-- ---------------------------------------------------------------------
-- 2. Eventos y tipos de ticket
-- ---------------------------------------------------------------------

CREATE TABLE eventos (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(200) NOT NULL,
    descripcion     TEXT,
    fecha_inicio    TIMESTAMP NOT NULL,
    fecha_fin       TIMESTAMP NOT NULL,
    tipo_evento     VARCHAR(30) NOT NULL
                    CHECK (tipo_evento IN ('corporativo', 'masivo', 'hibrido', 'academico')),  -- CB-7
    lugar_id        BIGINT REFERENCES lugares(id),
    organizador_id  BIGINT NOT NULL REFERENCES usuarios(id),
    meta_config     JSONB,           -- branding, encuesta, streaming... opaco (CB-5)
    estado          TEXT NOT NULL DEFAULT 'borrador',
    updated_at      TIMESTAMP NOT NULL DEFAULT now(),
    CHECK (fecha_fin >= fecha_inicio)
);

CREATE TABLE tipos_ticket (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    evento_id        BIGINT NOT NULL REFERENCES eventos(id),
    nombre           VARCHAR(100) NOT NULL,
    precio           NUMERIC(12,2) NOT NULL CHECK (precio >= 0),
    cantidad_total   INT NOT NULL CHECK (cantidad_total >= 0),
    cantidad_vendida INT NOT NULL DEFAULT 0,   -- SIN CHECK (cantidad_vendida <= cantidad_total)
    venta_inicio     TIMESTAMP,
    venta_fin        TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 3. Tablas intermedias (relaciones muchos-a-muchos)
-- ---------------------------------------------------------------------

CREATE TABLE eventos_categorias (
    evento_id    BIGINT NOT NULL REFERENCES eventos(id),
    categoria_id BIGINT NOT NULL REFERENCES categorias(id),
    PRIMARY KEY (evento_id, categoria_id)
);

CREATE TABLE eventos_promociones (
    evento_id    BIGINT NOT NULL REFERENCES eventos(id),
    promocion_id BIGINT NOT NULL REFERENCES promociones(id),
    PRIMARY KEY (evento_id, promocion_id)
);

-- ---------------------------------------------------------------------
-- 4. Asistentes, tickets y transacciones
-- ---------------------------------------------------------------------

CREATE TABLE asistentes (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id         BIGINT NOT NULL REFERENCES usuarios(id),
    evento_id          BIGINT NOT NULL REFERENCES eventos(id),
    registrado_en      TIMESTAMP NOT NULL DEFAULT now(),
    estado_asistencia  TEXT NOT NULL DEFAULT 'registrado'
);

CREATE TABLE tickets (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo_ticket_id  BIGINT NOT NULL REFERENCES tipos_ticket(id),
    asistente_id    BIGINT NOT NULL REFERENCES asistentes(id),
    codigo_qr       VARCHAR(60) NOT NULL UNIQUE,
    estado          VARCHAR(20) NOT NULL DEFAULT 'emitido',
    precio_pagado   NUMERIC(12,2) NOT NULL,   -- snapshot del precio al comprar
    emitido_en      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE transacciones (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticket_id    BIGINT NOT NULL UNIQUE REFERENCES tickets(id),   -- relación 1 a 1
    monto        NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
    metodo_pago  VARCHAR(30) NOT NULL,
    estado       VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    creada_en    TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 5. Índices (solo los básicos; los compuestos NO existen, ver CB-4)
-- ---------------------------------------------------------------------

CREATE INDEX idx_eventos_organizador   ON eventos(organizador_id);
CREATE INDEX idx_tipos_ticket_evento   ON tipos_ticket(evento_id);
CREATE INDEX idx_asistentes_usuario    ON asistentes(usuario_id);
CREATE INDEX idx_tickets_tipo_ticket   ON tickets(tipo_ticket_id);
-- Faltan a propósito:
--   * índice compuesto (categoría + ciudad + rango de fechas) -> Seq Scan en la búsqueda
--   * índice GIN sobre eventos.meta_config                   -> el JSON no se puede buscar rápido

-- =====================================================================
-- DATOS SINTÉTICOS DE PRUEBA (R-07)
-- Se asume base vacía: los ids se generan desde 1.
-- =====================================================================

INSERT INTO usuarios (nombre, email, telefono) VALUES
    ('Ana Gómez',     'ana.gomez@example.com',     '+57 311 555 1234'),  -- id 1 · organizadora
    ('Carlos Pérez',  'carlos.perez@example.com',  '+57 310 555 9876'),  -- id 2 · asistente
    ('Lina Rojas',    'lina.rojas@example.com',    '+57 312 555 4321'),  -- id 3 · operadora
    ('Mauro Díaz',    'mauro.diaz@example.com',    '+57 315 555 1111');  -- id 4 · analista

INSERT INTO lugares (nombre, direccion, capacidad_total, geometria) VALUES
    ('Parque Simón Bolívar', 'Calle 63 #68-95, Bogotá',   80000, '{"type":"Point","coordinates":[-74.093,4.658]}'),
    ('Corferias - Pabellón 4', 'Carrera 37 #24-67, Bogotá', 2500, '{"type":"Point","coordinates":[-74.090,4.654]}');

INSERT INTO categorias (nombre) VALUES ('musica'), ('rock'), ('festival'), ('tecnologia');

INSERT INTO promociones (nombre, descuento_porcentaje, vigencia_inicio, vigencia_fin, condiciones) VALUES
    ('EARLY2025', 25, '2025-01-01', '2025-03-31 23:59:59', '{"tipo":"early_bird","usos_maximos":1000}');

INSERT INTO eventos (nombre, descripcion, fecha_inicio, fecha_fin, tipo_evento,
                     lugar_id, organizador_id, meta_config, estado) VALUES
    ('Rock al Parque 2025', 'Festival de rock con 4 escenarios',
     '2025-09-12 16:00', '2025-09-14 23:00', 'masivo', 1, 1,
     '{"branding":{"color_primario":"#FF6B35","logo_url":"https://cdn.eventix.test/brands/rock2025.png"},
       "encuesta":{"habilitada":true,"preguntas":[{"id":"q1","texto":"¿Cómo calificarías el evento?"}]},
       "escenarios":["Plaza","Bosque","Club","Electrónica"]}',
     'publicado'),
    ('Congreso de Analítica 2025', 'Congreso corporativo de dos días',
     '2025-10-20 08:00', '2025-10-21 18:00', 'corporativo', 2, 1,
     '{"branding":{"color_primario":"#004E89"},
       "tracks":["Datos","IA","Cloud"],
       "speakers":["Dra. Ruiz","Ing. Torres"]}',
     'publicado');

INSERT INTO eventos_categorias (evento_id, categoria_id) VALUES (1,1), (1,2), (1,3), (2,4);
INSERT INTO eventos_promociones (evento_id, promocion_id) VALUES (1,1);

INSERT INTO tipos_ticket (evento_id, nombre, precio, cantidad_total, cantidad_vendida, venta_inicio, venta_fin) VALUES
    (1, 'General Día 1', 120000,  8000, 1, '2025-06-01', '2025-09-12 15:00'),  -- id 1
    (1, 'VIP 3 días',    850000,   500, 0, '2025-06-01', '2025-09-12 15:00'),  -- id 2
    (2, 'Entrada general', 300000, 400, 0, '2025-08-01', '2025-10-20 07:00');  -- id 3

INSERT INTO asistentes (usuario_id, evento_id) VALUES (2, 1);   -- Carlos en Rock al Parque

INSERT INTO tickets (tipo_ticket_id, asistente_id, codigo_qr, estado, precio_pagado) VALUES
    (1, 1, 'QR-RK25-AB12CD34', 'emitido', 90000);   -- 120.000 con 25 % de descuento

INSERT INTO transacciones (ticket_id, monto, metodo_pago, estado) VALUES
    (1, 90000, 'tarjeta_credito', 'aprobada');

-- =====================================================================
-- CONSULTAS DE EJEMPLO (las que muestran los problemas del diagnóstico)
-- =====================================================================

-- A) "Vista 360° de un evento" (S2 / CB-1): une 7 tablas y calcula los
--    totales cada vez que alguien abre el tablero.
SELECT  e.nombre                                   AS evento,
        l.nombre                                   AS lugar,
        org.nombre                                 AS organizador,
        tt.nombre                                  AS tipo_ticket,
        tt.cantidad_total,
        tt.cantidad_vendida,
        COUNT(t.id)                                AS tickets_emitidos,
        COUNT(DISTINCT a.id)                       AS asistentes,
        COALESCE(SUM(tx.monto) FILTER (WHERE tx.estado = 'aprobada'), 0) AS ingresos
FROM    eventos e
JOIN    lugares       l   ON l.id   = e.lugar_id
JOIN    usuarios      org ON org.id = e.organizador_id
JOIN    tipos_ticket  tt  ON tt.evento_id = e.id
LEFT JOIN tickets     t   ON t.tipo_ticket_id = tt.id
LEFT JOIN asistentes  a   ON a.id = t.asistente_id
LEFT JOIN transacciones tx ON tx.ticket_id = t.id
WHERE   e.id = 1
GROUP BY e.id, l.id, org.id, tt.id
ORDER BY tt.id;

-- B) Buscar eventos por un dato dentro de meta_config (S4 / CB-5).
--    Funciona, pero sin índice GIN recorre toda la tabla.
SELECT id, nombre
FROM   eventos
WHERE  meta_config -> 'branding' ->> 'color_primario' = '#FF6B35';

-- C) Compra de un ticket (inventario como lógica de la aplicación).
--    El UPDATE condicional evita pasar del total, pero solo si se hace
--    todo en una transacción. La versión riesgosa (CB-2) es la que lee
--    cantidad_vendida primero, decide en la app y después actualiza:
--    dos peticiones pueden leer 99 y las dos vender el ticket 100.
BEGIN;

    UPDATE tipos_ticket
    SET    cantidad_vendida = cantidad_vendida + 1,
           updated_at       = now()
    WHERE  id = 1
      AND  cantidad_vendida < cantidad_total
    RETURNING id;                 -- si no devuelve filas, no hay cupo: ROLLBACK

    INSERT INTO asistentes (usuario_id, evento_id) VALUES (3, 1);

    INSERT INTO tickets (tipo_ticket_id, asistente_id, codigo_qr, precio_pagado)
    VALUES (1, currval(pg_get_serial_sequence('asistentes', 'id')), 'QR-RK25-ZZ99XX11', 120000);

    INSERT INTO transacciones (ticket_id, monto, metodo_pago, estado)
    VALUES (currval(pg_get_serial_sequence('tickets', 'id')), 120000, 'tarjeta_credito', 'aprobada');

COMMIT;

-- D) Agregar un atributo nuevo (S5 / CB-6): bloquea la tabla mientras
--    toma el lock y obliga a coordinar la migración con el despliegue.
--    ALTER TABLE eventos ADD COLUMN num_escenarios INT;
