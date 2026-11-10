# Spec Delta

## Purpose

Implementa las herramientas de negocio que el agente invoca para procesar órdenes de compra: lectura del paquete de documentos, validación contra maestros y reglas de control, construcción del payload con trazabilidad, generación de evidencia de aprobación, y creación de la orden en el SAP simulado. Cada herramienta sigue el contrato `{ description, args (zod), execute(args, ctx) }` y es importable directamente desde `demo.ts` sin depender del servidor.

## ADDED Requirements

### Requirement: Lectura de paquete normalizado
La herramienta `oc_leer_paquete` SHALL recibir un caso (nombre de carpeta en `fixtures/reto-03/solicitudes/`) y devolver un paquete normalizado con correo, solicitud, cotización, aprobación, y factura opcional, todos parseados y estructurados según el tipo `Paquete`. Un adjunto ausente SHALL reportarse como `null` sin lanzar excepción.

#### Scenario: Paquete completo
- **WHEN** se invoca con `caso: "sol-001"`
- **THEN** devuelve `{ correo, solicitud, cotizacion, aprobacion }` con todos los campos poblados y normalizados

#### Scenario: Adjunto ausente
- **WHEN** se invoca con un caso que no tiene archivo de factura
- **THEN** devuelve `factura: null` en el paquete sin error

#### Scenario: Caso inexistente
- **WHEN** se invoca con un nombre de caso que no existe en fixtures
- **THEN** devuelve `{ ok: false, error: "..." }` con mensaje legible sin lanzar excepción

### Requirement: Validación contra maestros y reglas de control
La herramienta `oc_validar` SHALL aplicar las 10 reglas de control (RC1-RC10) contra el paquete y los maestros, y devolver `{ apta: boolean, bloqueos: string[], confirmaciones: string[], derivados: object, retroactiva: boolean }`. Los bloqueos impiden crear la OC. Las confirmaciones requieren permiso humano. Los derivados son valores completados automáticamente que se informan.

#### Scenario: Caso apto sin excepciones (sol-001)
- **WHEN** se valida el paquete de sol-001 con todos los datos correctos
- **THEN** devuelve `apta: true`, `bloqueos: []`, `confirmaciones: []`, y los derivados con condiciones de pago del proveedor

#### Scenario: Proveedor inexistente (RC1 - sol-002)
- **WHEN** se valida un paquete cuyo proveedor no existe en maestros
- **THEN** devuelve `apta: false` y `bloqueos` con un mensaje indicando que el proveedor no existe

#### Scenario: Aprobador sin autoridad (RC2/RC3 - sol-003)
- **WHEN** se valida un paquete donde el aprobador no tiene autoridad para ese centro de costo o el valor excede su tope
- **THEN** devuelve `apta: false` y `bloqueos` con el motivo específico

#### Scenario: Discrepancia cotización/solicitud (RC5 - sol-004)
- **WHEN** la diferencia entre cotización y solicitud supera el 2%
- **THEN** devuelve `apta: true` pero `confirmaciones` con ambos valores para que el agente pregunte al usuario

#### Scenario: Factura retroactiva (RC8 - sol-005)
- **WHEN** existe factura con fecha anterior a la solicitud
- **THEN** devuelve `retroactiva: true` y `confirmaciones` indicando que es una OC retroactiva

#### Scenario: IVA no informado (RC6 - sol-006)
- **WHEN** el indicador IVA está ausente en la solicitud
- **THEN** deriva el valor del proveedor, lo incluye en `derivados`, y agrega una confirmación solicitando validación

### Requirement: Construcción de payload con trazabilidad
La herramienta `oc_construir_payload` SHALL recibir el paquete y los derivados, y producir un objeto `OrdenCompra` válido contra su esquema zod. Todo valor del payload SHALL ser trazable a una fuente (solicitud, cotización, maestro, o derivado). La trazabilidad SHALL guardarse en `out/<caso>/trazabilidad.json`.

#### Scenario: Payload válido
- **WHEN** se construye el payload para sol-001
- **THEN** devuelve un objeto con sociedad "1000", organización de compras "1000", proveedor con código SAP, posiciones numeradas (10, 20...), y todos los campos requeridos

#### Scenario: Trazabilidad completa
- **WHEN** se construye el payload
- **THEN** genera `out/<caso>/trazabilidad.json` mapeando cada campo del payload a su fuente de origen

