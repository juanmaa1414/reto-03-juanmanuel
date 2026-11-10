import { describe, expect, it } from "vitest";
import { createApp } from "../../src/server.js";
import { SessionStore } from "../../src/agent/sessions.js";
import type { Config } from "../../src/env.js";
import type { AgentMessage } from "../../src/llm/adapter.js";
import type { PackageData, PurchaseOrder, ValidationResult } from "../../src/types.js";
import {
  ScriptedAdapter,
  outputExists,
  readOutputJson,
  readOutputText,
  repoRoot,
  textResponse,
  toolResponse,
} from "../helpers.js";

const config: Config = {
  port: 0,
  modelId: "deepseek-flash",
  deepseekApiKey: "",
  maxIterations: 25,
  maxTokensPerSession: 500_000,
};

function toolData<T>(messages: AgentMessage[], toolName: string): T {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "tool" || message.toolName !== toolName) continue;
    const parsed = JSON.parse(message.content) as { ok: boolean; data?: T };
    if (parsed.ok && parsed.data) return parsed.data;
  }
  throw new Error(`No tool result found for ${toolName}`);
}

describe("end-to-end flow without LLM (9.6)", () => {
  it("goes from API request to SAP order creation for sol-001", async () => {
    const adapter = new ScriptedAdapter([
      toolResponse("oc_leer_paquete", { caso: "sol-001" }),
      (messages) =>
        toolResponse("oc_validar", {
          caso: "sol-001",
          paquete: toolData<PackageData>(messages, "oc_leer_paquete"),
        }),
      (messages) =>
        toolResponse("oc_construir_payload", {
          caso: "sol-001",
          paquete: toolData<PackageData>(messages, "oc_leer_paquete"),
          derivados: toolData<ValidationResult>(messages, "oc_validar").derivados,
        }),
      (messages) =>
        toolResponse("oc_generar_evidencia", {
          caso: "sol-001",
          paquete: toolData<PackageData>(messages, "oc_leer_paquete"),
        }),
      (messages) =>
        toolResponse("oc_crear", {
          caso: "sol-001",
          payload: toolData<{ payload: PurchaseOrder }>(
            messages,
            "oc_construir_payload",
          ).payload,
        }),
      textResponse("La OC 4500000001 fue creada correctamente."),
    ]);

    const app = createApp({
      directory: repoRoot,
      adapter,
      config,
      sessionStore: new SessionStore(repoRoot),
    });

    const response = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "e2e-sol-001",
        message: "Procesá sol-001 de punta a punta",
        stream: false,
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      reply: string;
      toolCalls: Array<{ name: string; ok: boolean }>;
    };
    expect(body.ok).toBe(true);
    expect(body.reply).toContain("creada");
    expect(body.toolCalls.map((call) => call.name)).toEqual([
      "oc_leer_paquete",
      "oc_validar",
      "oc_construir_payload",
      "oc_generar_evidencia",
      "oc_crear",
    ]);
    expect(body.toolCalls.every((call) => call.ok)).toBe(true);

    expect(outputExists("sol-001", "trazabilidad.json")).toBe(true);
    expect(outputExists("sol-001", "aprobacion.txt")).toBe(true);
    expect(outputExists("sol-001", "aprobacion.pdf")).toBe(true);
    expect(outputExists("sap", "ordenes.jsonl")).toBe(true);
    expect(readOutputText("control.csv")).toContain("SOL-2026-001,exitoso,4500000001");

    const traceability = readOutputJson<Record<string, { source: string }>>(
      "sol-001",
      "trazabilidad.json",
    );
    expect(traceability["proveedor.codigo_sap"]?.source).toBe("maestro.proveedores");
  });
});
