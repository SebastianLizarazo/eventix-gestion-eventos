# Guía de sustentación · Eventix

Prueba funcional completa de la interfaz web, paso a paso. Cada paso indica la URL,
el **texto exacto** de los botones que hay que pulsar y los **valores exactos** que
hay que escribir. Los valores entre comillas son literales: se copian tal cual.

> Verificada de punta a punta contra la API en Docker el 18/11/2026: evento creado,
> 2 tipos de ticket, 2 promociones, 4 compras y los cuatro paneles de reportes.
> Los tres defectos que se documentan al final se encontraron en esa misma corrida.

---

## 0. Antes de empezar

```bash
docker compose -f docker-compose.entrega.yml up --build
```

| Servicio     | URL                              | Estado esperado                |
| ------------ | -------------------------------- | ------------------------------ |
| Interfaz web | http://localhost:5173            | `healthy`                      |
| API          | http://localhost:3000/api/health | `{"status":"ok","mongo":"up"}` |

Si querés la base limpia (resiembra el dataset):

```bash
docker compose -f docker-compose.entrega.yml down -v
docker compose -f docker-compose.entrega.yml up --build
```

**Regla de oro de la demo:** el dataset sembrado es una foto de 2023 y **todas sus
ventanas de venta están cerradas**, así que comprar sobre esos eventos falla con
`venta_cerrada` (409). La prueba usa un evento propio.

---

## Los tres números que hay que saber de memoria

| Dato             | Valor             |
| ---------------- | ----------------- |
| Tickets emitidos | **3**             |
| Ingresos         | **COP 285.000**   |
| Ocupación total  | **2%** (3 de 150) |

---

## Paso 1 · Crear el evento

`http://localhost:5173/gestion/eventos` → botón **"Nuevo evento"**

| Campo          | Valor                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| Nombre         | `Sustentacion Eventix 2026`                                                                           |
| Slug           | `sustentacion-eventix-2026`                                                                           |
| Tipo de evento | `Corporativo`                                                                                         |
| **Estado**     | **`Publicado`**                                                                                       |
| Visibilidad    | `Público`                                                                                             |
| Comienza       | `01/12/2026 10:00 a. m.`                                                                              |
| Termina        | `01/12/2026 06:00 p. m.`                                                                              |
| Lugar          | `Centro de Convenciones Bucaramanga`                                                                  |
| Categorías     | `conciertos, Ixidente`                                                                                |
| Etiquetas      | `rock, entrada`                                                                                       |
| Descripción    | `Evento de prueba para la sustentacion: cubre alta, tipos de ticket, promociones, compra y reportes.` |
| Organizador    | `Paula Villalba`                                                                                      |

> **Trampa 1 — el slug no lleva espacios.** El dominio exige `^[a-z0-9-]+$`: con
> espacio responde 422 con _"Debe ser un slug en minúsculas con el patrón…"_. También
> sirve dejar el campo vacío: la API deriva el slug del nombre.

> **Trampa 2 — el organizador se elige con clic.** La caja "Filtrar organizador"
> **filtra, no selecciona**: que "Paula Villalba" aparezca en la lista no la deja
> elegida. Hay que pulsar la opción del desplegable. La única confirmación es la
> línea de abajo: **"Organizador elegido: Paula Villalba"**. Sin esa línea, el
> `organizador_id` viaja vacío y la API responde 422.

### Tarjeta "Configuración"

Esta tarjeta **no tiene una lista de campos escrita a mano**: se construye leyendo
el esquema que la API publica en `/api/openapi.json`.

| Etiqueta                          | Valor                           |
| --------------------------------- | ------------------------------- |
| Plantilla id                      | `corp-2026`                     |
| Branding → Color primario         | `#1E293B`                       |
| Branding → Color secundario       | `#0EA5E9`                       |
| Branding → Logo url               | `https://eventix.test/logo.png` |
| Encuesta post evento → Habilitada | marcada                         |
| Encuesta post evento → Preguntas  | _(textarea JSON)_               |

En "Preguntas" (un arreglo de objetos, el editor lo muestra como JSON plano):

```json
[
  { "id": "q1", "tipo": "escala", "texto": "¿Qué te parecio el evento?", "rango": [1, 5] },
  { "id": "q2", "tipo": "abierta", "texto": "Dejanos tus comentarios" }
]
```

Dejar **vacíos** los bloques "Hibrido" y "Academico": el dominio rechaza `academico`
en un evento que no es académico (422, con detalle por campo).

