import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSapAdapter } from "../../src/sap/mock.js";
import { appendControlLog } from "../../src/sap/control.js";
import { makePurchaseOrder, testContext, outputExists } from "../helpers.js";

function orderLines(): string[] {
  return readFileSync(`${testContext.directory}/out/sap/ordenes.jsonl`, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "");
}

describe("SapAdapter mock (4.1, 4.2)", () => {
  it("assigns sequential numbers starting at 4500000001", async () => {
    const adapter = createSapAdapter(testContext.directory);
    const first = await adapter.crearOrden(makePurchaseOrder("SOL-001"));
    const second = await adapter.crearOrden(makePurchaseOrder("SOL-002"));

    expect(first.numero_oc).toBe("4500000001");
    expect(first.idempotente).toBe(false);
    expect(second.numero_oc).toBe("4500000002");
    expect(orderLines()).toHaveLength(2);
  });

  it("is idempotent by solicitud_id and does not append a second line", async () => {
    const adapter = createSapAdapter(testContext.directory);
    const first = await adapter.crearOrden(makePurchaseOrder("SOL-001"));
    const second = await adapter.crearOrden(makePurchaseOrder("SOL-001"));

    expect(second.numero_oc).toBe(first.numero_oc);
    expect(second.idempotente).toBe(true);
    expect(orderLines()).toHaveLength(1);
  });

  it("finds an existing order by reference", async () => {
    const adapter = createSapAdapter(testContext.directory);
    await expect(adapter.buscarOrdenPorReferencia("SOL-001")).resolves.toBeNull();

    const created = await adapter.crearOrden(makePurchaseOrder("SOL-001"));
    await expect(adapter.buscarOrdenPorReferencia("SOL-001")).resolves.toEqual({
      numero_oc: created.numero_oc,
    });
  });

  it("returns supplier SAP code and active flag from master data", async () => {
    const adapter = createSapAdapter(testContext.directory);
    await expect(adapter.consultarProveedor("900.555.111-2")).resolves.toEqual({
      codigo_sap: "100234",
      activo: true,
    });
    await expect(adapter.consultarProveedor("901777888")).resolves.toEqual({
      codigo_sap: "100402",
      activo: false,
    });
    await expect(adapter.consultarProveedor("000000000")).resolves.toBeNull();
  });
});

describe("control log CSV (4.3)", () => {
  it("creates the file with a header and appends rows across calls", () => {
    appendControlLog(testContext.directory, {
      solicitud_id: "SOL-2026-001",
      resultado: "exitoso",
      numero_oc: "4500000001",
      retroactiva: false,
      bloqueos: [],
      confirmaciones: [],
    });
    appendControlLog(testContext.directory, {
      solicitud_id: "SOL-2026-002",
      resultado: "bloqueado",
      retroactiva: false,
      bloqueos: ["RC1: proveedor no existe"],
      confirmaciones: [],
    });
    appendControlLog(testContext.directory, {
      solicitud_id: "SOL-2026-005",
      resultado: "pendiente",
      retroactiva: true,
      bloqueos: [],
      confirmaciones: ["RC8: retroactiva"],
    });

    expect(outputExists("control.csv")).toBe(true);
    const lines = readFileSync(`${testContext.directory}/out/control.csv`, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "");

    expect(lines[0]).toBe(
      "solicitud_id,resultado,numero_oc,retroactiva,bloqueos,confirmaciones,ts",
    );
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain("SOL-2026-001,exitoso,4500000001,false");
    expect(lines[2]).toContain("SOL-2026-002,bloqueado,,false");
    expect(lines[3]).toContain("SOL-2026-005,pendiente,,true");
  });
});
