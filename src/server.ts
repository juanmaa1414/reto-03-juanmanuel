import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, sep } from "node:path";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "@hono/node-server/serve-static";
import { SessionStore } from "./agent/sessions.js";
import {
  runAgentLoop,
  parseToolResult,
  type AgentLoopResult,
  type ToolCallLog,
  type ToolGuard,
} from "./agent/loop.js";
import { createOpenCodeGoAdapter } from "./llm/opencode.js";
import type { LLMAdapter } from "./llm/adapter.js";
import { tools as defaultTools } from "./tools/oc.js";
import type { ToolRegistry } from "./tools/contract.js";
import { getConfig, loadEnvFile, type Config } from "./env.js";
import { logError, redactSecrets } from "./logger.js";
import { outPath } from "./tools/fixtures.js";
import type { StoredSession } from "./agent/sessions.js";

export type AppOptions = {
  directory?: string;
  adapter?: LLMAdapter;
  tools?: ToolRegistry;
  config?: Config;
  sessionStore?: SessionStore;
  systemPrompt?: string;
};

type ChatBody = {
  sessionId?: string;
  message?: string;
  stream?: boolean;
};

type CaseRow = {
  solicitud_id: string;
  resultado: string;
  numero_oc: string | null;
  retroactiva: boolean;
  bloqueos: string[];
  confirmaciones: string[];
  ts: string;
};

type SessionCaseState = {
  boundCase: string | null;
  finalized: boolean;
  numeroOc: string | null;
};

const CASE_MENTION = /\bsol-\d{3}\b/gi;

export function loadSystemPrompt(directory: string): string {
  const path = resolve(directory, "agent/prompt.md");
  if (!existsSync(path)) {
    throw new Error(
      "Falta agent/prompt.md: el system prompt debe vivir en un archivo, no en el código.",
    );
  }
  return readFileSync(path, "utf8");
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function readControlRows(directory: string): CaseRow[] {
  const path = outPath(directory, "control.csv");
  if (!existsSync(path)) return [];
  const [headerLine, ...lines] = readFileSync(path, "utf8").split(/\r?\n/);
  if (!headerLine) return [];
  const header = parseCsvLine(headerLine);
  return lines
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const values = parseCsvLine(line);
      const row = Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""]));
      return {
        solicitud_id: row.solicitud_id ?? "",
        resultado: row.resultado ?? "",
        numero_oc: row.numero_oc ? row.numero_oc : null,
        retroactiva: row.retroactiva === "true",
        bloqueos: row.bloqueos ? row.bloqueos.split(" | ") : [],
        confirmaciones: row.confirmaciones ? row.confirmaciones.split(" | ") : [],
        ts: row.ts ?? "",
      } satisfies CaseRow;
    });
}

function fileContentType(fileName: string): string {
  if (fileName.endsWith(".json")) return "application/json; charset=utf-8";
  if (fileName.endsWith(".pdf")) return "application/pdf";
  if (fileName.endsWith(".csv")) return "text/csv; charset=utf-8";
  return "text/plain; charset=utf-8";
}

function readSessionCaseState(session: StoredSession): SessionCaseState {
  const caso = session.metadata?.caso;
  const numeroOc = session.metadata?.numero_oc;
  return {
    boundCase: typeof caso === "string" && caso.length > 0 ? caso : null,
    finalized:
      session.status === "completed" || session.metadata?.finalized === true,
    numeroOc: typeof numeroOc === "string" && numeroOc.length > 0 ? numeroOc : null,
  };
}

function detectCaseMentions(message: string): string[] {
  const matches = message.match(CASE_MENTION) ?? [];
  return [...new Set(matches.map((match) => match.toLowerCase()))];
}

