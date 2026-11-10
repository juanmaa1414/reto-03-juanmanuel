import type { ToolRegistry } from "../tools/contract.js";

export type MessageRole = "system" | "user" | "assistant" | "tool";

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type AgentMessage = {
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type LLMResponse = {
  text: string;
  toolCalls: ToolCall[];
  usage: TokenUsage;
  finishReason?: string;
};

export type LLMRequestOptions = {
  system?: string;
  onTextDelta?: (delta: string) => void;
};

/**
 * Provider abstraction required by the challenge: `enviar(messages, tools)`.
 * Swapping providers must not change the agent loop.
 */
export interface LLMAdapter {
  enviar(
    messages: AgentMessage[],
    tools: ToolRegistry,
    options?: LLMRequestOptions,
  ): Promise<LLMResponse>;
}
