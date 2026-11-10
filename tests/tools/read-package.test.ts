import { describe, expect, it } from "vitest";
import { readPackage } from "../../src/tools/oc/read-package.js";
import { repoRoot, testContext } from "../helpers.js";

describe("oc_leer_paquete (3.1)", () => {
  it("returns the full normalized package for sol-001", async () => {
    const result = await readPackage(repoRoot, "sol-001");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const packageData = result.packageData;
    expect(packageData.correo.id).toBe("sol-001-correo");
    expect(packageData.solicitud.solicitud_id).toBe("SOL-2026-001");
    expect(packageData.cotizacion?.total).toBe(11_400_000);
    expect(packageData.cotizacion?.referencia).toBe("COT-TS-2026-0451");
    expect(packageData.aprobacion?.aprobado).toBe(true);
    expect(packageData.factura).toBeNull();
  });

  it("returns factura null when the attachment is missing", async () => {
    const result = await readPackage(repoRoot, "sol-001");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.packageData.factura).toBeNull();
  });

  it("parses the retroactive invoice for sol-005", async () => {
    const result = await readPackage(repoRoot, "sol-005");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.packageData.factura).toEqual({
      numero: "FC-88231",
      fecha: "2026-08-10",
      total: 3_200_000,
    });
  });

  it("returns a readable error for an unknown case", async () => {
    const result = await readPackage(repoRoot, "sol-999");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("no existe");
  });
});
