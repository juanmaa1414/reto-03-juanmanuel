import { describe, expect, it } from "vitest";
import { tools } from "../../src/tools/oc.js";

describe("tool registry (3.6)", () => {
  it("exposes the five business tools under their model names", () => {
    expect(Object.keys(tools).sort()).toEqual([
      "oc_construir_payload",
      "oc_crear",
      "oc_generar_evidencia",
      "oc_leer_paquete",
      "oc_validar",
    ]);
  });

  it("every tool has a description, zod args and an execute function", () => {
    for (const [name, tool] of Object.entries(tools)) {
      expect(name.startsWith("oc_")).toBe(true);
      expect(tool.description.length).toBeGreaterThan(10);
      expect(Object.keys(tool.args).length).toBeGreaterThan(0);
      expect(typeof tool.execute).toBe("function");
    }
  });
});
