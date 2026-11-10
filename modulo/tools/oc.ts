/**
 * Standalone re-export of the business tools.
 *
 * It intentionally imports only from src/tools/oc.ts (no server, no HTTP
 * framework), so the module can be consumed from scripts and other agent
 * platforms without running the Hono application.
 */
export {
  leer_paquete,
  validar,
  construir_payload,
  generar_evidencia,
  crear,
  tools,
  toolRegistry,
  validateAndExecute,
  ok,
  fail,
  defineTool,
} from "../../src/tools/oc.js";

export type { Tool, AnyTool, ToolContext, ToolRegistry } from "../../src/tools/oc.js";
