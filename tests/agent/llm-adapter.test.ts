import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { createOpenCodeGoAdapter, OpenCodeGoAdapter } from "../../src/llm/opencode.js";
import type { LLMAdapter } from "../../src/llm/adapter.js";
import { ScriptedAdapter, textResponse } from "../helpers.js";

let fakeServer: Server | null = null;

afterAll(() => {
  fakeServer?.close();
});

function startFakeOpenAI(captured: { body?: unknown; headers?: Record<string, string | string[] | undefined> }): Promise<string> {
  return new Promise((resolvePort, reject) => {
    fakeServer = createServer((request, response) => {
      let raw = "";
      request.on("data", (chunk) => {
        raw += String(chunk);
      });
      request.on("end", () => {
        captured.headers = request.headers;
        try {
          captured.body = JSON.parse(raw);
        } catch {
          captured.body = raw;
        }
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        const base = {
          id: "chatcmpl-test",
          object: "chat.completion.chunk",
          created: 1_700_000_000,
          model: "deepseek-v4.1-flash",
        };
        response.write(
          `data: ${JSON.stringify({
            ...base,
            choices: [{ index: 0, delta: { role: "assistant", content: "Hola" }, finish_reason: null }],
          })}\n\n`,
        );
        response.write(
          `data: ${JSON.stringify({
            ...base,
            choices: [{ index: 0, delta: { content: " mundo" }, finish_reason: null }],
          })}\n\n`,
        );
        response.write(
          `data: ${JSON.stringify({
            ...base,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
          })}\n\n`,
        );
        response.write("data: [DONE]\n\n");
        response.end();
      });
    });
    fakeServer.on("error", reject);
    fakeServer.listen(0, "127.0.0.1", () => {
      const address = fakeServer?.address() as AddressInfo;
      resolvePort(`http://127.0.0.1:${address.port}/v1`);
    });
  });
}

describe("LLM adapter (5.1, 5.2)", () => {
  it("sends a message and receives a response through an OpenAI-compatible endpoint", async () => {
    const captured: { body?: unknown; headers?: Record<string, string | string[] | undefined> } = {};
    const baseUrl = await startFakeOpenAI(captured);
    const adapter = createOpenCodeGoAdapter({
      apiKey: "test-key",
      modelId: "deepseek-v4.1-flash",
      baseUrl,
    });

    const deltas: string[] = [];
    const response = await adapter.enviar(
      [{ role: "user", content: "Hola" }],
      {},
      { sessionId: "session-test", onTextDelta: (delta) => deltas.push(delta) },
    );

    expect(response.text).toBe("Hola mundo");
    expect(deltas.join("")).toBe("Hola mundo");
    expect(response.usage.totalTokens).toBe(7);

    const requestBody = captured.body as {
      model?: string;
      messages?: Array<{ role: string; content: string }>;
    };
    expect(requestBody.model).toBe("deepseek-v4.1-flash");
    expect(requestBody.messages?.[0]).toMatchObject({ role: "user", content: "Hola" });
    expect(captured.headers?.["x-opencode-session"]).toBe("session-test");
    expect(captured.headers?.["user-agent"]).toContain("agente-oc-sap");
  });

  it("implements the LLMAdapter interface with a mock provider", async () => {
    const adapter: LLMAdapter = new ScriptedAdapter([textResponse("hola")]);
    const response = await adapter.enviar([{ role: "user", content: "test" }], {});
    expect(response.text).toBe("hola");
    expect(response.usage.totalTokens).toBeGreaterThan(0);
  });

  it("creates an OpenCode Go adapter when an API key is present", () => {
    const adapter = createOpenCodeGoAdapter({
      apiKey: "test-key-not-used",
      modelId: "deepseek-v4.1-flash",
    });
    expect(adapter).toBeInstanceOf(OpenCodeGoAdapter);
    expect(adapter.provider).toBe("opencode-go");
  });

  it("refuses to build the OpenCode Go adapter without an API key", () => {
    expect(() =>
      createOpenCodeGoAdapter({ apiKey: "", modelId: "deepseek-v4.1-flash" }),
    ).toThrow(/OPENCODE_API_KEY/);
  });
});