→ botón **"Crear evento"** (está debajo de la tarjeta "Configuración").

> **Trampa 3 — las horas son UTC.** La app muestra y guarda en UTC. Las 10:00 que
> se escriben son las 10:00 UTC; para las 10:00 de Colombia hay que escribir
> `03:00 p. m.`. Es una decisión de diseño, no un error: todo el sistema razona en un
> solo huso y así los datos son idénticos en cualquier máquina.

---

## Paso 2 · Tipos de ticket

`/gestion/eventos` → clic en el **nombre** del evento (es link a `/eventos/{id}`) →
botón **"Editar"** → tarjeta **"Tipos de ticket"** → **"Nuevo tipo de ticket"**

**General**

| Campo             | Valor         |
| ----------------- | ------------- |
| Nombre            | `General`     |
| Precio (COP)      | `150000`      |
| Aforo total       | `100`         |
| Edad mínima       | `18`          |
| Máximo por compra | `4`           |
| Venta desde       | _(vacío)_     |
| **Venta hasta**   | _**(vacío)**_ |

**VIP**

| Campo        | Valor                    |
| ------------ | ------------------------ |
| Nombre       | `VIP`                    |
| Precio (COP) | `400000`                 |
| Aforo total  | `50`                     |
| Venta desde  | `01/11/2026 12:00 a. m.` |
| Venta hasta  | `01/01/2027 12:00 a. m.` |

→ botón **"Guardar tipo de ticket"** (se repite el alta para el segundo).

> **Trampa 4 — "Venta hasta" vacío en el General.** Es lo que habilita la compra: sin
> `venta_fin` la comprobación `venta_cerrada` (`compra.ts:173`) ni se dispara. En la
> pantalla de compra el General muestra _"La venta de este tipo de ticket no tiene
> ventana: está abierta."_ y el VIP muestra _"Ventana de venta: abre el … · cierra el …"_.

Notas honestas: **`max_por_compra` no lo aplica la API** (se guarda y se muestra, el
servicio no lo valida). Y bajar el aforo por debajo de lo ya vendido responde 409:
por eso los tipos se crean antes de comprar.

---

## Paso 3 · Promociones

Misma pantalla de edición → tarjeta **"Promociones"** → **"Nueva promoción"**

| Campo          | Valor                                         |
| -------------- | --------------------------------------------- |
| Código         | `VERANO10`                                    |
| Tipo           | `Porcentaje`                                  |
| Valor          | `10`                                          |
| Usos máximos   | `50`                                          |
| Vigencia desde | `01/11/2026 12:00 a. m.`                      |
| Vigencia hasta | `01/01/2027 12:00 a. m.`                      |
| **Aplica a**   | **`General — COP 150.000`** (casilla marcada) |
| Activa         | marcada                                       |

→ botón **"Guardar promoción"**

La tabla muestra las columnas **Código · Tipo · Valor · Vigencia · Usos · Estado ·
Aplica a**. En **"Aplica a"** tiene que decir **"General"**. Si dice "Ninguno", la
promoción está muerta: se creó igual, pero ningún tipo la puede aplicar.

> **Trampa 5 — "Aplica a" vacío no falla al guardar, falla al comprar.** Con la
> lista vacía la promoción **se crea bien (201)**; el 422 `no_aplica_al_tipo`
> aparece tres pasos más tarde, en la compra, con el formulario lleno de datos
> correctos. Es mucho más confuso que un error al guardar. Marcala de una vez.

El **2x1** se crea al final (Paso 5), no ahora: exige que el mismo comprador ya
tenga un ticket del mismo tipo.

---

## Paso 4 · La ficha del evento

`/gestion/eventos` → clic en el **nombre** del evento → `/eventos/{id}`

Tarjetas: "Datos del evento", "Métricas", "Tipos de ticket", "Configuración del
evento", "Promociones". Todo lo del Paso 1–3 en un solo documento.

→ botón **"Comprar"** → lleva a `/compra?evento={id}` con el evento ya elegido.

---

## Paso 5 · Las compras

### El comprador

La base tiene **1800 usuarios en 72 páginas de 25**, y la caja "Filtrar comprador"
filtra **solo la página cargada**, no la colección. **No escribir nada en el filtro**
y elegir de la primera página:

> `Alejandro Escobar — usuario000638@eventix.test`

El seed repite nombres, así que **el correo es el que disambigua**. Anotarlo: el 2x1
exige el **mismo** comprador.

