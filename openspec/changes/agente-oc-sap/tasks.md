# Tasks

## 1. Configuración inicial del proyecto

- [x] 1.1 Create `package.json` with project metadata, scripts (`dev`, `build`, `start`, `test`, `demo`), and dependencies (`ai`, `openai`, `zod`, `hono`, `@hono/node-server`, `pdf-lib`, `react`, `react-dom`, `tsx`). Install all dependencies with `npm install` and verify `node_modules/` is created.
- [x] 1.2 Create directory structure: `agent/`, `src/` (with subdirs `llm/`, `tools/`, `sap/`, `knowledge/`), `web/` (with subdirs `src/`, `public/`), `modulo/` (with subdirs `tools/`, `skill/ordenes-compra/`), `tests/`, `out/`. Verify all directories exist.
- [x] 1.3 Create `.env.example` with variables `OPENCODE_API_KEY=`, `PORT=3000`, `MODEL_ID=deepseek-v4.1-flash`, `MAX_ITERATIONS=25`, `MAX_TOKENS_PER_SESSION=500000`. Create `.env` with actual values and verify it is listed in `.gitignore` along with `node_modules/`, `out/`, and `.env`.
- [x] 1.4 Create `tsconfig.json` with strict TypeScript settings, path aliases for `@/` → `src/`, and ESNext target. Verify `npx tsc --noEmit` passes without errors on an empty project.
- [x] 1.5 Initialize Git repository with initial commit containing all scaffolding files. Verify `git log` shows the initial commit and `git status` is clean.

## 2. Tipos, esquemas y contratos core

- [x] 2.1 Create `src/types.ts` with TypeScript types for `Paquete`, `Solicitud`, `Correo`, `Cotizacion`, `Aprobacion`, `Factura`, and `OrdenCompra` (with nested `Referencia`, `Proveedor`, `Aprobador`, `Posicion`, `Excepcion`). Verify `npx tsc --noEmit` passes with all types resolving correctly.
- [x] 2.2 Create `src/schemas/orden-compra.ts` with Zod schema for `OrdenCompra` that validates the full structure including `sociedad: "1000"`, `organizacion_compras: "1000"`, `moneda: "COP" | "USD"`, `posiciones[]` with all fields, and `excepciones[]`. Verify the schema rejects invalid data and accepts valid data with a unit test.
- [x] 2.3 Create `src/schemas/herramientas.ts` with Zod schemas for tool arguments (`leer_paquete_args`, `validar_args`, `construir_payload_args`, `generar_evidencia_args`, `crear_args`) and result types (`HerramientaResultado = { ok: true, data } | { ok: false, error }`). Verify each schema validates sample inputs.
- [x] 2.4 Create `src/tools/contract.ts` with the tool contract interface: `type Tool = { description: string; args: Record<string, ZodType>; execute: (args, ctx: { directory: string; sessionId: string }) => Promise<string> }`. Create a `validateAndExecute` helper that validates args with zod before calling execute and catches errors. Verify the helper rejects invalid args and never throws on execute errors.

## 3. Herramientas de negocio

- [x] 3.1 Implement `oc_leer_paquete` in `src/tools/oc/leer-paquete.ts`: reads `correo.json`, `solicitud.json`, `cotizacion.txt` (parse text format), `aprobacion.json`, and optional `factura.txt` from `fixtures/reto-03/solicitudes/<caso>/`. Normalize into `Paquete` type. Missing files become `null` without throwing. Write test verifying sol-001 returns full package and a case with missing factura returns `factura: null`.
- [x] 3.2 Implement `oc_validar` in `src/tools/oc/validar.ts`: load maestros from `fixtures/reto-03/maestros/` and apply rules RC1-RC10. RC1: provider by NIT or normalized name, must be active. RC2: approval exists, contains "Aprobado", from valid approver. RC3: valor_total ≤ approver tope. RC4: subarea belongs to centro_costo. RC5: cotización vs solicitud within 2%. RC6: missing IVA → derive from provider + confirm. RC7: missing condiciones_pago → derive from provider (info only). RC8: factura date < solicitud date → retroactiva. RC9: approval date ≥ solicitud date. RC10: cantidad × unitario ≈ total (±1). Write tests for each rule using the 6 fixture cases.
- [x] 3.3 Implement `oc_construir_payload` in `src/tools/oc/construir-payload.ts`: build `OrdenCompra` from paquete + derivados. Validate against Zod schema. Generate `out/<caso>/trazabilidad.json` mapping each field to source. Truncate descripción to 40 chars. Write test verifying payload for sol-001 is valid and trazabilidad file is created.
- [x] 3.4 Implement `oc_generar_evidencia` in `src/tools/oc/generar-evidencia.ts`: P0 generates `out/<caso>/aprobacion.txt` with headers (de, para, fecha, asunto), body, and SHA-256 hash. P1 generates `out/<caso>/aprobacion.pdf` using pdf-lib with formatted content. Write tests verifying both files are created with correct content and hash matches.
- [x] 3.5 Implement `oc_crear` in `src/tools/oc/crear.ts`: check apta=true and (no confirmations or confirmado=true). Delegate to SapAdapter. Write result to `out/control.csv`. Write test verifying successful creation, blocked creation, and pending confirmation.
- [x] 3.6 Create `src/tools/oc.ts` that re-exports all tools and creates the tool registry with names `oc_leer_paquete`, `oc_validar`, `oc_construir_payload`, `oc_generar_evidencia`, `oc_crear`. Verify all tools are accessible from the registry.

