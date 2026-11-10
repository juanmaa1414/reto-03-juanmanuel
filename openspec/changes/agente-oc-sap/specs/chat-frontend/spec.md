# Spec Delta

## Purpose

Interfaz web React que permite a la analista conversar con el agente, ver el progreso de las operaciones en tiempo real, revisar casos procesados anteriormente, y descargar archivos resultado. Implementa streaming de respuestas y visualización estructurada de tool calls.

## ADDED Requirements

### Requirement: Componente de chat con historial
El frontend SHALL renderizar un componente de chat que muestre el historial completo de la conversación, incluyendo mensajes del usuario, respuestas del agente, y tool calls intermedios. Cada mensaje SHALL estar diferenciado visualmente por rol (usuario/agente/sistema).

#### Scenario: Conversación con múltiples turnos
- **WHEN** el usuario procesa sol-001 con confirmación intermedia
- **THEN** el chat muestra: mensaje del usuario, respuesta del agente pidiendo confirmación, confirmación del usuario, respuesta final con número de OC

#### Scenario: Tool calls visibles
- **WHEN** el agente ejecuta oc_leer_paquete, oc_validar, etc.
- **THEN** el chat muestra cada tool call con nombre, argumentos, y resultado resumido en formato colapsable

### Requirement: Streaming de respuestas
El frontend SHALL consumir respuestas SSE (Server-Sent Events) del endpoint `/api/chat` y renderizar tokens incrementalmente a medida que llegan, mostrando un indicador de "pensando" mientras el agente procesa.

#### Scenario: Respuesta en streaming
- **WHEN** el agente genera una respuesta de 500 tokens
- **THEN** los tokens aparecen progresivamente en el chat con animación suave, no como bloque completo

#### Scenario: Indicador de procesamiento
- **WHEN** el usuario envía un mensaje y el agente está ejecutando tool calls
- **THEN** se muestra un indicador visual (spinner o "Pensando...") hasta que llega la respuesta

### Requirement: Estado de confirmación resaltado
El frontend SHALL detectar cuando el agente devuelve `needsConfirmation: true` y resaltar visualmente el mensaje de confirmación, mostrando botones de acción claros (Confirmar/Cancelar) o un campo de entrada destacado.

#### Scenario: Confirmación requerida
- **WHEN** el agente pregunta "¿Confirmas la creación con discrepancia del 5%?"
- **THEN** el mensaje se muestra con fondo destacado, bordes visibles, y botones de acción para confirmar o cancelar

#### Scenario: Confirmación completada
- **WHEN** el usuario confirma
- **THEN** el estado de confirmación desaparece y el agente continúa ejecutando

### Requirement: Panel lateral de casos procesados
El frontend SHALL mostrar un panel lateral izquierdo con la lista de casos que han sido procesados anteriormente, incluyendo solicitud_id, fecha, estado (exitoso/bloqueado/pendiente), y número de OC si aplica. El panel SHALL actualizarse automáticamente cuando se procesa un nuevo caso.

#### Scenario: Lista de casos procesados
- **WHEN** se han procesado sol-001, sol-002, sol-004
- **THEN** el panel muestra tres entradas con sus estados: sol-001 (exitoso, OC 4500000001), sol-002 (bloqueado), sol-004 (pendiente de confirmación)

#### Scenario: Acceso a caso anterior
- **WHEN** el usuario hace clic en sol-001 en el panel lateral
- **THEN** el chat carga el historial completo de esa sesión y permite revisar las tool calls y respuestas

### Requirement: Descarga de archivos resultado
El frontend SHALL proporcionar enlaces de descarga para los archivos generados en cada caso procesado: trazabilidad.json, aprobacion.txt, aprobacion.pdf (si existe), y el registro en control.csv. Los enlaces SHALL estar disponibles tanto en la conversación actual como en casos anteriores.

#### Scenario: Descarga desde conversación activa
- **WHEN** se completa el procesamiento de sol-001
- **THEN** el chat muestra enlaces descargables para: trazabilidad.json, aprobacion.txt, aprobacion.pdf

#### Scenario: Descarga desde caso anterior
- **WHEN** el usuario accede a sol-001 desde el panel lateral
- **THEN** puede descargar todos los archivos resultado de ese caso

### Requirement: Campo de entrada de mensajes
El frontend SHALL proporcionar un campo de texto para que el usuario escriba mensajes, con soporte para envío mediante Enter o botón. El campo SHALL deshabilitarse mientras el agente está procesando y habilitarse cuando puede recibir input.

#### Scenario: Envío de mensaje
- **WHEN** el usuario escribe "procesá sol-001" y presiona Enter
- **THEN** el mensaje se envía a `/api/chat` con el sessionId actual y el campo se limpia

#### Scenario: Campo deshabilitado durante procesamiento
- **WHEN** el agente está ejecutando tool calls
- **THEN** el campo de entrada se deshabilita y muestra estado "Procesando..."

### Requirement: Manejo de errores de conexión
El frontend SHALL manejar errores de conexión al backend mostrando mensajes claros al usuario sin romper la interfaz. Si la conexión se pierde durante streaming, SHALL mostrar el error y permitir reintentar.

#### Scenario: Error de conexión
- **WHEN** el backend no responde o hay error de red
- **THEN** el chat muestra "Error de conexión. Por favor intentá nuevamente." sin perder el historial previo

#### Scenario: Timeout del agente
- **WHEN** el agente tarda más de 30 segundos en responder
- **THEN** se muestra un mensaje de timeout con opción de reintentar

### Requirement: Diseño responsivo
El frontend SHALL ser responsivo, funcionando correctamente en pantallas de escritorio (con panel lateral visible) y móviles (panel lateral colapsable o accesible mediante menú).

#### Scenario: Vista de escritorio
- **WHEN** se accede desde pantalla ancha (>768px)
- **THEN** el panel lateral de casos procesados es visible junto al chat

#### Scenario: Vista móvil
- **WHEN** se accede desde pantalla estrecha (<768px)
- **THEN** el panel lateral se oculta y es accesible mediante botón de menú
