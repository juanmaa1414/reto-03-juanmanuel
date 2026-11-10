import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { tools as moduleTools } from "../../modulo/tools/oc.js";
import { tools as sourceTools } from "../../src/tools/oc.js";
import { repoRoot, testContext } from "../helpers.js";

function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  expect(text.startsWith("---\n")).toBe(true);
  const end = text.indexOf("\n---\n", 4);
  expect(end).toBeGreaterThan(0);
  return {
    frontmatter: text.slice(4, end),
    body: text.slice(end + 5),
  };
}

describe("reusable module consistency (11.4)", () => {
  it("agent.md has the required frontmatter and the exact system prompt body", () => {
    const agent = readFileSync(resolve(repoRoot, "modulo/agent.md"), "utf8");
    const prompt = readFileSync(resolve(repoRoot, "agent/prompt.md"), "utf8");
    const { frontmatter, body } = splitFrontmatter(agent);

    expect(frontmatter).toContain("description:");
    expect(frontmatter).toContain("mode: primary");
    expect(frontmatter).toContain("edit: deny");
    expect(frontmatter).toContain("bash: deny");
    expect(body).toBe(prompt);
  });

  it("SKILL.md has the required frontmatter and the exact knowledge body", () => {
    const skill = readFileSync(
      resolve(repoRoot, "modulo/skill/ordenes-compra/SKILL.md"),
      "utf8",
    );
    const knowledge = readFileSync(
      resolve(repoRoot, "src/knowledge/ordenes-compra.md"),
      "utf8",
    );
    const { frontmatter, body } = splitFrontmatter(skill);

    expect(frontmatter).toContain('name: "ordenes-compra"');
    expect(frontmatter).toMatch(/description:\s+.+/);
    expect(body).toBe(knowledge);
  });

  it("module tools re-export exactly the same tools without server dependencies", () => {
    expect(Object.keys(moduleTools).sort()).toEqual(Object.keys(sourceTools).sort());

    const moduleSource = readFileSync(
      resolve(repoRoot, "modulo/tools/oc.ts"),
      "utf8",
    );
    expect(moduleSource).toContain("../../src/tools/oc.js");
    expect(moduleSource).not.toContain("from \"hono\"");
    expect(moduleSource).not.toContain("src/server");
  });

  it("module tools can be imported and executed standalone", async () => {
    const result = JSON.parse(
      await moduleTools.oc_leer_paquete!.execute({ caso: "sol-001" } as never, testContext),
    ) as { ok: boolean; data?: { solicitud?: { solicitud_id?: string } } };
    expect(result.ok).toBe(true);
    expect(result.data?.solicitud?.solicitud_id).toBe("SOL-2026-001");
  });
});
