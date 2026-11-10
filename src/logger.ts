import { appendFileSync } from "node:fs";
import { outPath } from "./tools/fixtures.js";
import { ensureParentDirectory, summarize } from "./util.js";

/** Remove configured secrets from any string before logging or returning it. */
export function redactSecrets(value: string): string {
  const secrets = [process.env.OPENCODE_API_KEY, process.env.DEEPSEEK_API_KEY].filter(
    (secret): secret is string => typeof secret === "string" && secret.length >= 4,
  );
  return secrets.reduce((result, secret) => result.split(secret).join("[REDACTED]"), value);
}

export function appendJsonLine(
  directory: string,
  fileName: string,
  entry: Record<string, unknown>,
): void {
  const path = outPath(directory, fileName);
  ensureParentDirectory(path);
  const line = JSON.stringify({ ...entry, ts: new Date().toISOString() });
  appendFileSync(path, `${redactSecrets(line)}\n`, "utf8");
}

export function logToolCall(
  directory: string,
  entry: {
    sessionId: string;
    name: string;
    arguments: Record<string, unknown>;
    result: string;
    ok: boolean;
    durationMs: number;
  },
): void {
  appendJsonLine(directory, "log.jsonl", {
    type: "tool_call",
    ...entry,
    arguments: entry.arguments,
    result: summarize(entry.result),
  });
}

export function logError(
  directory: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  appendJsonLine(directory, "log.jsonl", {
    type: "error",
    message: redactSecrets(message),
    ...context,
  });
}
