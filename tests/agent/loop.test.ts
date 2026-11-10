import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runAgentLoop } from "../../src/agent/loop.js";
import { tools } from "../../src/tools/oc.js";
import type { AgentMessage } from "../../src/llm/adapter.js";
import { makePurchaseOrder, ScriptedAdapter, outputExists, testContext, textResponse, toolResponse } from "../helpers.js";

function lastToolData(messages: AgentMessage[]): unknown {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "tool") {
      const parsed = JSON.parse(message.content) as { ok: boolean; data?: unknown };
      if (parsed.ok) return parsed.data;
    }
  }
  return null;
}

describe("agent loop (5.3)", () => {
  it("executes a multi-step tool sequence and returns the final text", async () => {
    const adapter = new ScriptedAdapter([
      toolResponse("oc_leer_paquete", { caso: "sol-001" }),
      (messages) =>
        toolResponse("oc_validar", {
          caso: "sol-001",
          paquete: lastToolData(messages),
        }),
      textResponse("El caso sol-001 es apto y no requiere confirmaciones."),
    ]);

    const result = await runAgentLoop({
      adapter,
      tools,
      messages: [{ role: "user", content: "Procesá sol-001" }],
      systemPrompt: "test prompt",
      context: testContext,
      maxIterations: 10,
    });

    expect(result.toolCalls.map((call) => call.name)).toEqual([
      "oc_leer_paquete",
      "oc_validar",
    ]);
    expect(result.text).toContain("apto");
    expect(result.needsConfirmation).toBe(false);
    expect(result.iterations).toBe(3);
    expect(adapter.calls).toHaveLength(3);
    expect(adapter.calls[0]?.system).toBe("test prompt");
  });

  it("stops at the iteration limit and reports what is pending", async () => {
    const adapter = new ScriptedAdapter([
      toolResponse("oc_leer_paquete", { caso: "sol-001" }),
    ]);

    const result = await runAgentLoop({
      adapter,
      tools,
      messages: [{ role: "user", content: "Procesá sol-001" }],
      systemPrompt: "test prompt",
      context: testContext,
      maxIterations: 3,
    });

    expect(result.iterations).toBe(3);
    expect(result.toolCalls).toHaveLength(3);
    expect(result.text).toContain("tope de 3 iteraciones");
  });

  it("flags confirmation when validation has pending exceptions", async () => {
    const adapter = new ScriptedAdapter([
      toolResponse("oc_leer_paquete", { caso: "sol-004" }),
      (messages) =>
        toolResponse("oc_validar", {
          caso: "sol-004",
          paquete: lastToolData(messages),
        }),
      textResponse("La cotización difiere de la solicitud. ¿Confirmás que continúe?"),
    ]);

    const result = await runAgentLoop({
      adapter,
      tools,
      messages: [{ role: "user", content: "Procesá sol-004" }],
      systemPrompt: "test prompt",
      context: testContext,
    });

    expect(result.needsConfirmation).toBe(true);
    expect(result.confirmation.pending.join(" ")).toContain("RC5");
  });

  it("never forces oc_crear confirmation without an explicit user confirmation", async () => {
    const adapter = new ScriptedAdapter([
      toolResponse("oc_leer_paquete", { caso: "sol-004" }),
      (messages) =>
        toolResponse("oc_validar", {
          caso: "sol-004",
          paquete: lastToolData(messages),
        }),
      () =>
        toolResponse("oc_crear", {
          caso: "sol-004",
          payload: makePurchaseOrder("SOL-2026-004"),
          confirmado: true,
        }),
      textResponse("No se creó porque falta confirmación."),
    ]);

    const result = await runAgentLoop({
      adapter,
      tools,
      messages: [{ role: "user", content: "Procesá sol-004" }],
      systemPrompt: "test prompt",
      context: testContext,
    });

    const createCall = result.toolCalls.find((call) => call.name === "oc_crear");
    expect(createCall?.ok).toBe(false);
    expect(createCall?.result).toContain("confirmaciones pendientes");
  });

  it("returns a readable error and keeps the session alive when the provider fails", async () => {
    const adapter = new ScriptedAdapter([
      () => {
        throw new Error("proveedor caído");
      },
    ]);

    const result = await runAgentLoop({
      adapter,
      tools,
      messages: [{ role: "user", content: "Procesá sol-001" }],
      systemPrompt: "test prompt",
      context: testContext,
    });

    expect(result.text).toContain("No pude comunicarme");
    expect(result.messages.at(-1)?.role).toBe("assistant");
    expect(outputExists("log.jsonl")).toBe(true);
    expect(readFileSync(`${testContext.directory}/out/log.jsonl`, "utf8")).toContain(
      "proveedor caído",
    );
  });
});
