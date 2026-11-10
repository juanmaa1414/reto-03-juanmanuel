import { readFileSync } from "node:fs";
import { describe, expect, it, afterEach } from "vitest";
import { createApp } from "../../src/server.js";
import { SessionStore } from "../../src/agent/sessions.js";
import { appendControlLog } from "../../src/sap/control.js";
import { generar_evidencia } from "../../src/tools/oc.js";
import type { AgentMessage } from "../../src/llm/adapter.js";
import type { Config } from "../../src/env.js";
import {
  ScriptedAdapter,
  outputExists,
  repoRoot,
  testContext,
  textResponse,
  toolResponse,
} from "../helpers.js";

const config: Config = {
  port: 0,
  modelId: "deepseek-v4.1-flash",
  opencodeApiKey: "",
  maxIterations: 25,
  maxTokensPerSession: 500_000,
};

function lastToolData(messages: AgentMessage[], toolName?: string): unknown {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "tool") continue;
    if (toolName && message.toolName !== toolName) continue;
    const parsed = JSON.parse(message.content) as { ok: boolean; data?: unknown };
    if (parsed.ok) return parsed.data;
  }
  return null;
}

function makeApp(adapter?: ScriptedAdapter) {
  return createApp({
    directory: repoRoot,
    adapter,
    config,
    sessionStore: new SessionStore(repoRoot),
  });
}

describe("HTTP API (6.1, 6.2, 6.3)", () => {
  afterEach(() => {
    delete process.env.OPENCODE_API_KEY;
  });

  it("reports health without exposing the API key", async () => {
    const app = makeApp();
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ ok: true, provider: "opencode-go", model: "deepseek-v4.1-flash" });
    expect(JSON.stringify(body)).not.toContain("apiKey");
  });

  it("runs the agent loop through POST /api/chat and persists the session", async () => {
    const adapter = new ScriptedAdapter([
      toolResponse("oc_leer_paquete", { caso: "sol-001" }),
      (messages) =>
        toolResponse("oc_validar", {
          caso: "sol-001",
          paquete: lastToolData(messages, "oc_leer_paquete"),
        }),
      textResponse("El caso sol-001 es apto."),
    ]);
    const app = makeApp(adapter);

    const response = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "api-session-1", message: "Procesá sol-001", stream: false }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      reply: string;
      toolCalls: unknown[];
      needsConfirmation: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.reply).toContain("apto");
    expect(body.toolCalls).toHaveLength(2);
    expect(body.needsConfirmation).toBe(false);
    expect(adapter.calls[0]?.system).toContain("Nunca inventes valores");

    const sessionResponse = await app.request("/api/sessions/api-session-1");
    expect(sessionResponse.status).toBe(200);
    const session = (await sessionResponse.json()) as {
      data: { messages: unknown[]; metadata?: Record<string, unknown> };
    };
    expect(session.data.messages.length).toBe(6);
    expect(session.data.metadata).toMatchObject({
      caso: "sol-001",
      solicitud_id: "SOL-2026-001",
    });
  });

  it("streams SSE events in order", async () => {
    const adapter = new ScriptedAdapter([
      toolResponse("oc_leer_paquete", { caso: "sol-001" }),
      textResponse("Listo."),
    ]);
    const app = makeApp(adapter);

    const response = await app.request("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ sessionId: "api-session-sse", message: "Leé sol-001" }),
    });

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const stream = await response.text();
    const toolStart = stream.indexOf("event: tool_start");
    const toolEnd = stream.indexOf("event: tool_end");
    const token = stream.indexOf("event: token");
    const done = stream.indexOf("event: done");

    expect(toolStart).toBeGreaterThanOrEqual(0);
    expect(toolEnd).toBeGreaterThan(toolStart);
    expect(token).toBeGreaterThan(toolEnd);
    expect(done).toBeGreaterThan(token);
    expect(stream).toContain('"needsConfirmation":false');
  });

  it("returns a friendly error and never leaks the API key", async () => {
    process.env.OPENCODE_API_KEY = "sk-super-secret-value";
    const adapter = new ScriptedAdapter([
      () => {
        throw new Error("fallo con sk-super-secret-value");
      },
    ]);
    const app = makeApp(adapter);

    const response = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Procesá sol-001", stream: false }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { reply: string };
    expect(body.reply).toContain("No pude comunicarme");
    expect(body.reply).not.toContain("sk-super-secret-value");

    const log = readFileSync(`${testContext.directory}/out/log.jsonl`, "utf8");
    expect(log).not.toContain("sk-super-secret-value");
    expect(log).toContain("[REDACTED]");
  });

  it("returns 400 for an invalid chat body", async () => {
    const app = makeApp();
    const response = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "   " }),
    });
    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown session", async () => {
    const app = makeApp();
    const response = await app.request("/api/sessions/does-not-exist");
    expect(response.status).toBe(404);
  });

  it("lists processed cases and serves result files", async () => {
    appendControlLog(testContext.directory, {
      solicitud_id: "SOL-2026-001",
      resultado: "exitoso",
      numero_oc: "4500000001",
      retroactiva: false,
      bloqueos: [],
      confirmaciones: [],
    });
    await generar_evidencia.execute({ caso: "sol-001" }, testContext);

    const app = makeApp();
    const casesResponse = await app.request("/api/cases");
    expect(casesResponse.status).toBe(200);
    const cases = (await casesResponse.json()) as {
      data: Array<{ solicitud_id: string; resultado: string; numero_oc: string | null }>;
    };
    expect(cases.data).toHaveLength(1);
    expect(cases.data[0]).toMatchObject({
      solicitud_id: "SOL-2026-001",
      resultado: "exitoso",
      numero_oc: "4500000001",
    });

    const fileResponse = await app.request("/api/files/sol-001/aprobacion.txt");
    expect(fileResponse.status).toBe(200);
    expect(await fileResponse.text()).toContain("De: mlopez@periferia-ficticia.com");

    const listing = await app.request("/api/files/sol-001");
    expect(listing.status).toBe(200);
    const listingBody = (await listing.json()) as { data: { files: string[] } };
    expect(listingBody.data.files).toContain("aprobacion.txt");
    expect(listingBody.data.files).toContain("aprobacion.pdf");

    const blockedListing = await app.request("/api/files/sol-002");
    expect(blockedListing.status).toBe(200);
    const blockedBody = (await blockedListing.json()) as { data: { files: string[] } };
    expect(blockedBody.data.files).toEqual([]);

    const missing = await app.request("/api/files/sol-001/nope.txt");
    expect(missing.status).toBe(404);

    const control = await app.request("/api/control.csv");
    expect(control.status).toBe(200);
    expect(await control.text()).toContain("SOL-2026-001,exitoso");
  });

  it("returns 503 when the API key is missing", async () => {
    const app = makeApp();
    const response = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hola", stream: false }),
    });
    expect(response.status).toBe(503);
    expect(outputExists("log.jsonl")).toBe(false);
  });
});
