# Spec Delta

## Purpose

Define la interfaz de abstracción para interactuar con SAP y su implementación mock basada en archivos. Permite que las herramientas creen órdenes de compra sin depender de una conexión real a SAP, facilitando pruebas y desarrollo. Incluye el diseño documentado para una implementación real futura.

## ADDED Requirements

### Requirement: Interfaz SapAdapter
El sistema SHALL definir una interfaz `SapAdapter` en `src/sap/adapter.ts` con tres métodos: `consultarProveedor(nit)` que devuelve código SAP y estado activo, `crearOrden(orden)` que devuelve número de OC y fecha, y `buscarOrdenPorReferencia(solicitud_id)` que devuelve el número de OC existente o null.

#### Scenario: Consulta de proveedor existente
- **WHEN** se consulta un proveedor con NIT válido
- **THEN** devuelve `{ codigo_sap: "100234", activo: true }` o null si no existe

#### Scenario: Búsqueda de orden por referencia
- **WHEN** se busca una OC por `solicitud_id` que ya fue creada
- **THEN** devuelve `{ numero_oc: "4500000001" }` o null si no existe

### Requirement: Implementación mock sobre archivos
La implementación mock en `src/sap/mock.ts` SHALL escribir las órdenes en `out/sap/ordenes.jsonl` (una línea JSON por orden) y mantener idempotencia buscando por referencia antes de crear. Los números de OC SHALL ser secuenciales comenzando desde `4500000001`.

#### Scenario: Primera orden creada
- **WHEN** se crea la primera OC del sistema
- **THEN** asigna número `4500000001` y escribe la línea en `ordenes.jsonl`

#### Scenario: Segunda orden creada
- **WHEN** se crea una segunda OC
- **THEN** asigna número `4500000002` preservando la primera

#### Scenario: Idempotencia en mock
- **WHEN** se intenta crear una OC con un `solicitud_id` ya existente
- **THEN** no escribe una nueva línea y devuelve el número existente

### Requirement: Diseño documentado de adaptador real
El archivo `SOLUCION.md` SHALL incluir una sección que describa la implementación real del adaptador SAP, incluyendo: opción de integración elegida (OData `API_PURCHASEORDER_PROCESS_SRV`, RFC/BAPI `BAPI_PO_CREATE1`, SAP Integration Suite, o carga por archivo), mapeo del payload a la estructura real, estrategia de autenticación, manejo de idempotencia frente a reintentos, y plan B si la conexión no es viable.

#### Scenario: Diseño OData seleccionado
- **WHEN** se documenta la implementación real
- **THEN** justifica por qué se eligió OData (u otra opción) dada la viabilidad no confirmada, describe el mapeo de campos, y explica cómo se manejarían errores parciales

#### Scenario: Plan B documentado
- **WHEN** la conexión a SAP no es viable
- **THEN** el diseño describe cómo el agente ahorra tiempo generando la OC lista para pegar o un archivo de carga masiva

### Requirement: Log de control en CSV
El sistema SHALL mantener un archivo `out/control.csv` con una fila por cada intento de creación de OC (exitoso, bloqueado o pendiente), incluyendo: `solicitud_id`, `resultado`, `numero_oc`, `retroactiva`, `bloqueos`, `confirmaciones`, y `ts` (timestamp).

#### Scenario: Intento exitoso
- **WHEN** se crea exitosamente una OC para sol-001
- **THEN** agrega fila: `sol-001,exitoso,4500000001,false,,,2026-11-10T...`

#### Scenario: Intento bloqueado
- **WHEN** se intenta crear una OC pero hay bloqueos
- **THEN** agrega fila: `sol-002,bloqueado,,,false,"RC1: proveedor no existe",,2026-11-10T...`

#### Scenario: Intento pendiente de confirmación
- **WHEN** se intenta crear una OC pero requiere confirmación
- **THEN** agrega fila: `sol-004,pendiente,,,false,,"RC5: discrepancia cotización",2026-11-10T...`
