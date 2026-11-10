import { existsSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { generar_evidencia, leer_paquete, construir_payload, validar, crear } from "./src/tools/oc.js";
import { outPath } from "./src/tools/fixtures.js";
import type { PackageData, ValidationResult } from "./src/types.js";

const directory = process.cwd();
const context = { directory, sessionId: "demo" };

type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function parse<T>(raw: string): ToolResult<T> {
  return JSON.parse(raw) as ToolResult<T>;
}

function resetOutput(): void {
  const out = outPath(directory);
  if (!existsSync(out)) return;
  for (const entry of readdirSync(out)) {
    if (entry === "sessions") continue;
    rmSync(resolve(out, entry), { recursive: true, force: true });
  }
}

function printValidation(validation: ValidationResult): void {
  console.log(`apta: ${validation.apta}`);
  console.log(
    `bloqueos: ${validation.bloqueos.length > 0 ? "" : "ninguno"}`,
  );
  for (const block of validation.bloqueos) console.log(`  - ${block}`);
  console.log(
    `confirmaciones: ${validation.confirmaciones.length > 0 ? "" : "ninguna"}`,
  );
  for (const confirmation of validation.confirmaciones) console.log(`  - ${confirmation}`);
  console.log(`retroactiva: ${validation.retroactiva}`);
  console.log(
    `derivados: ${Object.keys(validation.derivados).length > 0 ? JSON.stringify(validation.derivados) : "ninguno"}`,
  );
}

async function processCase(caso: string, label = caso, forceConfirmation = false): Promise<void> {
  console.log(`\n=== ${label} ===`);

  const read = parse<PackageData>(await leer_paquete.execute({ caso }, context));
  if (!read.ok) {
    console.log(`ERROR: ${read.error}`);
    return;
  }

  const validationResult = parse<ValidationResult>(
    await validar.execute({ caso, paquete: read.data }, context),
  );
  if (!validationResult.ok) {
    console.log(`ERROR de validación: ${validationResult.error}`);
    return;
  }
  const validation = validationResult.data;
  printValidation(validation);

  if (!validation.apta) {
    console.log("Resultado: no se creó la OC por bloqueos.");
    return;
  }

  let evidenceHash: string | undefined;
  const evidence = parse<{ ruta: string; sha256: string; ruta_pdf: string }>(
    await generar_evidencia.execute({ caso, paquete: read.data }, context),
  );
  if (evidence.ok) {
    evidenceHash = evidence.data.sha256;
    console.log(`evidencia: ${evidence.data.ruta} + ${evidence.data.ruta_pdf}`);
    console.log(`sha256: ${evidence.data.sha256}`);
  } else {
    console.log(`evidencia: no generada (${evidence.error})`);
  }

  const payloadResult = parse<{ payload: unknown; trazabilidad_path: string }>(
    await construir_payload.execute(
      {
        caso,
        paquete: read.data,
        derivados: validation.derivados,
        ...(evidenceHash ? { evidencia_sha256: evidenceHash } : {}),
      },
      context,
    ),
  );
  if (!payloadResult.ok) {
    console.log(`ERROR construyendo payload: ${payloadResult.error}`);
    return;
  }
  console.log(`payload: ${payloadResult.data.trazabilidad_path}`);

  let confirmed = false;
  if (validation.confirmaciones.length > 0) {
    console.log("Usuario (simulado): confirmo las excepciones y autorizo la creación.");
    confirmed = true;
  }
  if (forceConfirmation) confirmed = true;

  const created = parse<{
    numero_oc: string;
    fecha: string;
    idempotente: boolean;
    retroactiva: boolean;
  }>(
    await crear.execute(
      {
        caso,
        payload: payloadResult.data.payload as never,
        confirmado: confirmed,
      },
      context,
    ),
  );

  if (!created.ok) {
    console.log(`Resultado: no se creó la OC. ${created.error}`);
    return;
  }
  console.log(
    `OC: ${created.data.numero_oc} · fecha ${created.data.fecha} · idempotente: ${created.data.idempotente} · retroactiva: ${created.data.retroactiva}`,
  );
}

async function main(): Promise<void> {
  console.log("Demo sin modelo · Agente de órdenes de compra SAP");
  console.log(`Directorio: ${directory}`);
  resetOutput();

  const cases = ["sol-001", "sol-002", "sol-003", "sol-004", "sol-005", "sol-006"];
  for (const caso of cases) {
    await processCase(caso);
  }

  await processCase("sol-001", "sol-001 (segunda ejecución: idempotencia)");
  console.log("\nDemo completado. Revisá out/control.csv y out/sap/ordenes.jsonl.");
}

void main().catch((error) => {
  console.error("Demo falló:", error);
  process.exitCode = 1;
});
