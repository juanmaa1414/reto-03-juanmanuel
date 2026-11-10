import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, tool, type ModelMessage, type ToolSet } from "ai";
import { z } from "zod";
import type { ToolRegistry } from "../tools/contract.js";
import type {
  AgentMessage,
  LLMAdapter,
  LLMRequestOptions,
  LLMResponse,
  ToolCall,
} from "./adapter.js";

export const OPENCODE_GO_BASE_URL = "https://opencode.ai/inference/go/openai/v1";
export const DEFAULT_MODEL_ID = "deepseek-v4.1-flash";

type OpenCodeGoOptions = {
  apiKey: string;
  modelId: string;
  baseUrl?: string;
};

function toModelMessages(messages: AgentMessage[]): ModelMessage[] {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => {
      if (message.role === "tool") {
        return {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: message.toolCallId ?? "",
              toolName: message.toolName ?? "unknown",
              output: { type: "text", value: message.content },
            },
          ],
        } satisfies ModelMessage;
      }

      if (message.role === "assistant" && message.toolCalls?.length) {
        return {
          role: "assistant",
          content: [
            ...(message.content ? [{ type: "text" as const, text: message.content }] : []),
            ...message.toolCalls.map((call) => ({
              type: "tool-call" as const,
              toolCallId: call.id,
              toolName: call.name,
              input: call.arguments,
            })),
          ],
        } satisfies ModelMessage;
      }

      return { role: message.role, content: message.content } as ModelMessage;
    });
}

function toSdkTools(tools: ToolRegistry): ToolSet {
  const sdkTools: ToolSet = {};
  for (const [name, definition] of Object.entries(tools)) {
    sdkTools[name] = tool({
      description: definition.description,
      inputSchema: z.object(definition.args),
    });
  }
  return sdkTools;
}

/**
 * Adapter for OpenCode Go (OpenAI-compatible inference gateway).
 * Default model is the same one used by this OpenCode installation:
 * `deepseek-v4.1-flash`.
 */
export class OpenCodeGoAdapter implements LLMAdapter {
  private readonly model;
  private readonly providerName = "opencode-go";

  constructor(options: OpenCodeGoOptions) {
    if (!options.apiKey) {
      throw new Error("OPENCODE_API_KEY no está configurada.");
    }
    const client = createOpenAICompatible({
      name: "opencode-go",
      apiKey: options.apiKey,
      baseURL: options.baseUrl ?? OPENCODE_GO_BASE_URL,
    });
    this.model = client.chatModel(options.modelId);
  }

  async enviar(
    messages: AgentMessage[],
    tools: ToolRegistry,
    options: LLMRequestOptions = {},
  ): Promise<LLMResponse> {
    const result = streamText({
      model: this.model,
      system: options.system,
      messages: toModelMessages(messages),
      tools: toSdkTools(tools),
      temperature: 0,
      headers: {
        "User-Agent": "agente-oc-sap/1.0",
        "x-opencode-session": options.sessionId ?? "agente-oc-sap",
      },
    });

    for await (const delta of result.textStream) {
      options.onTextDelta?.(delta);
    }

    const [text, sdkCalls, usage, finishReason] = await Promise.all([
      result.text,
      result.toolCalls,
      result.usage,
      result.finishReason,
    ]);

    const toolCalls: ToolCall[] = sdkCalls.map((call) => ({
      id: call.toolCallId,
      name: call.toolName,
      arguments: (call.input ?? {}) as Record<string, unknown>,
    }));

    return {
      text,
      toolCalls,
      usage: {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
      },
      finishReason,
    };
  }

  /** Provider name exposed by /api/health. */
  get provider(): string {
    return this.providerName;
  }
}

export function createOpenCodeGoAdapter(options: OpenCodeGoOptions): LLMAdapter {
  return new OpenCodeGoAdapter(options);
}

