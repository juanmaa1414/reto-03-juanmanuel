import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import type {
  AgentMessage,
  LLMAdapter,
  LLMRequestOptions,
  LLMResponse,
} from "../src/llm/adapter.js";
import type { ToolRegistry } from "../src/tools/contract.js";
import type { PurchaseOrder } from "../src/types.js";

export const repoRoot = process.cwd();
export const testContext = { directory: repoRoot, sessionId: "test-session" };

export function outPath(...parts: string[]): string {
  return resolve(repoRoot, "out", ...parts);
}

export function clearOutput(): void {
  const out = outPath();
  if (!existsSync(out)) return;
  for (const entry of readdirSync(out)) {
    rmSync(resolve(out, entry), { recursive: true, force: true });
  }
}

export function readOutputText(...parts: string[]): string {
  return readFileSync(outPath(...parts), "utf8");
}

export function readOutputJson<T>(...parts: string[]): T {
  return JSON.parse(readOutputText(...parts)) as T;
}

export function outputExists(...parts: string[]): boolean {
  return existsSync(outPath(...parts));
}

export function textResponse(text: string): LLMResponse {
  return {
    text,
    toolCalls: [],
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    finishReason: "stop",
  };
}

export function toolResponse(
  name: string,
  args: Record<string, unknown>,
  text = "",
  id = `call-${name}`,
): LLMResponse {
  return {
    text,
    toolCalls: [{ id, name, arguments: args }],
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    finishReason: "tool-calls",
  };
}

type ScriptedStep =
  | LLMResponse
  | ((messages: AgentMessage[], tools: ToolRegistry) => LLMResponse | Promise<LLMResponse>);

/** Deterministic LLM adapter for tests: replays scripted responses. */
export class ScriptedAdapter implements LLMAdapter {
  readonly calls: Array<{ messages: AgentMessage[]; toolNames: string[]; system?: string }> = [];
  private readonly steps: ScriptedStep[];
  private index = 0;

  constructor(steps: ScriptedStep[]) {
    this.steps = steps;
  }

  async enviar(
    messages: AgentMessage[],
    tools: ToolRegistry,
    options: LLMRequestOptions = {},
  ): Promise<LLMResponse> {
    this.calls.push({
      messages: [...messages],
      toolNames: Object.keys(tools),
      system: options.system,
    });
    const step = this.steps[Math.min(this.index, this.steps.length - 1)];
    this.index += 1;
    if (!step) {
      return textResponse("Sin respuesta configurada.");
    }
    const response = typeof step === "function" ? await step(messages, tools) : step;
    if (response.text && options.onTextDelta) {
      options.onTextDelta(response.text);
    }
    return response;
  }
}

export function makePurchaseOrder(requestId: string): PurchaseOrder {
  return {
    referencia: {
      solicitud_id: requestId,
      correo_id: `${requestId}-correo`,
      cotizacion_ref: "COT-TEST-001",
    },
    sociedad: "1000",
    organizacion_compras: "1000",
    proveedor: {
      codigo_sap: "100234",
      nit: "900555111",
      nombre: "TecnoSuministros S.A.S.",
    },
    moneda: "COP",
    condiciones_pago: "Z030",
    aprobador: {
      email: "mlopez@periferia-ficticia.com",
      fecha_aprobacion: "2026-08-21T10:02:00-05:00",
      evidencia_sha256: "0".repeat(64),
    },
    posiciones: [
      {
        numero: 10,
        descripcion: "Prueba",
        cantidad: 1,
        unidad: "UN",
        precio_unitario: 1000,
        centro_costo: "CC-1010",
        subarea: "Infraestructura",
        indicador_iva: "C1",
      },
    ],
    excepciones: [],
  };
}
