import { z, type ZodTypeAny } from "zod";

/** Forma de los argumentos: un esquema zod por campo, con `.describe()`. */
export type ToolArgs = Record<string, ZodTypeAny>;

export type ToolContext = {
  /** Raíz del proyecto; todas las rutas se resuelven desde aquí. */
  directory: string;
  sessionId: string;
};

/**
 * Contrato de herramienta exigido por el reto:
 * `{ description, args (zod), execute(args, ctx) }`.
 */
export type Tool<TArgs extends ToolArgs = ToolArgs> = {
  description: string;
  args: TArgs;
  execute: (
    args: z.infer<z.ZodObject<TArgs>>,
    ctx: ToolContext,
  ) => Promise<string>;
};

/**
 * Vista no genérica de una herramienta, apta para registros heterogéneos.
 * El parámetro `never` permite asignar herramientas con args específicos.
 */
export type AnyTool = {
  description: string;
  args: ToolArgs;
  execute: (args: never, ctx: ToolContext) => Promise<string>;
};

export type ToolRegistry = Record<string, AnyTool>;

/** Helper que preserva la inferencia de argumentos al declarar una herramienta. */
export function defineTool<TArgs extends ToolArgs>(tool: Tool<TArgs>): Tool<TArgs> {
  return tool;
}

export function ok<T>(data: T): string {
  return JSON.stringify({ ok: true, data });
}

export function fail(error: string): string {
  return JSON.stringify({ ok: false, error });
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Error desconocido";
  }
}

/**
 * Valida los argumentos con zod antes de ejecutar y garantiza que la
 * herramienta nunca lance: todo error se devuelve como `{ ok: false, error }`.
 */
export async function validateAndExecute(
  tool: AnyTool,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<string> {
  const schema = z.object(tool.args);
  const parsed = schema.safeParse(rawArgs);
  if (!parsed.success) {
    const detalle = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(args)"}: ${issue.message}`)
      .join("; ");
    return fail(`Argumentos inválidos: ${detalle}`);
  }

  try {
    return await tool.execute(parsed.data as never, ctx);
  } catch (error) {
    return fail(`Error ejecutando la herramienta: ${describeError(error)}`);
  }
}

export function createToolRegistry(tools: Record<string, AnyTool>): ToolRegistry {
  return tools;
}
