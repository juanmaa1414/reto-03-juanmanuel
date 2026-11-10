import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load `.env` when it exists (Node >= 20.12 exposes process.loadEnvFile).
 * Existing environment variables are not overwritten.
 */
export function loadEnvFile(directory: string = process.cwd()): void {
  const envPath = resolve(directory, ".env");
  if (!existsSync(envPath)) return;
  try {
    process.loadEnvFile(envPath);
  } catch {
    // If the runtime does not support loadEnvFile, use the current environment.
  }
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export type Config = {
  port: number;
  modelId: string;
  opencodeApiKey: string;
  maxIterations: number;
  maxTokensPerSession: number;
};

export function getConfig(): Config {
  return {
    port: intFromEnv("PORT", 3000),
    modelId: process.env.MODEL_ID?.trim() || "deepseek-v4.1-flash",
    opencodeApiKey: process.env.OPENCODE_API_KEY?.trim() || "",
    maxIterations: intFromEnv("MAX_ITERATIONS", 25),
    maxTokensPerSession: intFromEnv("MAX_TOKENS_PER_SESSION", 500_000),
  };
}
