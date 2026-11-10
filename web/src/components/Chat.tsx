import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  extractCase,
  fetchSession,
  streamChat,
  toChatMessages,
} from "../api";
import type {
  ChatMessage,
  ConfirmationState,
  DonePayload,
  SessionData,
  ToolCallView,
} from "../types";
import { Confirmation } from "./Confirmation";
import { FileDownload } from "./FileDownload";

const SESSION_KEY = "agente-oc-sap-session-id";

type ChatProps = {
  initialSession: SessionData | null;
  onCaseProcessed: (caso: string) => void;
};

function toolResultPreview(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 1400 ? `${text.slice(0, 1400)}…` : text;
}

function ToolCallBlock({ call }: { call: ToolCallView }) {
  const status = call.running ? "ejecutando" : call.ok === false ? "error" : "ok";
  return (
    <details className={`tool-call tool-call-${status}`}>
      <summary>
        <span className="tool-icon">🔧</span>
        <span className="tool-name">{call.name}</span>
        <span className={`tool-status ${status}`}>{status}</span>
      </summary>
      <div className="tool-body">
        <p className="tool-label">Argumentos</p>
        <pre>{toolResultPreview(call.arguments)}</pre>
        {call.result !== undefined && (
          <>
            <p className="tool-label">Resultado</p>
            <pre>{toolResultPreview(call.result)}</pre>
          </>
        )}
      </div>
    </details>
  );
}

