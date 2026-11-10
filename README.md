# Agente de Órdenes de Compra SAP

Agente conversacional que automatiza la preparación y creación de órdenes de compra en un SAP simulado. Lee el paquete de documentos (solicitud, cotización, aprobación y factura opcional), valida contra los maestros, construye el payload de la OC, genera la evidencia de aprobación en TXT y PDF, y crea la orden con idempotencia.

**Proveedor LLM:** OpenCode Go (`https://opencode.ai/inference/go/openai/v1`) · **Modelo:** `deepseek-v4.1-flash` (DeepSeek V4.1 Flash).

Proyecto del reto técnico 03 de Periferia IT Group. La solución completa está documentada en [`SOLUCION.md`](./SOLUCION.md).

## Arquitectura

```
Frontend React (web/)
   │  POST /api/chat (SSE) · GET /api/sessions/:id · /api/cases · /api/files/...
   ▼
Backend Hono (src/server.ts)
   ├── Ciclo del agente (src/agent/loop.ts) ── Adaptador LLM (src/llm/opencode.ts)
   ├── Herramientas zod (src/tools/oc.ts)
   ├── Adaptador SAP mock (src/sap/mock.ts)
   └── Sesiones en archivos (out/sessions/)
        │
        ├── fixtures/ (solo lectura)
        └── out/ (trazabilidad, evidencia, órdenes, log de control)
```

- **Comportamiento**: `agent/prompt.md`.
- **Conocimiento**: `src/knowledge/ordenes-compra.md`.
- **Ejecución**: `src/tools/`.
- **Demo sin modelo**: `demo.ts`.

## Requisitos

- Node.js 20 o superior (probado con Node 24).
- npm.
- Opcional: Bun 1.x para ejecutar el demo, Docker 24+ para contenedores.
- Opcional: una API key de DeepSeek para el chat con LLM.

## Puesta en marcha local

```bash
cp .env.example .env          # completa OPENCODE_API_KEY si quieres usar el chat
npm install
npm --prefix web install
npm run dev                   # backend en http://localhost:3000
```

En otra terminal, para el frontend con recarga en caliente:

```bash
npm --prefix web run dev      # http://localhost:5173 (proxy /api -> :3000)
```

Para producción local:

```bash
npm run build
npm start                     # sirve API + web/dist en http://localhost:3000
```

### Variables de entorno

| Variable | Ejemplo | Descripción |
|---|---|---|
| `OPENCODE_API_KEY` | `sk-...` | Clave de OpenCode Go. Solo backend; nunca en el front ni en logs. |
| `PORT` | `3000` | Puerto HTTP del backend. |
| `MODEL_ID` | `deepseek-v4.1-flash` | Modelo DeepSeek V4.1 Flash servido por OpenCode Go. |
| `MAX_ITERATIONS` | `25` | Tope de iteraciones herramienta → modelo por turno. |
| `MAX_TOKENS_PER_SESSION` | `500000` | Tope de tokens por sesión. |

Sin `OPENCODE_API_KEY`, `/api/health` y el demo funcionan; `/api/chat` responde 503 con un mensaje claro.

## Demo sin modelo

Procesa los 6 casos de `fixtures/reto-03/solicitudes/` llamando directamente a las herramientas, sin API key:

```bash
npx tsx demo.ts
# o con Bun:
bun run demo.ts
```

Salida esperada (resumida):

```
=== sol-001 ===
apta: true
bloqueos: ninguno
confirmaciones: ninguna
retroactiva: false
evidencia: out/sol-001/aprobacion.txt + out/sol-001/aprobacion.pdf
payload: out/sol-001/trazabilidad.json
OC: 4500000001 · idempotente: false

=== sol-002 ===
apta: false
bloqueos:
  - RC1: el proveedor "Soluciones Digitales del Norte S.A.S." no existe en el maestro de proveedores.

=== sol-004 ===
confirmaciones:
  - RC5: la cotización (26.500.000) difiere de la solicitud (25.000.000) en 6.00%.
Usuario (simulado): confirmo las excepciones y autorizo la creación.
OC: 4500000002

=== sol-001 (segunda ejecución: idempotencia) ===
OC: 4500000001 · idempotente: true
```

Casos cubiertos:

| Caso | Resultado esperado |
|---|---|
| `sol-001` | OC creada sin intervención. Segunda ejecución idempotente. |
| `sol-002` | Bloqueada por RC1 (proveedor inexistente). |
| `sol-003` | Bloqueada por RC2 (aprobador no autorizado para el centro). |
| `sol-004` | Confirmación RC5 (cotización 6 % mayor) y creación tras confirmar. |
| `sol-005` | OC retroactiva con confirmación RC8. |
| `sol-006` | IVA derivado del proveedor con confirmación RC6. |