### Escenario A · Compra sin promoción → COP 150.000

| Campo                        | Valor                                            |
| ---------------------------- | ------------------------------------------------ |
| Tipo de ticket               | `General — COP 150.000 — quedan 100`             |
| Comprador                    | `Alejandro Escobar — usuario000638@eventix.test` |
| El asistente es el comprador | **marcada** (así no hay que elegir asistente)    |
| Método de pago               | `Tarjeta de crédito`                             |
| Pasarela                     | `demo` (viene por defecto)                       |
| Referencia de la pasarela    | autogenerada `WEB-XXXXXX-XXXXXX`                 |
| Código de promoción          | _(vacío)_                                        |

→ botón **"Comprar el ticket"**. Si está gris, la línea de abajo dice qué falta:
_"Elige el evento, el tipo de ticket y quién paga para comprar."_

Aparece la tarjeta **"Ticket emitido"**: código QR, "Tipo de ticket: General",
**"Precio pagado: COP 150.000"**, "Promoción: Sin promoción", "Estado del cargo",
"Referencia".

### Escenario B · Compra con promoción → COP 135.000

1. Pulsar **"Generar otra referencia"** (si no, la API devuelve la compra idempotente
   y no cobra nada nuevo).
2. Escribir `VERANO10` en "Código de promoción" — o pulsar el **botón-chip
   `VERANO10`** de la lista "Promociones del evento:", que lo escribe solo.
3. → **"Comprar el ticket"**.

Resultado: **"Precio pagado: COP 135.000"** y "Promoción: **VERANO10**" (150.000 − 10%).

### Escenario C · Idempotencia

Sin cambiar nada → botón **"Reintentar con la misma referencia"**.

La pantalla responde: _"Esta compra ya existía: la misma referencia devolvió el
mismo ticket y no se cobró dos veces."_

La clave de idempotencia es el par **(pasarela, referencia)**: el servidor la busca
antes de cobrar y, si existe y es del mismo comprador, devuelve el mismo ticket con
HTTP 200 en vez de 201. Por eso ese botón no es un reintento: es una demostración.

### Escenario D · El 2x1 → COP 0

1. `/gestion/eventos/{id}` → "Editar" → "Promociones" → **"Nueva promoción"**:

   | Campo          | Valor                    |
   | -------------- | ------------------------ |
   | Código         | `DOSTICKETS`             |
   | Tipo           | `2x1`                    |
   | Valor          | `2`                      |
   | Vigencia desde | `01/11/2026 12:00 a. m.` |
   | Vigencia hasta | `01/01/2027 12:00 a. m.` |
   | Aplica a       | `General — COP 150.000`  |
   | Activa         | marcada                  |

2. Volver a `/compra?evento={id}`, **mismo comprador**, pulsar **"Generar otra
   referencia"**, escribir `DOSTICKETS` → **"Comprar el ticket"**.

Resultado: **"Precio pagado: COP 0"**. El 2x1 no es un descuento: es una segunda
entrada gratis para quien ya compró una del mismo tipo.

---

## Paso 6 · Reportes

`http://localhost:5173/reportes` → tarjeta "Evento del reporte" → escribir
`Sustentacion` en **"Buscar evento"** → pulsar **"Buscar"** (escribir no busca) →
elegir el evento en el desplegable "Evento".

### 6.1 Dashboard en vivo

| Dato               | Valor esperado                     |
| ------------------ | ---------------------------------- |
| Tickets vendidos   | 3                                  |
| Ingresos           | COP 285.000                        |
| Ocupación total    | 2%                                 |
| Aforo              | 150                                |
| Ocupación por tipo | General 3/100 (3%) · VIP 0/50 (0%) |

> El 2% total y el 3% de General no se contradicen: el aforo total suma los dos
> tipos (100 + 50 = 150) aunque solo se vendió de uno.

### 6.2 Cierre contable diario

| Campo     | Valor            |
| --------- | ---------------- |
| Desde     | `18/11/2026`     |
| **Hasta** | **`19/11/2026`** |

→ botón **"Aplicar"**. Resultado: una fila de día con **Pendiente 0 · Aprobada 3 ·
Rechazada 0 · Anulada 0 · Reembolsada 0** y **Neto COP 285.000**. En "Totales del
rango": Transacciones 3, Monto 285.000, Neto 285.000.