function runtimeSystemPrompt(base: string, state: SessionCaseState): string {
  const lines = [base, "", "## Contexto de esta sesión"];

  if (state.boundCase) {
    lines.push(
      `- Esta sesión está vinculada exclusivamente al caso ${state.boundCase}. No proceses ningún otro caso.`,
    );
  } else {
    lines.push(
      "- Esta sesión todavía no tiene un caso asignado. El primer caso que proceses quedará fijado para toda la sesión.",
    );
  }

  if (state.finalized) {
    lines.push(
      `- El caso ${state.boundCase ?? ""} ya fue finalizado${state.numeroOc ? ` con la OC ${state.numeroOc}` : ""}. Solo responde preguntas sobre este caso. No vuelvas a procesarlo, a generar evidencia ni a crear otra OC.`,
    );
  } else if (state.boundCase) {
    lines.push(
      "- Si el caso está bloqueado o pendiente, cualquier corrección debe hacerse volviendo a esta misma sesión. Si el usuario pide otro caso, indícale que abra su sesión o que inicie un nuevo caso.",
    );
  }

  return lines.join("\n");
}

/** Collect case identifiers from the tool calls so the sidebar can link them. */
function sessionMetadata(result: AgentLoopResult): Record<string, unknown> {
  let caso: string | null = null;
  let solicitudId: string | null = null;
  for (const log of result.toolCalls) {
    if (!caso && typeof log.arguments.caso === "string") caso = log.arguments.caso;
    const parsed = parseToolResult(log.result);
    if (parsed?.ok && parsed.data && typeof parsed.data === "object") {
      const data = parsed.data as { solicitud?: { solicitud_id?: string } };
      if (data.solicitud?.solicitud_id) solicitudId = data.solicitud.solicitud_id;
    }
  }
  return {
    ...(caso ? { caso } : {}),
    ...(solicitudId ? { solicitud_id: solicitudId } : {}),
  };
}

function extractFinalization(
  result: AgentLoopResult,
  state: SessionCaseState,
): { finalized: boolean; numeroOc: string | null } {
  let finalized = state.finalized;
  let numeroOc = state.numeroOc;
  for (const log of result.toolCalls) {
    if (log.name !== "oc_crear" || !log.ok) continue;
    const parsed = parseToolResult(log.result);
    if (!parsed?.ok) continue;
    finalized = true;
    const data = parsed.data as { numero_oc?: string };
    if (typeof data.numero_oc === "string") numeroOc = data.numero_oc;
  }
  return { finalized, numeroOc };
}

function nextSessionStatus(
  finalized: boolean,
  needsConfirmation: boolean,
  previous: StoredSession["status"],
): StoredSession["status"] {
  if (finalized) return "completed";
  if (needsConfirmation) return "paused";
  if (previous === "paused") return "paused";
  return "active";
}

