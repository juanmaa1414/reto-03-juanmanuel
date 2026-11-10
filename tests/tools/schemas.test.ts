import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildPayloadArgs,
  createOrderArgs,
  generateEvidenceArgs,
  readPackageArgs,
  validateArgs,
} from "../../src/schemas/tools.js";
import { purchaseOrderSchema } from "../../src/schemas/purchase-order.js";
import { validateAndExecute, type AnyTool } from "../../src/tools/contract.js";
import { readPackage } from "../../src/tools/oc/read-package.js";
import { makePurchaseOrder, testContext } from "../helpers.js";

describe("purchase order schema (2.2)", () => {
  it("accepts a valid purchase order", () => {
    const parsed = purchaseOrderSchema.safeParse(makePurchaseOrder("SOL-2026-001"));
    expect(parsed.success).toBe(true);
  });

  it("rejects an invalid company code", () => {
    const order = { ...makePurchaseOrder("SOL-2026-001"), sociedad: "2000" };
    expect(purchaseOrderSchema.safeParse(order).success).toBe(false);
  });

  it("rejects an unsupported currency", () => {
    const order = { ...makePurchaseOrder("SOL-2026-001"), moneda: "EUR" };
    expect(purchaseOrderSchema.safeParse(order).success).toBe(false);
  });

  it("rejects descriptions longer than 40 characters", () => {
    const order = makePurchaseOrder("SOL-2026-001");
    order.posiciones[0]!.descripcion = "x".repeat(41);
    expect(purchaseOrderSchema.safeParse(order).success).toBe(false);
  });
});

describe("tool argument schemas (2.3)", () => {
  it("validates sample arguments for every tool", async () => {
    const loaded = await readPackage(testContext.directory, "sol-001");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    expect(readPackageArgs.safeParse({ caso: "sol-001" }).success).toBe(true);
    expect(
      validateArgs.safeParse({ caso: "sol-001", paquete: loaded.packageData }).success,
    ).toBe(true);
    expect(
      buildPayloadArgs.safeParse({
        caso: "sol-001",
        paquete: loaded.packageData,
        derivados: { condiciones_pago: "Z030" },
      }).success,
    ).toBe(true);
    expect(generateEvidenceArgs.safeParse({ caso: "sol-001" }).success).toBe(true);
    expect(
      createOrderArgs.safeParse({
        caso: "sol-001",
        payload: makePurchaseOrder("SOL-2026-001"),
        confirmado: true,
      }).success,
    ).toBe(true);
  });

  it("rejects invalid arguments", () => {
    expect(readPackageArgs.safeParse({ caso: "" }).success).toBe(false);
    expect(validateArgs.safeParse({ caso: "sol-001" }).success).toBe(false);
    expect(
      createOrderArgs.safeParse({
        caso: "sol-001",
        payload: { ...makePurchaseOrder("SOL-2026-001"), sociedad: "9999" },
      }).success,
    ).toBe(false);
  });
});

describe("tool contract (2.4)", () => {
  it("rejects invalid arguments without executing the tool", async () => {
    let executed = false;
    const tool: AnyTool = {
      description: "test",
      args: { caso: z.string() },
      async execute() {
        executed = true;
        return JSON.stringify({ ok: true, data: "done" });
      },
    };

    const result = JSON.parse(
      await validateAndExecute(tool, { caso: 123 }, testContext),
    ) as { ok: boolean; error?: string };

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Argumentos inválidos");
    expect(executed).toBe(false);
  });

  it("never throws when the tool execution fails", async () => {
    const tool: AnyTool = {
      description: "test",
      args: { caso: z.string() },
      async execute() {
        throw new Error("boom");
      },
    };

    const raw = await validateAndExecute(tool, { caso: "sol-001" }, testContext);
    const result = JSON.parse(raw) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain("boom");
  });
});
