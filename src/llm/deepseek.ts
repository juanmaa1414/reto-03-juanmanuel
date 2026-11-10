import { createOpenAI } from "@ai-sdk/openai";
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

const DEFAULT_BASE_URL = "https://api.deepseek.com";

type DeepSeekOptions = {
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

export class DeepSeekAdapter implements LLMAdapter {
  private readonly model;
  private readonly providerName = "deepseek";

  constructor(options: DeepSeekOptions) {
    if (!options.apiKey) {
      throw new Error("DEEPSEEK_API_KEY no está configurada.");
    }
    const client = createOpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl ?? DEFAULT_BASE_URL,
    });
    this.model = client.chat(options.modelId);
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

export function createDeepSeekAdapter(options: DeepSeekOptions): LLMAdapter {
  return new DeepSeekAdapter(options);
}
