import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSystemPrompt } from "../../src/server.js";
import { repoRoot } from "../helpers.js";

describe("system prompt and knowledge (7.1, 7.2)", () => {
  it("loads the agent prompt from agent/prompt.md", () => {
    const prompt = loadSystemPrompt(repoRoot);
    expect(prompt).toContain("Nunca inventes valores");
    expect(prompt).toContain("oc_leer_paquete");
    expect(prompt).toContain("confirmación");
    expect(prompt.length).toBeGreaterThan(500);
  });

  it("keeps the purchase order knowledge accessible and complete", () => {
    const knowledgePath = resolve(repoRoot, "src/knowledge/ordenes-compra.md");
    expect(existsSync(knowledgePath)).toBe(true);
    const knowledge = readFileSync(knowledgePath, "utf8");
    for (const rule of ["RC1", "RC2", "RC3", "RC4", "RC5", "RC6", "RC7", "RC8", "RC9", "RC10"]) {
      expect(knowledge).toContain(rule);
    }
    expect(knowledge).toContain("idempotencia");
  });

  it("does not hardcode the prompt in the server module", () => {
    const server = readFileSync(resolve(repoRoot, "src/server.ts"), "utf8");
    expect(server).toContain("agent/prompt.md");
    expect(server).not.toContain("Nunca inventes valores");
  });
});
