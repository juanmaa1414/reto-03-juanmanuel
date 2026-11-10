import { createToolRegistry, type ToolRegistry } from "./contract.js";
import { leer_paquete } from "./oc/read-package.js";
import { validar } from "./oc/validate.js";
import { construir_payload } from "./oc/build-payload.js";
import { generar_evidencia } from "./oc/generate-evidence.js";
import { crear } from "./oc/create-order.js";

export { leer_paquete } from "./oc/read-package.js";
export { validar } from "./oc/validate.js";
export { construir_payload } from "./oc/build-payload.js";
export { generar_evidencia } from "./oc/generate-evidence.js";
export { crear } from "./oc/create-order.js";
export { validateAndExecute, ok, fail, defineTool } from "./contract.js";
export type { Tool, AnyTool, ToolContext, ToolRegistry } from "./contract.js";

/** Registry using the names seen by the model (`oc_<export>`). */
export const tools: ToolRegistry = createToolRegistry({
  oc_leer_paquete: leer_paquete,
  oc_validar: validar,
  oc_construir_payload: construir_payload,
  oc_generar_evidencia: generar_evidencia,
  oc_crear: crear,
});

/** Alias matching the name used by the PRD. */
export const toolRegistry = tools;