El demo limpia `out/` al inicio, salvo `out/sessions/`.

## Tests

```bash
npm test          # Vitest, 76 tests
npm run test:watch
npm run typecheck # backend + frontend
```

Cobertura: esquemas zod y contrato de herramientas, RC1–RC10 contra los 6 fixtures, lectura de paquete, payload y trazabilidad, evidencia TXT/PDF con hash, creación e idempotencia, adaptador SAP y CSV de control, ciclo del agente con LLM simulado (incluye tope de iteraciones y confirmación), sesiones persistentes, API HTTP/SSE, manejo de errores sin filtrar secretos y flujo end-to-end sin modelo.

## API HTTP

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/chat` | `{ sessionId?, message }`. Con `Accept: text/event-stream` responde SSE (`token`, `tool_start`, `tool_end`, `confirmation`, `done`). Con `stream: false` responde JSON. |
| `GET` | `/api/sessions/:id` | Historial completo de una sesión. |
| `GET` | `/api/sessions` | Lista de sesiones. |
| `GET` | `/api/health` | `{ ok: true, provider: "deepseek", model }` sin claves. |
| `GET` | `/api/cases` | Casos procesados, combinando `out/control.csv` y `out/sap/ordenes.jsonl`. |
| `GET` | `/api/files/:caso/:archivo` | Descarga de `trazabilidad.json`, `aprobacion.txt`, `aprobacion.pdf`. |
| `GET` | `/api/control.csv` | Descarga del log de control. |

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Procesa sol-001","stream":false}'
```

## Docker

```bash
docker compose up --build
# http://localhost:3000
```

El `Dockerfile` es multi-stage (dependencias → build TypeScript + Vite → runtime con dependencias de producción). `docker-compose.yml` monta `out/` para persistir resultados y `fixtures/` en solo lectura.

## Deploy en Railway

1. Crea un proyecto en Railway y conecta el repositorio.
2. Railway detecta `railway.json` y construye con el `Dockerfile`.
3. Configura las variables de `/.env.example` en **Variables** (especialmente `OPENCODE_API_KEY`).
4. Verifica el healthcheck en `/api/health`.
5. El comando de inicio es `node dist/index.js` y el puerto se toma de `PORT`.

Link de prueba: **_(completar con la URL pública al desplegar)_**.
Si el deploy no está disponible durante la defensa, la aplicación se ejecuta localmente con `docker compose up` o `npm run dev`.

## Módulo reutilizable (bonus)

La carpeta [`modulo/`](./modulo) empaqueta el agente sin depender del servidor HTTP:

```
modulo/
├── agent.md                        # frontmatter + system prompt
├── tools/oc.ts                     # re-exporta las mismas herramientas de src/tools/oc.ts
└── skill/ordenes-compra/SKILL.md   # frontmatter + conocimiento del proceso
```

Importación standalone:

```ts
import { leer_paquete, validar } from "./modulo/tools/oc.js";

const ctx = { directory: process.cwd(), sessionId: "script" };
const read = JSON.parse(await leer_paquete.execute({ caso: "sol-001" }, ctx));
const validation = JSON.parse(
  await validar.execute({ caso: "sol-001", paquete: read.data }, ctx),
);
console.log(validation.data.apta);
```

`agent.md` se puede cargar en plataformas que acepten agentes en Markdown y `SKILL.md` como skill de conocimiento. Un test de consistencia verifica que no divergen de `agent/prompt.md` ni de `src/knowledge/ordenes-compra.md`.

## Seguridad

- `OPENCODE_API_KEY` vive solo en `.env` del backend (ignorado por Git y Docker).
- El frontend no recibe claves; `/api/health` solo devuelve proveedor y modelo.
- Los logs y respuestas de error se redactan si contienen la clave.
- Las herramientas no ejecutan comandos de shell y resuelven rutas desde `ctx.directory`.
- `/api/files` valida el caso y el nombre de archivo para evitar path traversal.

## Estructura

```
agent/prompt.md               System prompt
src/types.ts                  Tipos de dominio
src/schemas/                  Esquemas zod
src/tools/                    Contrato y herramientas de negocio
src/sap/                      SapAdapter, mock y log de control
src/llm/                      Interfaz LLM y adaptador DeepSeek
src/agent/                    Loop, confirmación y sesiones
src/knowledge/                Conocimiento del proceso
src/server.ts, src/index.ts   API y entrada
web/                          Frontend React + Vite
tests/                        Vitest (tools, agent, sap, e2e)
modulo/                       Paquete reutilizable (bonus)
fixtures/                     Datos de prueba (solo lectura)
out/                          Resultados generados
demo.ts                       Demo sin modelo
```