## 4. Adaptador SAP mock

- [x] 4.1 Create `src/sap/adapter.ts` with `SapAdapter` interface: `consultarProveedor(nit)`, `crearOrden(orden)`, `buscarOrdenPorReferencia(solicitud_id)`. Verify the interface compiles and types are exported.
- [x] 4.2 Create `src/sap/mock.ts` implementing `SapAdapter`: read providers from `fixtures/reto-03/maestros/proveedores.json`, assign sequential OC numbers starting from 4500000001, write to `out/sap/ordenes.jsonl`, implement idempotency by checking existing orders. Verify first call returns 4500000001 and second call with same solicitud_id returns same number with idempotente=true.
- [x] 4.3 Implement control log writing to `out/control.csv` with columns: solicitud_id, resultado, numero_oc, retroactiva, bloqueos, confirmaciones, ts. Verify CSV is created and appendable across multiple calls.

## 5. Adaptador LLM y ciclo del agente

- [x] 5.1 Create `src/llm/adapter.ts` with interface `LLMAdapter { enviar(mensajes: Message[], tools: Tool[]): Promise<LLMResponse> }` where `LLMResponse` includes text content, tool calls array, and usage info. Verify interface compiles and can be implemented.
- [x] 5.2 Create `src/llm/opencode.ts` implementing `LLMAdapter` using Vercel AI SDK with OpenAI-compatible provider pointing to `https://opencode.ai/inference/go/openai/v1`. Map tools to SDK format, parse tool calls from response, support streaming. Use `OPENCODE_API_KEY` and `MODEL_ID` from env. Verify adapter sends a test message and receives response.
- [x] 5.3 Create `src/agent/loop.ts` with the agent loop function: takes session messages and tools, iterates calling LLM adapter, executes tool calls in parallel with `Promise.all`, appends results to history, checks for confirmation (detect confirmation patterns in model response), enforces iteration limit (default 25). Return final text, tool call log, and needsConfirmation flag. Write test simulating a multi-step loop with mock LLM.
- [x] 5.4 Create `src/agent/confirmacion.ts` with logic to detect when the agent needs human confirmation: parse model response for confirmation patterns, check validation results for confirmaciones array. Return structured confirmation state with message and pending confirmations. Verify detection works for RC5, RC6, RC8, RC9 patterns.
- [x] 5.5 Create `src/agent/sessions.ts` for file-based session management: store sessions as JSON in `out/sessions/<id>.json`, implement create/get/update operations, atomic writes (write to temp then rename). Sessions contain id, messages array, createdAt, updatedAt, status. Verify sessions persist across simulated restarts by writing and reading back.

## 6. Servidor HTTP y API

- [x] 6.1 Create `src/server.ts` with Hono app: implement `POST /api/chat` endpoint that accepts `{ sessionId, message }`, runs agent loop with streaming (SSE), returns reply with tool calls and needsConfirmation. Implement `GET /api/sessions/:id` returning full session history. Implement `GET /api/health` returning `{ ok: true, provider, model }` without exposing keys. Write integration test hitting each endpoint.
- [x] 6.2 Implement SSE streaming in `/api/chat`: stream tokens as they arrive from LLM, emit tool call events during execution, emit final event with complete response and needsConfirmation. Verify frontend receives events in correct order via test client.
- [x] 6.3 Implement error handling middleware: catch all errors, return structured `{ ok: false, error }` responses, never expose API keys in error messages, log errors to `out/log.jsonl`. Verify error responses are user-friendly and never contain secrets.
- [x] 6.4 Create `src/index.ts` as the entry point: load env, initialize session manager, start Hono server on configured port. Verify `npm run dev` starts the server and `/api/health` responds.

## 7. System prompt y conocimiento

- [x] 7.1 Create `agent/prompt.md` with system prompt defining agent behavior: role as SAP purchase order assistant, instructions to use tools for all data (never invent values), confirmation flow (ask and wait), error handling, and response format. Verify the prompt is loaded by the server at startup.
- [x] 7.2 Create `src/knowledge/ordenes-compra.md` documenting the purchase order process: actors, flow, validation rules summary, and exception handling. Verify the knowledge file is accessible to the agent context.

## 8. Frontend React

