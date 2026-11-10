import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { construir_payload, crear, leer_paquete, validar } from "../../src/tools/oc.js";
import type { PackageData, PurchaseOrder, ValidationResult } from "../../src/types.js";
import {
  makePurchaseOrder,
  outputExists,
  readOutputText,
  testContext,
} from "../helpers.js";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function realPayload(caso: string): Promise<PurchaseOrder> {
  const read = JSON.parse(
    await leer_paquete.execute({ caso }, testContext),
  ) as Result<PackageData>;
  if (!read.ok) throw new Error(read.error);
  const validation = JSON.parse(
    await validar.execute({ caso, paquete: read.data }, testContext),
  ) as Result<ValidationResult>;
  if (!validation.ok) throw new Error(validation.error);
  const built = JSON.parse(
    await construir_payload.execute(
      { caso, paquete: read.data, derivados: validation.data.derivados },
      testContext,
    ),
  ) as Result<{ payload: PurchaseOrder }>;
  if (!built.ok) throw new Error(built.error);
  return built.data.payload;
}

describe("oc_crear (3.5)", () => {
  it("creates a successful order and logs it to control.csv", async () => {
    const payload = await realPayload("sol-001");
    const result = JSON.parse(
      await crear.execute({ caso: "sol-001", payload, confirmado: true }, testContext),
    ) as Result<{ numero_oc: string; idempotente: boolean }>;

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.numero_oc).toBe("4500000001");
    expect(result.data.idempotente).toBe(false);
    expect(outputExists("sap", "ordenes.jsonl")).toBe(true);
    expect(readOutputText("control.csv")).toContain("SOL-2026-001,exitoso,4500000001");
  });

  it("blocks creation when validation has blocking findings", async () => {
    const result = JSON.parse(
      await crear.execute(
        {
          caso: "sol-002",
          payload: makePurchaseOrder("SOL-2026-002"),
          confirmado: true,
        },
        testContext,
      ),
    ) as Result<unknown>;

    expect(result.ok).toBe(false);
    expect(outputExists("sap", "ordenes.jsonl")).toBe(false);
    expect(readOutputText("control.csv")).toContain("SOL-2026-002,bloqueado");
  });

  it("leaves the case pending when confirmations were not confirmed", async () => {
    const result = JSON.parse(
      await crear.execute(
        { caso: "sol-004", payload: makePurchaseOrder("SOL-2026-004") },
        testContext,
      ),
    ) as Result<unknown>;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("confirmaciones pendientes");
    expect(outputExists("sap", "ordenes.jsonl")).toBe(false);
    expect(readOutputText("control.csv")).toContain("SOL-2026-004,pendiente");
  });

  it("is idempotent for the same solicitud_id", async () => {
    const payload = await realPayload("sol-001");
    const first = JSON.parse(
      await crear.execute({ caso: "sol-001", payload, confirmado: true }, testContext),
    ) as Result<{ numero_oc: string; idempotente: boolean }>;
    const second = JSON.parse(
      await crear.execute({ caso: "sol-001", payload, confirmado: true }, testContext),
    ) as Result<{ numero_oc: string; idempotente: boolean }>;

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.data.numero_oc).toBe(first.data.numero_oc);
    expect(second.data.idempotente).toBe(true);

    const lines = readFileSync(
      `${testContext.directory}/out/sap/ordenes.jsonl`,
      "utf8",
    )
      .split("\n")
      .filter((line) => line.trim() !== "");
    expect(lines).toHaveLength(1);
  });

  it("rejects a payload that belongs to another request", async () => {
    const result = JSON.parse(
      await crear.execute(
        { caso: "sol-001", payload: makePurchaseOrder("SOL-OTHER"), confirmado: true },
        testContext,
      ),
    ) as Result<unknown>;
    expect(result.ok).toBe(false);
  });
});
