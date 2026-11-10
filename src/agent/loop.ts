import { validateAndExecute, type ToolContext, type ToolRegistry } from "../tools/contract.js";
import { logError, logToolCall, redactSecrets } from "../logger.js";
import type {
  AgentMessage,
  LLMAdapter,
  TokenUsage,
  ToolCall,
} from "../llm/adapter.js";
import type { ValidationResult } from "../types.js";
import {
  detectConfirmation,
  isUserConfirmation,
  type ConfirmationState,
} from "./confirmation.js";

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; name: string; arguments: Record<string, unknown> }
  | {
      type: "tool_end";
      name: string;
      arguments: Record<string, unknown>;
      result: string;
      ok: boolean;
      durationMs: number;
    }
  | { type: "usage"; usage: TokenUsage }
  | { type: "confirmation"; state: ConfirmationState }
  | { type: "error"; error: string };

export type ToolCallLog = {
  name: string;
  arguments: Record<string, unknown>;
  result: string;
  ok: boolean;
  durationMs: number;
};

export type ToolGuardResult = { allow: true } | { allow: false; error: string };

export type ToolGuard = (call: ToolCall) => ToolGuardResult | Promise<ToolGuardResult>;

export type AgentLoopOptions = {
  adapter: LLMAdapter;
  tools: ToolRegistry;
  messages: AgentMessage[];
  systemPrompt: string;
  context: ToolContext;
  maxIterations?: number;
  maxTokensPerSession?: number;
  onEvent?: (event: AgentEvent) => void;
  /** Optional policy hook executed before every tool call. */
  beforeToolCall?: ToolGuard;
  /** Called after each tool execution, including blocked calls. */
  onToolResult?: (log: ToolCallLog) => void | Promise<void>;
};

export type AgentLoopResult = {
  text: string;
  messages: AgentMessage[];
  toolCalls: ToolCallLog[];
  needsConfirmation: boolean;
  confirmation: ConfirmationState;
  iterations: number;
  usage: TokenUsage;
};

type ParsedToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string }
  | null;

export function parseToolResult(raw: string): ParsedToolResult {
  try {
    const parsed = JSON.parse(raw) as { ok?: boolean; data?: unknown; error?: string };
    if (parsed.ok === true) return { ok: true, data: parsed.data };
    if (parsed.ok === false) return { ok: false, error: parsed.error ?? "Error desconocido" };
    return null;
  } catch {
    return null;
  }
}

function lastUserMessage(messages: AgentMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === "user") return message.content;
  }
  return undefined;
}

function extractValidation(value: unknown): ValidationResult | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ValidationResult>;
  if (
    typeof candidate.apta === "boolean" &&
    Array.isArray(candidate.bloqueos) &&
    Array.isArray(candidate.confirmaciones)
  ) {
    return candidate as ValidationResult;
  }
  return null;
}

/**
 * Custom agent loop: model -> tool calls -> tool results -> model, until the
 * model answers without tool calls or the iteration budget is exhausted.
 */