> **Trampa 6 — "Hasta" es el día siguiente.** Con `Desde` y `Hasta` en el mismo día
> el reporte sale **vacío** (0 días, totales en 0), aunque los datos existan. Es un
> defecto real del filtro: una fecha de calendario se interpreta como el **inicio**
> de ese día y el rango queda `[00:00, 00:00]`. Un "Hasta" debería incluir el día
> completo. Con `Hasta = 19/11` funciona.

"Pendientes sin confirmar" muestra 107 transacciones / 6.189.010: son del seed, no
de esta prueba.

### 6.3 Eventos más vendidos

Campo **"Límite"** → **50**.

El evento nuevo tiene 3 ventas y queda **#32 de 32** (el dataset tiene eventos con
~150). Con el "Límite 10" por defecto **no aparece**. Presentarlo como _"el ranking
agrega el evento nuevo con sus 3 ventas y su ocupación real"_.

### 6.4 Asistentes

Tres filas, todas de **Alejandro Escobar**:

| Tipo de ticket | Precio pagado | Promoción  | Estado  |
| -------------- | ------------- | ---------- | ------- |
| General        | 150.000       | —          | emitido |
| General        | 135.000       | VERANO10   | emitido |
| General        | 0             | DOSTICKETS | emitido |

Las tres columnas juntas son la demostración de las tres compras.

---

## Paso 7 · Exploradores

`http://localhost:5173/exploradores` → botones **"Usuarios" / "Tickets" /
"Transacciones" / "Auditoría"**

| Panel         | Filtros                                                                                        | Resultado                         |
| ------------- | ---------------------------------------------------------------------------------------------- | --------------------------------- |
| Tickets       | Estado `Emitido`, Evento = _(el id de la URL `/eventos/{id}`)_                                 | los 3 tickets                     |
| Transacciones | Estado `Aprobada`, Desde `18/11/2026`, **Hasta `19/11/2026`**                                  | 3 cargos                          |
| Auditoría     | Rol del actor `Asistente`, Tipo de sujeto `Ticket`, Desde `18/11/2026`, **Hasta `19/11/2026`** | 3 rastros `compra.ticket_emitido` |

> **Trampa 7 — el filtro "Evento" pide un id, no un nombre.** No hay desplegable:
> hay que copiar el id de la URL `/eventos/{id}`.
>
> La misma trampa del "Hasta" del 6.2 aplica a "Transacciones" y "Auditoría": es la
> misma API y el mismo filtro `$lte`.

En "Auditoría", el detalle de cada registro trae monto, pasarela, referencia y
código de promoción. Y la nota de la pantalla: _"Rastro de solo adición: se lee y se
añade, pero no se puede modificar ni borrar. La API responde 405 a un PATCH o a un
DELETE."_

---

## Paso 8 · El contrato

`http://localhost:5173/contrato` → el OpenAPI de la API (27 paths, 47 operaciones).

Remate: _"esta tarjeta de Configuración del formulario no tiene una lista de campos
escrita a mano: se construyó leyendo este esquema"_.

---

## Checklist de la sustentación

|     | Paso                                  | Evidencia en pantalla                 |
| --- | ------------------------------------- | ------------------------------------- |
| [ ] | Evento creado y **publicado**         | `/gestion/eventos` → estado Publicado |
| [ ] | Slug sin espacios                     | `sustentacion-eventix-2026`           |
| [ ] | Configuración con branding y encuesta | ficha → "Configuración del evento"    |
| [ ] | General **sin ventana de venta**      | habilita la compra                    |
| [ ] | VIP con ventana vigente               | muestra el otro mensaje               |
| [ ] | VERANO10 aplica a **General**         | columna "Aplica a"                    |
| [ ] | Compra sin promo → 150.000            | tarjeta "Ticket emitido"              |
| [ ] | Compra con promo → 135.000            | "Generar otra referencia" antes       |
| [ ] | Reintento idempotente                 | "no se cobró dos veces"               |
| [ ] | 2x1 → 0                               | mismo comprador                       |
| [ ] | Dashboard: 3 / 285.000 / 2%           | General 3%                            |
| [ ] | Cierre contable con **Hasta = 19/11** | Neto 285.000                          |
| [ ] | Ranking con **Límite 50**             | evento #32                            |
| [ ] | Auditoría: 3 rastros                  | `compra.ticket_emitido`               |

---

## Tabla de errores y qué hacer