#### Scenario: Descripción con límite SAP
- **WHEN** la descripción de la solicitud supera 40 caracteres
- **THEN** trunca la descripción en la posición a máximo 40 caracteres y registra la truncación en trazabilidad

### Requirement: Generación de evidencia de aprobación
La herramienta `oc_generar_evidencia` SHALL generar la evidencia del correo de aprobación. En prioridad P0 SHALL crear `out/<caso>/aprobacion.txt` con encabezados (de, para, fecha, asunto), cuerpo, y hash SHA-256 del contenido. En prioridad P1 SHALL además generar `out/<caso>/aprobacion.pdf` con el mismo contenido usando `pdf-lib`.

#### Scenario: Evidencia en texto (P0)
- **WHEN** se genera evidencia para sol-001
- **THEN** crea `out/sol-001/aprobacion.txt` con formato legible y devuelve `{ ruta, sha256 }`

#### Scenario: Evidencia en PDF (P1)
- **WHEN** se genera evidencia para sol-001
- **THEN** crea `out/sol-001/aprobacion.pdf` con encabezados y cuerpo formateados, y devuelve la ruta

#### Scenario: Aprobación ausente
- **WHEN** el paquete no tiene aprobación (es `null`)
- **THEN** devuelve `{ ok: false, error: "..." }` indicando que no hay aprobación para generar evidencia

### Requirement: Creación de OC con idempotencia
La herramienta `oc_crear` SHALL crear la orden en el SAP simulado solo si `apta: true` y (no hay confirmaciones o `confirmado: true`). El adaptador SHALL asignar número secuencial desde `4500000001`, escribir en `out/sap/ordenes.jsonl`, y devolver `{ numero_oc, fecha, idempotente: boolean }`. Invocar la herramienta dos veces con el mismo `solicitud_id` SHALL devolver el número existente sin crear una segunda OC.

#### Scenario: Creación exitosa
- **WHEN** se crea una OC para sol-001 con payload válido
- **THEN** devuelve `{ numero_oc: "4500000001", fecha: "...", idempotente: false }` y escribe la orden en el JSONL

#### Scenario: Idempotencia
- **WHEN** se invoca `oc_crear` dos veces con el mismo `solicitud_id`
- **THEN** la primera invocación crea la OC y la segunda devuelve el mismo número con `idempotente: true`

#### Scenario: Creación sin confirmación
- **WHEN** hay confirmaciones pendientes y `confirmado` no es `true`
- **THEN** devuelve `{ ok: false, error: "..." }` sin crear la OC

#### Scenario: Registro en log de control
- **WHEN** se intenta crear una OC (exitosa, bloqueada o pendiente)
- **THEN** agrega una fila a `out/control.csv` con `solicitud_id, resultado, numero_oc, retroactiva, bloqueos, confirmaciones, ts`

### Requirement: Contrato de herramientas tipado
Cada herramienta SHALL ser un objeto exportado con tres miembros: `description` (una frase precisa), `args` (objeto de esquemas zod con `.describe()` en cada campo), y `execute(args, ctx)` que devuelve string JSON con `{ ok: true, data }` o `{ ok: false, error }`. Las herramientas NO SHALL lanzar excepciones; los errores se capturan y devuelven como resultado. Las herramientas SHALL ser importables desde `demo.ts` sin depender del servidor HTTP.

#### Scenario: Validación de argumentos
- **WHEN** el modelo invoca una herramienta con argumentos que no cumplen el schema zod
- **THEN** el backend valida antes de ejecutar y devuelve el error de validación al modelo sin ejecutar la herramienta

#### Scenario: Herramienta importable
- **WHEN** se importa `leer_paquete` desde `src/tools/oc.ts` en `demo.ts`
- **THEN** se puede invocar directamente pasando `{ caso: "sol-001" }` y un contexto con `directory` y `sessionId`

### Requirement: Herramienta opcional de lectura de Excel
La herramienta `oc_leer_excel` SHALL leer un archivo `.xlsx` real y devolver sus filas normalizadas. Esta herramienta es prioritaria P1 y opcional; si no se implementa, el sistema SHALL funcionar con los fixtures ya normalizados en JSON.

#### Scenario: Lectura de Excel real
- **WHEN** se invoca con `ruta: "fixtures/reto-03/solicitudes/sol-001/solicitud.xlsx"`
- **THEN** devuelve `{ filas: [...] }` con los datos parseados del Excel
