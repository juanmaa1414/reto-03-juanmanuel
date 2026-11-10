import { describe, expect, it } from "vitest";
import { readPackage } from "../../src/tools/oc/read-package.js";
import { validatePackage } from "../../src/tools/oc/validate.js";
import { loadMasterData } from "../../src/tools/fixtures.js";
import type { PackageData } from "../../src/types.js";
import { repoRoot } from "../helpers.js";

const masters = loadMasterData(repoRoot);

async function load(caso: string): Promise<PackageData> {
  const result = await readPackage(repoRoot, caso);
  if (!result.ok) throw new Error(result.error);
  return structuredClone(result.packageData);
}

describe("oc_validar rules RC1-RC10 (3.2)", () => {
  it("sol-001 is apt with no exceptions and payment terms derived", async () => {
    const validation = validatePackage(await load("sol-001"), masters);
    expect(validation.apta).toBe(true);
    expect(validation.bloqueos).toEqual([]);
    expect(validation.confirmaciones).toEqual([]);
    expect(validation.derivados.condiciones_pago).toBe("Z030");
  });

  it("RC1 blocks an unknown supplier (sol-002)", async () => {
    const validation = validatePackage(await load("sol-002"), masters);
    expect(validation.apta).toBe(false);
    expect(validation.bloqueos.join(" ")).toContain("RC1");
  });

  it("RC2 blocks an unauthorized approver (sol-003)", async () => {
    const validation = validatePackage(await load("sol-003"), masters);
    expect(validation.apta).toBe(false);
    expect(validation.bloqueos.join(" ")).toContain("RC2");
  });

  it("RC3 blocks an amount above the approver cap", async () => {
    const packageData = await load("sol-003");
    packageData.aprobacion!.de = "rtorres@periferia-ficticia.com";
    const validation = validatePackage(packageData, masters);
    expect(validation.apta).toBe(false);
    expect(validation.bloqueos.join(" ")).toContain("RC3");
  });

  it("RC4 blocks a subarea that does not belong to the cost center", async () => {
    const packageData = await load("sol-001");
    packageData.solicitud.subarea = "Compras";
    const validation = validatePackage(packageData, masters);
    expect(validation.apta).toBe(false);
    expect(validation.bloqueos.join(" ")).toContain("RC4");
  });

  it("RC5 asks for confirmation when the quote differs by more than 2% (sol-004)", async () => {
    const validation = validatePackage(await load("sol-004"), masters);
    expect(validation.apta).toBe(true);
    expect(validation.confirmaciones.join(" ")).toContain("RC5");
    expect(validation.confirmaciones.join(" ")).toContain("26.500.000");
    expect(validation.confirmaciones.join(" ")).toContain("25.000.000");
  });

  it("RC5 asks for confirmation when the quote is missing", async () => {
    const packageData = await load("sol-001");
    packageData.cotizacion = null;
    const validation = validatePackage(packageData, masters);
    expect(validation.confirmaciones.join(" ")).toContain("RC5");
  });

  it("RC6 derives the tax indicator and asks for confirmation (sol-006)", async () => {
    const validation = validatePackage(await load("sol-006"), masters);
    expect(validation.apta).toBe(true);
    expect(validation.derivados.indicador_iva).toBe("C1");
    expect(validation.confirmaciones.join(" ")).toContain("RC6");
  });

  it("RC7 derives missing payment terms without asking", async () => {
    const packageData = await load("sol-001");
    delete packageData.solicitud.condiciones_pago;
    const validation = validatePackage(packageData, masters);
    expect(validation.derivados.condiciones_pago).toBe("Z030");
    expect(validation.confirmaciones.join(" ")).not.toContain("RC7");
  });

  it("RC8 flags a retroactive PO (sol-005)", async () => {
    const validation = validatePackage(await load("sol-005"), masters);
    expect(validation.apta).toBe(true);
    expect(validation.retroactiva).toBe(true);
    expect(validation.confirmaciones.join(" ")).toContain("RC8");
  });

  it("RC9 asks for confirmation when approval predates the request", async () => {
    const packageData = await load("sol-001");
    packageData.aprobacion!.fecha = "2026-08-19T10:00:00-05:00";
    const validation = validatePackage(packageData, masters);
    expect(validation.confirmaciones.join(" ")).toContain("RC9");
  });

  it("RC10 blocks when quantity times unit price does not match", async () => {
    const packageData = await load("sol-001");
    packageData.solicitud.valor_total += 1000;
    const validation = validatePackage(packageData, masters);
    expect(validation.apta).toBe(false);
    expect(validation.bloqueos.join(" ")).toContain("RC10");
  });

  it("blocks an inactive supplier", async () => {
    const packageData = await load("sol-001");
    packageData.solicitud.proveedor_nombre = "Consultores Ágiles S.A.S.";
    packageData.solicitud.proveedor_nit = "901777888";
    const validation = validatePackage(packageData, masters);
    expect(validation.apta).toBe(false);
    expect(validation.bloqueos.join(" ")).toContain("inactivo");
  });
});
