import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  extractCase,
  fetchSession,
  fetchSessions,
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
import { Markdown } from "./Markdown";

export const SESSION_STORAGE_KEY = "agente-oc-sap-session-id";

const ALL_CASES = ["sol-001", "sol-002", "sol-003", "sol-004", "sol-005", "sol-006"];

type SessionState = {
  boundCase: string | null;
  finalized: boolean;
  numeroOc: string | null;
};

function stateFromSession(session: SessionData, messages: ChatMessage[]): SessionState {
  const caso = session.metadata?.caso;
  const numeroOc = session.metadata?.numero_oc;
  return {
    boundCase:
      (typeof caso === "string" && caso.length > 0 ? caso : null) ??
      extractCase(messages),
    finalized:
      session.status === "completed" || session.metadata?.finalized === true,
    numeroOc:
      typeof numeroOc === "string" && numeroOc.length > 0 ? numeroOc : null,
  };
}

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
  const [boundCase, setBoundCase] = useState<string | null>(null);
  const [finalized, setFinalized] = useState(false);
  const [numeroOc, setNumeroOc] = useState<string | null>(null);
  const [availableCases, setAvailableCases] = useState<string[]>(ALL_CASES);
  const [filesRefreshKey, setFilesRefreshKey] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const caseRef = useRef<string | null>(null);

  const applySession = (session: SessionData): void => {
    const chatMessages = toChatMessages(session.messages);
    const state = stateFromSession(session, chatMessages);
    setSessionId(session.id);
    setMessages(chatMessages);
    setCurrentCase(state.boundCase);
    setBoundCase(state.boundCase);
    setFinalized(state.finalized);
    setNumeroOc(state.numeroOc);
    caseRef.current = state.boundCase;
    setConfirmation(
      session.status === "paused" && !state.finalized
        ? {
            needsConfirmation: true,
            message:
              [...chatMessages].reverse().find((message) => message.role === "assistant")
                ?.content ?? "La sesión quedó pendiente de confirmación.",
            pending: [],
          }
        : null,
    );
    localStorage.setItem(SESSION_STORAGE_KEY, session.id);
  };

  useEffect(() => {
    let cancelled = false;

    if (initialSession) {
      applySession(initialSession);
      return () => {
        cancelled = true;
      };
    }

    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      void fetchSession(stored).then((session) => {
        if (cancelled || !session) return;
        applySession(session);
      });
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSession]);

  useEffect(() => {
    let cancelled = false;
    void fetchSessions().then((sessions) => {
      if (cancelled) return;
      const taken = new Set(
        sessions
          .map((session) => session.metadata?.caso)
          .filter((caso): caso is string => typeof caso === "string"),
      );
      setAvailableCases(ALL_CASES.filter((caso) => !taken.has(caso)));
    });
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
          localStorage.setItem(SESSION_STORAGE_KEY, payload.sessionId);
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
          if (typeof caso === "string" && (!boundCase || caso === boundCase)) {
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
          if (typeof caso === "string" && (!boundCase || caso === boundCase)) {
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
          if (
            payload.ok &&
            ["oc_construir_payload", "oc_generar_evidencia", "oc_crear"].includes(
              payload.name,
            )
          ) {
            setFilesRefreshKey((key) => key + 1);
          }
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
          localStorage.setItem(SESSION_STORAGE_KEY, payload.sessionId);

          const doneCase =
            payload.boundCase ??
            payload.toolCalls
              .map((call) => call.arguments.caso)
              .find((caso): caso is string => typeof caso === "string") ??
            caseRef.current;

          setBoundCase(doneCase);
          setFinalized(payload.finalized);
          setNumeroOc(payload.numeroOc);
          setConfirmation((previous) => {
            if (payload.finalized) return null;
            if (payload.needsConfirmation) return payload.confirmation;
            if (payload.sessionStatus === "paused") return previous;
            return null;
          });

          if (doneCase) {
            caseRef.current = doneCase;
            setCurrentCase(doneCase);
            onCaseProcessed(doneCase);
          }
          setFilesRefreshKey((key) => key + 1);
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
      {boundCase && (
        <div className={`case-context ${finalized ? "finalized" : ""}`}>
          <span className="case-context-badge">
            {finalized ? "Caso finalizado" : "Sesión exclusiva"}
          </span>
          <strong>{boundCase}</strong>
          {numeroOc && <span className="case-context-oc">OC {numeroOc}</span>}
          <span className="case-context-note">
            {finalized
              ? "Solo puedes hacer preguntas sobre este caso."
              : "No puedes procesar otro caso en esta sesión."}
          </span>
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 &&
          (boundCase ? (
            <div className="empty-state">
              <h2>Sesión vinculada a {boundCase}</h2>
              <p>
                Esta sesión ya está reservada para ese caso. Puedes continuar el
                trabajo pendiente o hacer preguntas sobre él.
              </p>
            </div>
          ) : (
            <div className="empty-state">
              <h2>Agente de órdenes de compra SAP</h2>
              <p>
                Cada sesión trabaja un único caso. Elige uno para comenzar; si ya
                tiene sesión, ábrela desde el panel de casos.
              </p>
              {availableCases.length > 0 ? (
                <div className="suggestions">
                  {availableCases.map((caso) => (
                    <button
                      key={caso}
                      type="button"
                      onClick={() => void send(`Procesa ${caso}`)}
                    >
                      Procesa {caso}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="suggestion-empty">
                  Todos los casos ya tienen una sesión abierta. Ábrela desde el
                  panel de casos para continuar o consultar.
                </p>
              )}
            </div>
          ))}

        {messages.map((message) => (
          <article key={message.id} className={`message message-${message.role}`}>
            <header>
              {message.role === "user" ? "Analista" : "Agente"}
            </header>
            {message.content &&
              (message.role === "assistant" ? (
                <Markdown>{message.content}</Markdown>
              ) : (
                <div className="message-content">{message.content}</div>
              ))}
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

      {(boundCase || currentCase) && (
        <FileDownload
          key={(boundCase ?? currentCase) as string}
          caso={(boundCase ?? currentCase) as string}
          refreshKey={filesRefreshKey}
        />
      )}

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
            finalized
              ? "Haz una pregunta sobre este caso…"
              : confirmation?.needsConfirmation
                ? "Escribe 'confirmo' o usa los botones de arriba…"
                : boundCase
                  ? "Continúa este caso o escribe una consulta…"
                  : "Ej.: Procesa la solicitud sol-004 y muéstrame la OC antes de crearla"
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
