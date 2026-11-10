# Proceso de órdenes de compra SAP

Este documento es el conocimiento de negocio que el agente consulta. Describe el proceso as-is, los actores, el flujo objetivo, las reglas de control RC1–RC10 y el tratamiento de excepciones.

## Actores

| Actor | Rol | Interacción |
|---|---|---|
| Solicitante | Necesita comprar algo y envía el paquete por correo. | No usa el agente. |
| Líder aprobador | Aprueba el gasto respondiendo el correo con “Aprobado”. | No usa el agente. |
| Analista administrativa | Crea la OC en SAP. | Usuaria principal del chat; confirma excepciones. |
| Contabilidad / Auditoría | Controla el gasto y revisa el log. | Consume `out/control.csv` y las evidencias. |
| SAP | Sistema de registro. | Simulado por el adaptador local. |

## Paquete de entrada

Cada compra llega con tres piezas, más una factura opcional:

- `correo.json`: correo de solicitud con remitente, asunto, fecha y adjuntos.
- `solicitud.json`: Excel normalizado con solicitante, proveedor, descripción, centro de costo, subárea, cantidades, valores, moneda, IVA, condiciones de pago y fecha de solicitud.
- `cotizacion.txt`: cotización del proveedor con ítems, subtotal, IVA, total y validez.
- `aprobacion.json`: correo del líder; el cuerpo contiene o no la palabra “Aprobado”.
- `factura.txt`: solo en casos retroactivos; su fecha es anterior a la solicitud.

## Flujo objetivo

1. **Lectura**: normalizar el paquete y reportar adjuntos ausentes como `null`.
2. **Validación**: cruzar la solicitud contra los maestros de proveedores, centros de costo, indicadores de IVA y condiciones de pago.
3. **Clasificación**:
   - `bloqueos`: impiden crear la OC.
   - `confirmaciones`: permiten crear solo con confirmación humana explícita.
   - `derivados`: valores completados desde maestros que se informan al usuario.
4. **Construcción del payload**: generar la OC con posiciones numeradas 10, 20, … y descripción truncada a 40 caracteres.
5. **Evidencia**: generar el correo de aprobación como texto (P0) y PDF (P1), con hash SHA-256.
6. **Creación**: crear la OC en el SAP simulado con idempotencia por `solicitud_id` y registrar el intento en `out/control.csv`.

## Reglas de control

| Regla | Validación | Tipo |
|---|---|---|
| RC1 | El proveedor existe en el maestro (por NIT o nombre normalizado) y está activo. | Bloqueo |
| RC2 | Existe aprobación, contiene “Aprobado” y viene de un aprobador del centro de costo. | Bloqueo |
| RC3 | `valor_total` no supera el tope del aprobador para ese centro. | Bloqueo |
| RC4 | La subárea pertenece al centro de costo. | Bloqueo |
| RC5 | La cotización no difiere de la solicitud en más del 2 %. Sin cotización también requiere confirmación. | Confirmación |
| RC6 | Si falta `indicador_iva`, se deriva del proveedor y se pide confirmación. | Confirmación + derivado |
| RC7 | Si faltan `condiciones_pago`, se derivan del proveedor y solo se informa. | Derivado |
| RC8 | Si la factura es anterior a la solicitud, la OC es retroactiva y requiere confirmación. | Confirmación |
| RC9 | La fecha de aprobación debe ser igual o posterior a la fecha de solicitud; si no, requiere confirmación. | Confirmación |
| RC10 | `cantidad × valor_unitario` debe igualar `valor_total` con tolerancia de ±1. | Bloqueo |

## Excepciones y decisión

- Un **bloqueo** no se fuerza nunca: se devuelve al solicitante con la razón y la acción sugerida.
- Una **confirmación** se presenta al usuario con los valores en conflicto; el agente espera una respuesta explícita antes de crear.
- Un **derivado** se completa automáticamente y se informa para que quede en el historial.
- La creación con confirmaciones pendientes sin `confirmado: true` se rechaza y queda registrada como `pendiente` en el log de control.
- Una OC retroactiva se permite solo con confirmación y queda marcada `retroactiva = true` en `out/control.csv` para medir el desvío.

## Evidencia y auditoría

- `out/<caso>/trazabilidad.json` mapea cada campo del payload a su fuente: `solicitud`, `cotizacion`, `maestro.*`, `derivado` o `constante`.
- `out/<caso>/aprobacion.txt` y `aprobacion.pdf` contienen encabezados (de, para, fecha, asunto), cuerpo y hash SHA-256.
- `out/sap/ordenes.jsonl` guarda una línea por OC creada.
- `out/control.csv` registra cada intento con `solicitud_id, resultado, numero_oc, retroactiva, bloqueos, confirmaciones, ts`.
- `out/log.jsonl` registra todas las llamadas a herramientas y los errores.

## Idempotencia

Crear dos veces la misma `solicitud_id` devuelve el número de OC existente con `idempotente: true`; no se escribe una segunda orden. Esto protege reintentos del usuario o del modelo.