export function createApp(options: AppOptions = {}): Hono {
  const directory = options.directory ?? process.cwd();
  loadEnvFile(directory);
  const config = options.config ?? getConfig();
  const toolRegistry = options.tools ?? defaultTools;
  const sessionStore = options.sessionStore ?? new SessionStore(directory);
  const systemPrompt = options.systemPrompt ?? loadSystemPrompt(directory);

  const app = new Hono();

  const resolveAdapter = (): LLMAdapter | null => {
    if (options.adapter) return options.adapter;
    if (!config.opencodeApiKey) return null;
    return createOpenCodeGoAdapter({
      apiKey: config.opencodeApiKey,
      modelId: config.modelId,
    });
  };

  app.get("/api/health", (c) =>
    c.json({ ok: true, provider: "opencode-go", model: config.modelId }),
  );

  app.get("/api/sessions/:id", (c) => {
    const session = sessionStore.get(c.req.param("id"));
    if (!session) return c.json({ ok: false, error: "Sesión no encontrada." }, 404);
    return c.json({ ok: true, data: session });
  });

  app.get("/api/cases", (c) => {
    const orderNumbers = new Map<string, string>();
    const ordersPath = outPath(directory, "sap", "ordenes.jsonl");
    if (existsSync(ordersPath)) {
      for (const line of readFileSync(ordersPath, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as {
            numero_oc?: string;
            orden?: { referencia?: { solicitud_id?: string } };
          };
          const requestId = parsed.orden?.referencia?.solicitud_id;
          if (requestId && parsed.numero_oc) orderNumbers.set(requestId, parsed.numero_oc);
        } catch {
          // Ignore malformed history lines.
        }
      }
    }

    // A case can have several attempts in control.csv (blocked, pending, successful).
    // The sidebar only needs its latest state.
    const latestByRequest = new Map<string, CaseRow>();
    for (const row of readControlRows(directory)) {
      const enriched = {
        ...row,
        numero_oc: row.numero_oc ?? orderNumbers.get(row.solicitud_id) ?? null,
      };
      const previous = latestByRequest.get(row.solicitud_id);
      if (!previous || row.ts >= previous.ts) {
        latestByRequest.set(row.solicitud_id, enriched);
      }
    }
    return c.json({ ok: true, data: [...latestByRequest.values()] });
  });

  app.get("/api/files/:caso", (c) => {
    const caso = c.req.param("caso");
    if (caso.includes("..") || caso.includes("/") || caso.includes("\\")) {
      return c.json({ ok: false, error: "Nombre de caso inválido." }, 400);
    }
    const caseDir = outPath(directory, caso);
    if (!existsSync(caseDir)) {
      return c.json({ ok: true, data: { caso, files: [] as string[] } });
    }
    const allowed = ["trazabilidad.json", "aprobacion.txt", "aprobacion.pdf"];
    const available = new Set(readdirSync(caseDir));
    return c.json({
      ok: true,
      data: { caso, files: allowed.filter((file) => available.has(file)) },
    });
  });

  app.get("/api/files/:caso/:filename", (c) => {
    const caso = c.req.param("caso");
    const filename = c.req.param("filename");
    if (
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\") ||
      caso.includes("..") ||
      caso.includes("/") ||
      caso.includes("\\")
    ) {
      return c.json({ ok: false, error: "Nombre de archivo inválido." }, 400);
    }
    const base = outPath(directory, caso);
    const filePath = resolve(base, filename);
    if (!filePath.startsWith(`${base}${sep}`)) {
      return c.json({ ok: false, error: "Ruta fuera del directorio del caso." }, 400);
    }
    if (!existsSync(filePath)) {
      return c.json({ ok: false, error: "Archivo no encontrado." }, 404);
    }
    const content = readFileSync(filePath);
    return c.body(content, 200, {
      "Content-Type": fileContentType(filename),
      "Content-Disposition": `inline; filename="${filename}"`,
    });
  });

  app.get("/api/sessions", (c) => c.json({ ok: true, data: sessionStore.list() }));

  app.get("/api/control.csv", (c) => {
    const path = outPath(directory, "control.csv");
    if (!existsSync(path)) {
      return c.body(
        "solicitud_id,resultado,numero_oc,retroactiva,bloqueos,confirmaciones,ts\n",
        200,
        {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="control.csv"',
        },
      );
    }
    return c.body(readFileSync(path), 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="control.csv"',
    });
  });

  app.post("/api/chat", async (c) => {
    let body: ChatBody;
    try {
      body = (await c.req.json()) as ChatBody;
    } catch {
      return c.json({ ok: false, error: "El cuerpo debe ser JSON válido." }, 400);
    }
    if (typeof body.message !== "string" || body.message.trim() === "") {
      return c.json({ ok: false, error: "El campo 'message' es obligatorio." }, 400);
    }

    const session = sessionStore.getOrCreate(body.sessionId);
    const state = readSessionCaseState(session);
    const accept = c.req.header("accept") ?? "";
    const wantsStream = body.stream !== false && accept.includes("text/event-stream");

    let messages = [...session.messages, { role: "user" as const, content: body.message }];
    sessionStore.save({ ...session, messages });

    const replyWith = (
      reply: string,
      currentState: SessionCaseState,
      status: StoredSession["status"],
    ): Response => {
      const latest = sessionStore.get(session.id) ?? session;
      const saved = sessionStore.save({
        ...latest,
        messages: [...messages, { role: "assistant", content: reply }],
        metadata: {
          ...latest.metadata,
          ...(currentState.boundCase ? { caso: currentState.boundCase } : {}),
          ...(currentState.finalized ? { finalized: true } : {}),
          ...(currentState.numeroOc ? { numero_oc: currentState.numeroOc } : {}),
        },
        status,
      });
      const payload = {
        sessionId: saved.id,
        reply,
        toolCalls: [] as unknown[],
        needsConfirmation: false,
        confirmation: { needsConfirmation: false, message: "", pending: [] },
        boundCase: currentState.boundCase,
        finalized: currentState.finalized,
        numeroOc: currentState.numeroOc,
        sessionStatus: saved.status,
      };
      if (!wantsStream) return c.json({ ok: true, ...payload });
      return streamSSE(c, async (stream) => {
        await stream.writeSSE({
          event: "session",
          data: JSON.stringify({ sessionId: saved.id }),
        });
        await stream.writeSSE({
          event: "token",
          data: JSON.stringify({ delta: reply }),
        });
        await stream.writeSSE({ event: "done", data: JSON.stringify(payload) });
      }) as unknown as Response;
    };

    // Deterministic guards for session/case ownership.
    const mentions = detectCaseMentions(body.message);
    if (mentions.length > 1) {
      return replyWith(
        "Cada sesión trabaja un único caso. Inicia una sesión diferente para cada caso.",
        state,
        session.status,
      );
    }

    if (mentions.length === 1) {
      const caso = mentions[0] as string;

      if (state.finalized && state.boundCase && caso !== state.boundCase) {
        return replyWith(
          `Esta sesión está finalizada para el caso ${state.boundCase}. Solo puedes hacer preguntas sobre ese caso. Para trabajar con ${caso}, abre su sesión desde el panel lateral.`,
          state,
          "completed",
        );
      }

      if (state.boundCase && caso !== state.boundCase) {
        return replyWith(
          `Esta sesión está vinculada exclusivamente al caso ${state.boundCase}. Para trabajar con ${caso}, abre su sesión desde el panel lateral o inicia un nuevo caso.`,
          state,
          session.status,
        );
      }

      if (!state.boundCase) {
        const existing = sessionStore.findByCase(caso);
        if (existing && existing.id !== session.id) {
          return replyWith(
            `Ya existe una sesión para el caso ${caso}. Ábrela desde el panel lateral para continuar trabajando en ese caso.`,
            state,
            session.status,
          );
        }
        state.boundCase = caso;
        const latest = sessionStore.get(session.id) ?? session;
        sessionStore.save({
          ...latest,
          metadata: { ...latest.metadata, caso },
        });
      }
    }

    const adapter = resolveAdapter();
    if (!adapter) {
      return c.json(
        {
          ok: false,
          error:
            "OPENCODE_API_KEY no está configurada en el backend. Configúrala en .env para usar el chat; el demo y los tests no la necesitan.",
        },
        503,
      );
    }

    const guard: ToolGuard = (call) => {
      if (state.finalized) {
        return {
          allow: false,
          error:
            "La sesión está finalizada. Solo puedes responder preguntas sobre este caso; no se permite volver a procesarlo.",
        };
      }

      const caso = call.arguments.caso;
      if (typeof caso !== "string" || caso.length === 0) return { allow: true };

      if (state.boundCase && caso !== state.boundCase) {
        return {
          allow: false,
          error: `Esta sesión está vinculada exclusivamente al caso ${state.boundCase}. Para procesar ${caso}, abre su sesión desde el panel lateral o inicia un nuevo caso.`,
        };
      }

      if (!state.boundCase) {
        const existing = sessionStore.findByCase(caso);
        if (existing && existing.id !== session.id) {
          return {
            allow: false,
            error: `Ya existe una sesión para el caso ${caso}. Ábrela desde el panel lateral para continuar trabajando en ese caso.`,
          };
        }
        state.boundCase = caso;
        const latest = sessionStore.get(session.id) ?? session;
        sessionStore.save({
          ...latest,
          metadata: { ...latest.metadata, caso },
        });
      }

      return { allow: true };
    };

    const effectiveTools: ToolRegistry = state.finalized ? {} : toolRegistry;
    const effectivePrompt = runtimeSystemPrompt(systemPrompt, state);

    const onToolResult = (log: ToolCallLog): void => {
      if (log.name !== "oc_crear" || !log.ok) return;
      const parsed = parseToolResult(log.result);
      if (!parsed?.ok) return;
      state.finalized = true;
      const data = parsed.data as { numero_oc?: string };
      if (typeof data.numero_oc === "string") state.numeroOc = data.numero_oc;
    };

    if (!wantsStream) {
      const result = await runAgentLoop({
        adapter,
        tools: effectiveTools,
        messages,
        systemPrompt: effectivePrompt,
        context: { directory, sessionId: session.id },
        maxIterations: config.maxIterations,
        maxTokensPerSession: config.maxTokensPerSession,
        beforeToolCall: guard,
        onToolResult,
      });
      const finalization = extractFinalization(result, state);
      const latest = sessionStore.get(session.id) ?? session;
      const saved: StoredSession = sessionStore.save({
        ...latest,
        messages: result.messages,
        metadata: {
          ...latest.metadata,
          ...sessionMetadata(result),
          ...(state.boundCase ? { caso: state.boundCase } : {}),
          ...(finalization.finalized ? { finalized: true } : {}),
          ...(finalization.numeroOc ? { numero_oc: finalization.numeroOc } : {}),
        },
        status: finalization.finalized
          ? "completed"
          : result.needsConfirmation
            ? "paused"
            : nextSessionStatus(
                finalization.finalized,
                result.needsConfirmation,
                session.status,
              ),
      });
      return c.json({
        ok: true,
        sessionId: saved.id,
        reply: result.text,
        toolCalls: result.toolCalls,
        needsConfirmation: result.needsConfirmation,
        confirmation: result.confirmation,
        boundCase: state.boundCase,
        finalized: finalization.finalized,
        numeroOc: finalization.numeroOc,
        sessionStatus: saved.status,
      });
    }

    return streamSSE(c, async (stream) => {
      let queue: Promise<void> = Promise.resolve();
      const send = (event: string, data: unknown): void => {
        queue = queue.then(() =>
          stream.writeSSE({ event, data: JSON.stringify(data) }).then(() => undefined),
        );
      };

      send("session", { sessionId: session.id });

      const result = await runAgentLoop({
        adapter,
        tools: effectiveTools,
        messages,
        systemPrompt: effectivePrompt,
        context: { directory, sessionId: session.id },
        maxIterations: config.maxIterations,
        maxTokensPerSession: config.maxTokensPerSession,
        beforeToolCall: guard,
        onToolResult,
        onEvent: (event) => {
          if (event.type === "text") send("token", { delta: event.delta });
          else if (event.type === "tool_start")
            send("tool_start", { name: event.name, arguments: event.arguments });
          else if (event.type === "tool_end")
            send("tool_end", {
              name: event.name,
              arguments: event.arguments,
              ok: event.ok,
              result: event.result,
              durationMs: event.durationMs,
            });
          else if (event.type === "usage") send("usage", event.usage);
          else if (event.type === "confirmation") send("confirmation", event.state);
          else if (event.type === "error") send("error", { error: event.error });
        },
      });

      const finalization = extractFinalization(result, state);
      const latest = sessionStore.get(session.id) ?? session;
      const saved = sessionStore.save({
        ...latest,
        messages: result.messages,
        metadata: {
          ...latest.metadata,
          ...sessionMetadata(result),
          ...(state.boundCase ? { caso: state.boundCase } : {}),
          ...(finalization.finalized ? { finalized: true } : {}),
          ...(finalization.numeroOc ? { numero_oc: finalization.numeroOc } : {}),
        },
        status: finalization.finalized
          ? "completed"
          : result.needsConfirmation
            ? "paused"
            : nextSessionStatus(
                finalization.finalized,
                result.needsConfirmation,
                session.status,
              ),
      });

      send("done", {
        sessionId: saved.id,
        reply: result.text,
        toolCalls: result.toolCalls,
        needsConfirmation: result.needsConfirmation,
        confirmation: result.confirmation,
        boundCase: state.boundCase,
        finalized: finalization.finalized,
        numeroOc: finalization.numeroOc,
        sessionStatus: saved.status,
      });

      await queue;
    });
  });

  app.onError((error, c) => {
    logError(directory, error, { stage: "http", path: c.req.path });
    return c.json(
      {
        ok: false,
        error: redactSecrets(
          error instanceof Error ? error.message : "Error interno del servidor.",
        ),
      },
      500,
    );
  });

  // Serve the built React app when web/dist exists (Docker/Railway/`npm start`).
  const webRoot = resolve(directory, "web/dist");
  if (existsSync(webRoot)) {
    app.use("/assets/*", serveStatic({ root: webRoot }));
    app.get("/", serveStatic({ path: resolve(webRoot, "index.html") }));
  }

  app.notFound((c) => c.json({ ok: false, error: "Ruta no encontrada." }, 404));

  return app;
}