export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const {
    adapter,
    tools,
    systemPrompt,
    context,
    maxIterations = 25,
    maxTokensPerSession = 500_000,
    onEvent,
    beforeToolCall,
    onToolResult,
  } = options;

  const emit = (event: AgentEvent): void => onEvent?.(event);
  const history: AgentMessage[] = [...options.messages];
  const logs: ToolCallLog[] = [];
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const userConfirmed = isUserConfirmation(lastUserMessage(history));

  let iterations = 0;
  let lastValidation: ValidationResult | null = null;
  let orderCreated = false;
  let finalText = "";

  const finish = (): AgentLoopResult => {
    const confirmation = orderCreated
      ? { needsConfirmation: false, message: finalText, pending: [] }
      : detectConfirmation(finalText, lastValidation);
    if (confirmation.needsConfirmation) {
      emit({ type: "confirmation", state: confirmation });
    }
    return {
      text: finalText,
      messages: history,
      toolCalls: logs,
      needsConfirmation: confirmation.needsConfirmation,
      confirmation,
      iterations,
      usage,
    };
  };

  while (iterations < maxIterations) {
    iterations += 1;

    let response;
    try {
      response = await adapter.enviar(history, tools, {
        system: systemPrompt,
        sessionId: context.sessionId,
        onTextDelta: (delta) => emit({ type: "text", delta }),
      });
    } catch (error) {
      const message = redactSecrets(
        error instanceof Error ? error.message : String(error),
      );
      logError(context.directory, error, {
        sessionId: context.sessionId,
        stage: "llm",
      });
      emit({ type: "error", error: message });
      finalText = `No pude comunicarme con el proveedor del modelo: ${message}. La sesión sigue activa; puedes reintentar.`;
      history.push({ role: "assistant", content: finalText });
      return finish();
    }

    usage.inputTokens += response.usage.inputTokens;
    usage.outputTokens += response.usage.outputTokens;
    usage.totalTokens += response.usage.totalTokens;
    emit({ type: "usage", usage: { ...usage } });

    history.push({
      role: "assistant",
      content: response.text,
      ...(response.toolCalls.length > 0 ? { toolCalls: response.toolCalls } : {}),
    });

    if (response.toolCalls.length === 0) {
      finalText = response.text;
      return finish();
    }

    const results = await Promise.all(
      response.toolCalls.map(async (call: ToolCall) => {
        emit({ type: "tool_start", name: call.name, arguments: call.arguments });
        const started = Date.now();
        const definition = tools[call.name];
        const guard = beforeToolCall ? await beforeToolCall(call) : { allow: true as const };
        let rawResult: string;

        if (!guard.allow) {
          rawResult = JSON.stringify({ ok: false, error: guard.error });
        } else if (!definition) {
          rawResult = JSON.stringify({
            ok: false,
            error: `Herramienta desconocida: ${call.name}`,
          });
        } else {
          const toolArguments =
            call.name === "oc_crear"
              ? {
                  ...call.arguments,
                  // CA3: creation with pending exceptions only proceeds when the
                  // immediately previous user message is an explicit confirmation.
                  confirmado: call.arguments.confirmado === true && userConfirmed,
                }
              : call.arguments;
          rawResult = await validateAndExecute(definition, toolArguments, context);
        }

        const durationMs = Date.now() - started;
        const parsed = parseToolResult(rawResult);
        const ok = parsed?.ok ?? false;
        logToolCall(context.directory, {
          sessionId: context.sessionId,
          name: call.name,
          arguments: call.arguments,
          result: rawResult,
          ok,
          durationMs,
        });
        emit({
          type: "tool_end",
          name: call.name,
          arguments: call.arguments,
          result: rawResult,
          ok,
          durationMs,
        });

        return { call, rawResult, ok, durationMs, data: parsed?.ok ? parsed.data : null };
      }),
    );

    for (const result of results) {
      history.push({
        role: "tool",
        content: result.rawResult,
        toolCallId: result.call.id,
        toolName: result.call.name,
      });
      logs.push({
        name: result.call.name,
        arguments: result.call.arguments,
        result: result.rawResult,
        ok: result.ok,
        durationMs: result.durationMs,
      });
      await onToolResult?.({
        name: result.call.name,
        arguments: result.call.arguments,
        result: result.rawResult,
        ok: result.ok,
        durationMs: result.durationMs,
      });
      if (result.call.name === "oc_validar" && result.ok) {
        lastValidation = extractValidation(result.data);
      }
      if (result.call.name === "oc_crear" && result.ok) {
        orderCreated = true;
      }
    }

    if (usage.totalTokens > maxTokensPerSession) {
      finalText =
        "Alcancé el tope de tokens configurado para la sesión. " +
        "Esto es lo procesado hasta ahora; revisa el historial y continúa en una sesión nueva.";
      return finish();
    }
  }

  finalText =
    `Alcancé el tope de ${maxIterations} iteraciones sin una respuesta final. ` +
    "Revisa el historial de herramientas para ver lo procesado y lo pendiente.";
  emit({ type: "error", error: finalText });
  return finish();
}
