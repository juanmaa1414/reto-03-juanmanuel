export type ToolCallView = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  ok?: boolean;
  running: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallView[];
};

export type SessionMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  toolCallId?: string;
  toolName?: string;
};

export type SessionData = {
  id: string;
  messages: SessionMessage[];
  createdAt: string;
  updatedAt: string;
  status: "active" | "completed" | "paused";
  metadata?: Record<string, unknown>;
};

export type CaseEntry = {
  solicitud_id: string;
  resultado: string;
  numero_oc: string | null;
  retroactiva: boolean;
  bloqueos: string[];
  confirmaciones: string[];
  ts: string;
};

export type ConfirmationState = {
  needsConfirmation: boolean;
  message: string;
  pending: string[];
};

export type DonePayload = {
  sessionId: string;
  reply: string;
  toolCalls: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result: string;
    ok: boolean;
    durationMs: number;
  }>;
  needsConfirmation: boolean;
  confirmation: ConfirmationState;
  boundCase: string | null;
  finalized: boolean;
  numeroOc: string | null;
  sessionStatus: "active" | "completed" | "paused";
};
