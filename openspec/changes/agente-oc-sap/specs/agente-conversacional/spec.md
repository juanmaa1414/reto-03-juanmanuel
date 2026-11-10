# Spec Delta

## Purpose

Orquesta el ciclo conversacional del agente: recibe mensajes del usuario, invoca al modelo de lenguaje con las herramientas disponibles, ejecuta tool calls en loop hasta que el modelo responde con texto, gestiona la confirmación humana y mantiene sesiones persistentes entre requests.

## ADDED Requirements

### Requirement: Ciclo del agente con tope de iteraciones
El sistema SHALL ejecutar un loop que envía mensajes al modelo, ejecuta tool calls, y reinyecta resultados hasta que el modelo responda sin tool calls o se alcance el tope configurable de iteraciones (por defecto 25). Al alcanzar el tope, el sistema SHALL devolver al usuario un resumen de lo procesado y lo pendiente.

#### Scenario: Caso feliz sin confirmaciones
- **WHEN** el usuario envía "procesá sol-001" y todas las validaciones son aptas
- **THEN** el agente ejecuta las 5 herramientas en secuencia (leer, validar, construir, evidencia, crear) y devuelve el número de OC sin intervención humana

#### Scenario: Tope de iteraciones alcanzado
- **WHEN** el modelo solicita tool calls más allá de las 25 iteraciones
- **THEN** el agente detiene el loop y responde con lo que tiene y lo que falta, sin romper la sesión

### Requirement: Confirmación humana
El sistema SHALL pausar el turno cuando el modelo identifica una situación que requiere confirmación, devolviendo el estado `needsConfirmation: true` al frontend. El agente NO SHALL ejecutar herramientas de creación hasta que el usuario confirme explícitamente en un mensaje posterior.

#### Scenario: Confirmación por discrepancia cotización/solicitud
- **WHEN** el agente detecta que la cotización difiere de la solicitud en más del 2%
- **THEN** pausa el turno, muestra ambos valores al usuario, y espera confirmación antes de construir el payload y crear la OC

#### Scenario: Usuario no confirma
- **WHEN** el usuario responde negativamente a una solicitud de confirmación
- **THEN** el agente aborta la creación y registra el motivo en el log de control

### Requirement: Adaptador LLM propio
El sistema SHALL exponer una interfaz propia `enviar(mensajes, herramientas) → respuesta` que abstraiga el proveedor LLM. Cambiar de proveedor NO SHALL requerir modificar el ciclo del agente. La implementación actual SHALL usar Vercel AI SDK conectándose a DeepSeek API vía el SDK de OpenAI con `baseURL: https://api.deepseek.com` y modelo `deepseek-flash`.

#### Scenario: Cambio de proveedor
- **WHEN** se reemplaza la implementación del adaptador por otra que use Anthropic
- **THEN** el ciclo del agente y las herramientas permanecen sin cambios

#### Scenario: Timeout del proveedor
- **WHEN** el proveedor LLM no responde dentro del timeout configurado
- **THEN** el agente devuelve un error legible al usuario y la sesión continúa viva

### Requirement: Gestión de sesiones en archivos
El sistema SHALL persistir las sesiones como archivos JSON en `out/sessions/`. Cada sesión SHALL tener un identificador único y almacenar el historial completo de mensajes, tool calls y respuestas. Las sesiones DEBERÁN persistir entre reinicios del servidor.

#### Scenario: Recuperación de sesión tras reinicio
- **WHEN** el servidor se reinicia y el usuario envía un mensaje con un sessionId existente
- **THEN** el agente carga el historial completo desde el archivo y continúa la conversación

#### Scenario: Nueva sesión
- **WHEN** el usuario envía un mensaje con un sessionId inexistente
- **THEN** el sistema crea una nueva sesión con historial vacío y la persiste en archivo

### Requirement: API HTTP del chat
El sistema SHALL exponer tres endpoints HTTP: `POST /api/chat` para enviar mensajes y recibir respuestas, `GET /api/sessions/:id` para obtener el historial completo de una sesión, y `GET /api/health` para verificar el estado del servicio sin exponer claves.

#### Scenario: Chat con streaming
- **WHEN** el frontend envía un mensaje a `/api/chat`
- **THEN** el backend responde con un stream de eventos SSE que incluye tokens de texto, tool calls intermedios, y el estado final (incluyendo `needsConfirmation` si aplica)

#### Scenario: Health check
- **WHEN** se consulta `GET /api/health`
- **THEN** responde `{ ok: true, provider: "deepseek", model: "deepseek-flash" }` sin exponer la API key

### Requirement: System prompt en archivo separado
El comportamiento del agente SHALL definirse en un archivo `agent/prompt.md` en formato Markdown, no embebido en código. El conocimiento del proceso SHALL vivir en `src/knowledge/ordenes-compra.md`. Un cambio de reglas de negocio NO SHALL tocar el servidor.

#### Scenario: Modificación de reglas de negocio
- **WHEN** se actualiza el prompt en `agent/prompt.md` para cambiar el comportamiento del agente
- **THEN** el cambio se aplica sin modificar código del servidor ni de las herramientas

### Requirement: Registro de tool calls y errores
El sistema SHALL registrar toda llamada a herramienta en el historial visible del chat y en `out/log.jsonl`. Los errores de herramientas o del proveedor LLM SHALL mostrarse en lenguaje claro en el chat sin terminar la sesión.

#### Scenario: Error de herramienta
- **WHEN** una herramienta devuelve `{ ok: false, error: "..." }`
- **THEN** el error se incluye en el historial y el modelo decide cómo informar al usuario, pero la sesión continúa

#### Scenario: Log persistente
- **WHEN** el agente procesa un caso
- **THEN** cada tool call (nombre, argumentos, resultado resumido) se registra como línea en `out/log.jsonl`

### Requirement: Seguridad de la API key
La clave del modelo SHALL vivir exclusivamente en variable de entorno del backend (`DEEPSEEK_API_KEY`). La key NO SHALL aparecer en el frontend, el repositorio, los logs ni las respuestas de la API. Las herramientas NO SHALL ejecutar comandos de shell.

#### Scenario: Frontend no recibe la key
- **WHEN** el frontend se carga en el navegador
- **THEN** no contiene referencia alguna a la API key ni en el código ni en las variables expuestas