| Mensaje en pantalla                                            | Código                        | Qué corregir                              |
| -------------------------------------------------------------- | ----------------------------- | ----------------------------------------- |
| "La venta de este tipo de ticket ya se cerró"                  | `venta_cerrada` (409)         | el General no tiene ventana; no lo edites |
| "Este evento no está publicado"                                | `evento_no_vendible` (409)    | "Editar evento" → Estado → Publicado      |
| "No quedan entradas de este tipo de ticket"                    | `aforo_agotado` (409)         | el aforo es 100                           |
| "La promoción X no aplica al tipo de ticket comprado"          | `no_aplica_al_tipo` (422)     | marcar la casilla "Aplica a"              |
| "La promoción X no está vigente"                               | `fuera_de_vigencia` (422)     | "Vigencia hasta" en el futuro             |
| "La promoción X aplica desde el segundo ticket del mismo tipo" | `2x1_sin_ticket_previo` (422) | el **mismo** comprador del Escenario A    |
| "Esta compra ya existía…"                                      | idempotencia                  | pulsar "Generar otra referencia"          |
| "Debe ser un slug en minúsculas…"                              | 422                           | quitar espacios del slug                  |
| "Debe ser un identificador hexadecimal de 24 caracteres"       | 422                           | organizador sin elegir (ver Trampa 2)     |
| El reporte de cierre sale vacío                                | Trampa 6                      | "Hasta" = día siguiente                   |

---

## Defectos encontrados en la prueba en vivo

No se corrigieron: quedan documentados como backlog en
[`docs/05-implementacion.md` §8.12-8.14](docs/05-implementacion.md).

1. **El filtro "Hasta" con fecha de calendario excluye el propio día.**
   `leerFecha` (`comun.ts:43`) convierte `"2026-11-18"` en `2026-11-18T00:00:00Z` y
   el filtro usa `$lte` (`transacciones.ts:100-102`): un rango del mismo día queda
   con ventana de ancho cero. Afecta al cierre contable, a transacciones y a
   auditoría.
2. **`DELETE /api/eventos/{id}` no hace cascada.** Borra el evento y deja tickets,
   transacciones y auditoría colgando. Los tickets y las transacciones sí se pueden
   borrar aparte (`DELETE /api/tickets/{id}`, `/api/transacciones/{id}`); la
   auditoría es append-only (405).
3. **La compra no tiene campo de cantidad.** El contrato compra **un** ticket por
   petición: no hay cantidad en la UI ni en el esquema. Para dos tickets, dos clics.

Aparte, un detalle de UX menor: el mensaje de validación de un campo de referencia
**vacío** ("Debe ser un identificador hexadecimal de 24 caracteres") describe un id
malformado, no un campo sin elegir, y el formulario no marca el organizador como
obligatorio.

---

## Preguntas que seguro te van a hacer

**"¿Por qué no usaste los eventos del seed?"**
Porque el dataset es una foto de 2023: sus ventanas de venta están cerradas y la
API rechaza la compra con `venta_cerrada` (409). Es la regla de negocio
(`compra.ts:173`), no un bug.

**"¿Cómo garantizás que no cobres dos veces?"**
La clave de idempotencia es el par (pasarela, referencia). El servidor la busca
antes de cobrar; si existe y es del mismo comprador, devuelve el mismo ticket con
200 en vez de 201. Se demuestra con "Reintentar con la misma referencia".

**"¿Qué pasa si dos personas compran el último ticket a la vez?"**
La reserva de cupo es un `findOneAndUpdate` atómico con filtro
`aforo_vendido < aforo_total` dentro de la transacción. El que pierde el filtro no
actualiza nada y la transacción aborta con `aforo_agotado` (409). No hay
sobreventa.

**"¿Y si la transacción se confirma y después falla la auditoría?"**
La auditoría se escribe **después** del commit, a propósito: si fallara dentro, la
compra entera se caería. Preferimos un rastro faltante antes que una venta perdida.

**"¿Cómo es posible que la UI muestre campos que no conoce?"**
La tarjeta "Configuración" se construye leyendo el esquema que la API publica en
`/api/openapi.json`. Si el dominio agrega un campo, aparece en pantalla sin tocar
el frontend.

**"¿Por qué no usaste un framework de formularios?"**
Porque el contrato es la fuente de la verdad y el editor genérico arma los controles
desde el esquema. Un framework con modelos fijos habría duplicado el contrato en el
cliente, que es justo lo que el modelo documental busca evitar.

**"¿Qué harías distinto?"**
Los tres defectos de arriba, que se encontraron en esta misma corrida.