export function Chat({ initialSession, onCaseProcessed }: ChatProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [currentCase, setCurrentCase] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const caseRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (initialSession) {
      const chatMessages = toChatMessages(initialSession.messages);
      const caso = extractCase(chatMessages);
      setSessionId(initialSession.id);
      setMessages(chatMessages);
      setCurrentCase(caso);
      caseRef.current = caso;
      setConfirmation(
        initialSession.status === "paused"
          ? {
              needsConfirmation: true,
              message:
                [...chatMessages].reverse().find((message) => message.role === "assistant")
                  ?.content ?? "La sesión quedó pendiente de confirmación.",
              pending: [],
            }
          : null,
      );
      return () => {
        cancelled = true;
      };
    }

    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      void fetchSession(stored).then((session) => {
        if (cancelled || !session) return;
        const chatMessages = toChatMessages(session.messages);
        setSessionId(session.id);
        setMessages(chatMessages);
        const caso = extractCase(chatMessages);
        setCurrentCase(caso);
        caseRef.current = caso;
      });
    }

    return () => {
      cancelled = true;
    };
  }, [initialSession]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, confirmation]);

  const send = async (rawMessage: string): Promise<void> => {
    const text = rawMessage.trim();
    if (!text || busy) return;

    const assistantId = crypto.randomUUID();
    setError(null);
    setConfirmation(null);
    setBusy(true);
    setInput("");
    setMessages((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: "user", content: text },
      { id: assistantId, role: "assistant", content: "", toolCalls: [] },
    ]);

    let activeSession = sessionId;

    try {
      await streamChat(activeSession, text, (event, data) => {
        if (event === "session") {
          const payload = data as { sessionId: string };
          activeSession = payload.sessionId;
          setSessionId(payload.sessionId);
          localStorage.setItem(SESSION_KEY, payload.sessionId);
          return;
        }

        if (event === "token") {
          const payload = data as { delta: string };
          setMessages((previous) =>
            previous.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + payload.delta }
                : message,
            ),
          );
          return;
        }

        if (event === "tool_start") {
          const payload = data as { name: string; arguments: Record<string, unknown> };
          const caso = payload.arguments.caso;
          if (typeof caso === "string") {
            caseRef.current = caso;
            setCurrentCase(caso);
          }
          setMessages((previous) =>
            previous.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    toolCalls: [
                      ...(message.toolCalls ?? []),
                      {
                        id: crypto.randomUUID(),
                        name: payload.name,
                        arguments: payload.arguments,
                        running: true,
                      },
                    ],
                  }
                : message,
            ),
          );
          return;
        }

        if (event === "tool_end") {
          const payload = data as {
            name: string;
            arguments: Record<string, unknown>;
            ok: boolean;
            result: string;
          };
          const caso = payload.arguments.caso;
          if (typeof caso === "string") {
            caseRef.current = caso;
            setCurrentCase(caso);
          }
          setMessages((previous) =>
            previous.map((message) => {
              if (message.id !== assistantId || !message.toolCalls) return message;
              const toolCalls = [...message.toolCalls];
              for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
                const call = toolCalls[index];
                if (call && call.name === payload.name && call.running) {
                  toolCalls[index] = {
                    ...call,
                    result: payload.result,
                    ok: payload.ok,
                    running: false,
                  };
                  break;
                }
              }
              return { ...message, toolCalls };
            }),
          );
          return;
        }

        if (event === "confirmation") {
          setConfirmation(data as ConfirmationState);
          return;
        }

        if (event === "error") {
          setError((data as { error: string }).error);
          return;
        }

        if (event === "done") {
          const payload = data as DonePayload;
          setMessages((previous) =>
            previous.map((message) => {
              if (message.id !== assistantId) return message;
              const toolCalls: ToolCallView[] | undefined =
                payload.toolCalls.length > 0
                  ? payload.toolCalls.map((call, index) => ({
                      id: `done-${index}`,
                      name: call.name,
                      arguments: call.arguments,
                      result: call.result,
                      ok: call.ok,
                      running: false,
                    }))
                  : message.toolCalls;
              return {
                ...message,
                content: payload.reply || message.content,
                ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
              };
            }),
          );
          activeSession = payload.sessionId;
          setSessionId(payload.sessionId);
          localStorage.setItem(SESSION_KEY, payload.sessionId);
          setConfirmation(payload.needsConfirmation ? payload.confirmation : null);

          const doneCase =
            payload.toolCalls
              .map((call) => call.arguments.caso)
              .find((caso): caso is string => typeof caso === "string") ?? caseRef.current;
          if (doneCase) {
            caseRef.current = doneCase;
            setCurrentCase(doneCase);
            onCaseProcessed(doneCase);
          }
        }
      });
    } catch (streamError) {
      const detail = streamError instanceof Error ? streamError.message : String(streamError);
      setError(detail);
      setMessages((previous) =>
        previous.map((message) =>
          message.id === assistantId && message.content === ""
            ? { ...message, content: `Error de conexión: ${detail}` }
            : message,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void send(input);
  };

  const confirm = (): void => {
    void send("Confirmo la creación de la orden de compra con las excepciones indicadas.");
  };

  const cancel = (): void => {
    void send("Cancelo la creación de la orden de compra.");
  };

  return (
    <section className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <h2>Agente de órdenes de compra SAP</h2>
            <p>
              Pedile que procese un caso. El agente lee el paquete, valida contra los
              maestros, arma la OC y pide confirmación cuando hace falta.
            </p>
            <div className="suggestions">
              {["sol-001", "sol-002", "sol-004", "sol-005"].map((caso) => (
                <button key={caso} type="button" onClick={() => void send(`Procesá ${caso}`)}>
                  Procesá {caso}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <article key={message.id} className={`message message-${message.role}`}>
            <header>
              {message.role === "user" ? "Analista" : "Agente"}
            </header>
            {message.content && <div className="message-content">{message.content}</div>}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="tool-calls">
                {message.toolCalls.map((call) => (
                  <ToolCallBlock key={call.id} call={call} />
                ))}
              </div>
            )}
          </article>
        ))}

        {busy && (
          <div className="thinking" role="status">
            <span className="spinner" />
            Pensando…
          </div>
        )}

        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {confirmation?.needsConfirmation && (
        <Confirmation
          message={confirmation.message}
          pending={confirmation.pending}
          onConfirm={confirm}
          onCancel={cancel}
          disabled={busy}
        />
      )}

      {currentCase && <FileDownload caso={currentCase} />}

      <form className="chat-input" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(input);
            }
          }}
          placeholder={
            confirmation?.needsConfirmation
              ? "Escribí 'confirmo' o usá los botones de arriba…"
              : "Ej.: Procesá la solicitud sol-004 y mostrame la OC antes de crearla"
          }
          rows={2}
          disabled={busy}
        />
        <button type="submit" disabled={busy || input.trim() === ""}>
          {busy ? "Procesando…" : "Enviar"}
        </button>
      </form>
    </section>
  );
}
