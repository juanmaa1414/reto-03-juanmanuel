import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generar_evidencia, leer_paquete } from "../../src/tools/oc.js";
import type { PackageData } from "../../src/types.js";
import { outputExists, readOutputText, testContext } from "../helpers.js";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

describe("oc_generar_evidencia (3.4)", () => {
  it("creates txt and pdf evidence for sol-001", async () => {
    const result = JSON.parse(
      await generar_evidencia.execute({ caso: "sol-001" }, testContext),
    ) as Result<{ ruta: string; sha256: string; ruta_pdf: string }>;

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.ruta).toBe("out/sol-001/aprobacion.txt");
    expect(result.data.ruta_pdf).toBe("out/sol-001/aprobacion.pdf");
    expect(outputExists("sol-001", "aprobacion.txt")).toBe(true);
    expect(outputExists("sol-001", "aprobacion.pdf")).toBe(true);

    const text = readOutputText("sol-001", "aprobacion.txt");
    expect(text).toContain("De: mlopez@periferia-ficticia.com");
    expect(text).toContain("Asunto:");
    expect(text).toContain("Aprobado, proceder con la orden de compra.");

    const [content, hashLine] = text.split("\n\nSHA-256: ");
    const expectedHash = createHash("sha256").update(content ?? "", "utf8").digest("hex");
    expect(hashLine?.trim()).toBe(result.data.sha256);
    expect(expectedHash).toBe(result.data.sha256);

    const pdf = readFileSync(
      `${testContext.directory}/out/sol-001/aprobacion.pdf`,
    );
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("fails when the package has no approval", async () => {
    const read = JSON.parse(
      await leer_paquete.execute({ caso: "sol-001" }, testContext),
    ) as Result<PackageData>;
    if (!read.ok) throw new Error(read.error);
    read.data.aprobacion = null;

    const result = JSON.parse(
      await generar_evidencia.execute({ caso: "sol-001", paquete: read.data }, testContext),
    ) as Result<unknown>;
    expect(result.ok).toBe(false);
  });
});
