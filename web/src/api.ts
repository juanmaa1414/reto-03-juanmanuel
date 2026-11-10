import type {
  CaseEntry,
  ChatMessage,
  SessionData,
  SessionMessage,
  ToolCallView,
} from "./types";

type StreamHandler = (event: string, data: unknown) => void;

function parseSseBlock(block: string): { event: string; data: string } | null {
  const lines = block.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

export async function streamChat(
  sessionId: string | null,
  message: string,
  onEvent: StreamHandler,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ sessionId: sessionId ?? undefined, message }),
    signal,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) detail = payload.error;
    } catch {
      // Keep the HTTP status as detail.
    }
    throw new Error(detail);
  }

  const body = response.body;
  if (!body) throw new Error("El servidor no devolvió un stream.");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (block: string): void => {
    const parsed = parseSseBlock(block);
    if (!parsed) return;
    try {
      onEvent(parsed.event, JSON.parse(parsed.data) as unknown);
    } catch {
      // Ignore malformed events; the stream continues.
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf("\n\n");
    while (index >= 0) {
      dispatch(buffer.slice(0, index));
      buffer = buffer.slice(index + 2);
      index = buffer.indexOf("\n\n");
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) dispatch(buffer);
}

export async function fetchSession(sessionId: string): Promise<SessionData | null> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
  if (!response.ok) return null;
  const payload = (await response.json()) as { ok: boolean; data?: SessionData };
  return payload.ok && payload.data ? payload.data : null;
}

export async function fetchSessions(): Promise<SessionData[]> {
  const response = await fetch("/api/sessions");
  if (!response.ok) return [];
  const payload = (await response.json()) as { ok: boolean; data?: SessionData[] };
  return payload.ok && Array.isArray(payload.data) ? payload.data : [];
}

export async function fetchCases(): Promise<CaseEntry[]> {
  const response = await fetch("/api/cases");
  if (!response.ok) return [];
  const payload = (await response.json()) as { ok: boolean; data?: CaseEntry[] };
  return payload.ok && Array.isArray(payload.data) ? payload.data : [];
}

export function toChatMessages(messages: SessionMessage[]): ChatMessage[] {
  const chat: ChatMessage[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      chat.push({ id: crypto.randomUUID(), role: "user", content: message.content });
      continue;
    }
    if (message.role === "assistant") {
      const toolCalls: ToolCallView[] = (message.toolCalls ?? []).map((call) => ({
        id: call.id,
        name: call.name,
        arguments: call.arguments,
        running: false,
      }));
      chat.push({
        id: crypto.randomUUID(),
        role: "assistant",
        content: message.content,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      });
      continue;
    }
    if (message.role === "tool") {
      for (let i = chat.length - 1; i >= 0; i -= 1) {
        const candidate = chat[i];
        if (candidate?.role !== "assistant" || !candidate.toolCalls) continue;
        const call = candidate.toolCalls.find((item) => item.id === message.toolCallId);
        if (call) {
          call.result = message.content;
          call.running = false;
          call.ok = !message.content.includes('"ok":false');
          break;
        }
      }
    }
  }
  return chat;
}

export function extractCase(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message?.toolCalls) continue;
    for (let j = message.toolCalls.length - 1; j >= 0; j -= 1) {
      const caso = message.toolCalls[j]?.arguments.caso;
      if (typeof caso === "string" && caso.length > 0) return caso;
    }
  }
  return null;
}