- [x] 8.1 Initialize React app in `web/` with Vite: configure TypeScript, install React and dependencies, set up build to output to `web/dist/`. Configure proxy for `/api` to backend. Verify `npm run dev` in web/ shows a blank page and API proxy works.
- [x] 8.2 Create `web/src/components/Chat.tsx`: main chat component with message history, input field, "thinking" indicator, and SSE connection to `/api/chat`. Render user messages, assistant messages, and tool call blocks (collapsible with name, args, result summary). Verify messages appear in chat and tool calls are shown.
- [x] 8.3 Create `web/src/components/Confirmation.tsx`: component that renders when needsConfirmation=true, highlighting the confirmation request with visual emphasis and Confirm/Cancel buttons. Verify confirmation state is visually distinct.
- [x] 8.4 Create `web/src/components/CaseSidebar.tsx`: sidebar component that fetches processed cases from a new endpoint `GET /api/cases` (list all cases in `out/sap/` and `out/control.csv`), displays them with status indicators, and allows clicking to load session history. Verify sidebar shows processed cases and clicking loads history.
- [x] 8.5 Create `web/src/components/FileDownload.tsx`: component providing download links for result files (trazabilidad.json, aprobacion.txt, aprobacion.pdf). Serve files from `out/` via a `GET /api/files/<caso>/<filename>` endpoint. Verify files are downloadable via click.
- [x] 8.6 Style the application with a clean, responsive layout: chat on the right, case sidebar on the left (collapsible on mobile), proper color scheme. Verify layout works on desktop and mobile viewports.

## 9. Demo y tests

- [x] 9.1 Create `demo.ts` that imports tools directly from `src/tools/oc.ts` and processes all 6 cases (sol-001 to sol-006) without any LLM: for each case call leer_paquete, validar, print apta/bloqueos/confirmaciones/retroactiva, then construir_payload and generar_evidencia if apta, then crear with appropriate flags. Run sol-001 twice to demonstrate idempotency. For sol-004, simulate explicit confirmation. Verify `npx tsx demo.ts` runs without API key and produces correct output for all cases.
- [x] 9.2 Set up Vitest configuration in `vitest.config.ts`: configure test directory as `tests/`, enable TypeScript support, set up test cleanup (clear `out/` before each suite except sessions). Verify `npm test` runs and finds tests.
- [x] 9.3 Write integration tests in `tests/tools/`: one test file per tool covering happy path, error cases, and edge cases. Test all 10 validation rules against fixture data. Verify `npm test` passes with all tool tests green.
- [x] 9.4 Write integration tests in `tests/agent/`: test agent loop with mock LLM adapter (simulated tool calls, iteration limit, confirmation detection). Test session persistence (create, load, update). Verify agent tests pass.
- [x] 9.5 Write integration tests in `tests/sap/`: test mock adapter (sequential numbering, idempotency, control CSV). Verify SAP tests pass.
- [x] 9.6 Write end-to-end test in `tests/e2e/`: simulate full flow from API request to OC creation for sol-001 without LLM (inject tool calls). Verify the complete flow produces expected files in `out/`.

## 10. Docker, documentación y preparación Railway

- [x] 10.1 Create `Dockerfile` with multi-stage build: install deps, build TypeScript, copy dist and static assets. Create `.dockerignore` excluding `node_modules/`, `out/`, `.env`. Verify `docker build .` succeeds.
- [x] 10.2 Create `docker-compose.yml` with services: app (build from Dockerfile, ports 3000:3000, env_file .env, volumes for out/ and fixtures). Verify `docker compose up` starts the app and it's accessible at localhost:3000.
- [x] 10.3 Create `railway.json` with build and start commands, environment variable references. Document Railway setup in README. Verify configuration is valid for Railway CLI.
- [x] 10.4 Create `README.md` with: project description, prerequisites (Node 20+, Bun for demo), setup instructions, environment variables, how to run locally (`npm run dev`), how to run demo (`npx tsx demo.ts`), how to run tests (`npm test`), how to run with Docker, how to deploy to Railway, and test link placeholder. Verify a fresh developer can follow the instructions.
- [x] 10.5 Create `SOLUCION.md` with the 12 required sections: problem summary, architecture diagram, agent cycle, model choice (DeepSeek Flash via Vercel AI SDK), control matrix (RC1-RC10), SAP adapter design (OData recommendation with BAPI fallback), process analysis on retroactive OCs, decisions and trade-offs (minimum 3), assumptions, coverage table, AI usage declaration, and production risks. Verify all sections are present and substantive.

## 11. Módulo reutilizable (bonus)

- [x] 11.1 Create `modulo/agent.md` with frontmatter (description, mode: primary, permissions: edit deny, bash deny) and body copied from `agent/prompt.md`. Verify frontmatter parses correctly and body matches source.
- [x] 11.2 Create `modulo/tools/oc.ts` that re-exports the same tools from `src/tools/oc.ts` in a standalone-importable way (no server dependency). Verify tools can be imported and executed from a standalone script.
- [x] 11.3 Create `modulo/skill/ordenes-compra/SKILL.md` with frontmatter (name: "ordenes-compra", description) and body copied from `src/knowledge/ordenes-compra.md`. Verify frontmatter parses and body matches source.
- [x] 11.4 Add test verifying consistency between `modulo/` files and their sources in `src/` and `agent/`. Verify running the test passes and catches divergence.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result merges all delta specs into main specs.
- Deploy to Railway and verify the public link works during defense.
- Run full demo with evaluator using the example prompt from PRD section 11.
