import { describe, expect, it } from "vitest";
import {
  construir_payload,
  leer_paquete,
  validar,
} from "../../src/tools/oc.js";
import type { PackageData, PurchaseOrder, ValidationResult } from "../../src/types.js";
import { outputExists, readOutputJson, testContext } from "../helpers.js";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function payloadFor(caso: string): Promise<{
  payload: PurchaseOrder;
  traceabilityPath: string;
  packageData: PackageData;
}> {
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
      {
        caso,
        paquete: read.data,
        derivados: validation.data.derivados,
      },
      testContext,
    ),
  ) as Result<{ payload: PurchaseOrder; trazabilidad_path: string }>;
  if (!built.ok) throw new Error(built.error);

  return {
    payload: built.data.payload,
    traceabilityPath: built.data.trazabilidad_path,
    packageData: read.data,
  };
}

describe("oc_construir_payload (3.3)", () => {
  it("builds a valid payload for sol-001", async () => {
    const { payload } = await payloadFor("sol-001");
    expect(payload.sociedad).toBe("1000");
    expect(payload.organizacion_compras).toBe("1000");
    expect(payload.proveedor.codigo_sap).toBe("100234");
    expect(payload.posiciones[0]?.numero).toBe(10);
    expect(payload.posiciones[0]?.centro_costo).toBe("CC-1010");
    expect(payload.posiciones[0]?.unidad).toBe("UN");
  });

  it("creates the traceability file mapping every field to a source", async () => {
    const { traceabilityPath } = await payloadFor("sol-001");
    expect(traceabilityPath).toBe("out/sol-001/trazabilidad.json");
    expect(outputExists("sol-001", "trazabilidad.json")).toBe(true);

    const traceability = readOutputJson<Record<string, { value: unknown; source: string }>>(
      "sol-001",
      "trazabilidad.json",
    );
    expect(traceability["proveedor.codigo_sap"]?.source).toBe("maestro.proveedores");
    expect(traceability["posiciones[0].descripcion"]?.source).toBe("solicitud.truncada");
    expect(traceability["aprobador.email"]?.source).toBe("aprobacion");
  });

  it("truncates the SAP short text to 40 characters", async () => {
    const { payload, packageData } = await payloadFor("sol-001");
    const description = payload.posiciones[0]!.descripcion;
    expect(description).toHaveLength(40);
    expect(description).toBe(packageData.solicitud.descripcion.slice(0, 40));
  });

  it("fails without an approval email", async () => {
    const read = JSON.parse(
      await leer_paquete.execute({ caso: "sol-001" }, testContext),
    ) as Result<PackageData>;
    const packageData = read.ok ? read.data : null;
    if (!packageData) throw new Error("fixture missing");
    packageData.aprobacion = null;
    const result = JSON.parse(
      await construir_payload.execute({ caso: "sol-001", paquete: packageData }, testContext),
    ) as Result<unknown>;
    expect(result.ok).toBe(false);
  });
});
