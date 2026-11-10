import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Carga `.env` si existe (Node >= 20.12 expone process.loadEnvFile).
 * No sobreescribe variables ya presentes en el entorno.
 */
export function loadEnvFile(directory: string = process.cwd()): void {
  const envPath = resolve(directory, ".env");
  if (!existsSync(envPath)) return;
  try {
    process.loadEnvFile(envPath);
  } catch {
    // Si el runtime no soporta loadEnvFile, se usan las variables del entorno.
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
  deepseekApiKey: string;
  maxIterations: number;
  maxTokensPerSession: number;
};

export function getConfig(): Config {
  return {
    port: intFromEnv("PORT", 3000),
    modelId: process.env.MODEL_ID?.trim() || "deepseek-flash",
    deepseekApiKey: process.env.DEEPSEEK_API_KEY?.trim() || "",
    maxIterations: intFromEnv("MAX_ITERATIONS", 25),
    maxTokensPerSession: intFromEnv("MAX_TOKENS_PER_SESSION", 500_000),
  };
}
