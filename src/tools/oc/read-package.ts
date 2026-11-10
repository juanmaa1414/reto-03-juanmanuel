import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineTool, fail, ok } from "../contract.js";
import {
  fixturesPath,
  parseApproval,
  parseInvoice,
  parseQuote,
  readJsonIfExists,
  readTextIfExists,
} from "../fixtures.js";
import { readPackageArgs } from "../../schemas/tools.js";
import type { Email, PackageData, PurchaseRequest } from "../../types.js";

type RawApproval = {
  de: string;
  para?: string;
  fecha: string;
  asunto?: string;
  cuerpo: string;
};

export async function readPackage(
  directory: string,
  caso: string,
): Promise<{ ok: true; packageData: PackageData } | { ok: false; error: string }> {
  const caseDir = fixturesPath(directory, "solicitudes", caso);
  if (!existsSync(caseDir)) {
    return {
      ok: false,
      error: `El caso "${caso}" no existe en fixtures/reto-03/solicitudes/. Verifica el nombre de la carpeta.`,
    };
  }

  const email = readJsonIfExists<Email>(resolve(caseDir, "correo.json"));
  const request = readJsonIfExists<PurchaseRequest>(resolve(caseDir, "solicitud.json"));
  if (!email) {
    return { ok: false, error: `El caso "${caso}" no tiene correo.json legible.` };
  }
  if (!request) {
    return { ok: false, error: `El caso "${caso}" no tiene solicitud.json legible.` };
  }

  const quoteText = readTextIfExists(resolve(caseDir, "cotizacion.txt"));
  const rawApproval = readJsonIfExists<RawApproval>(resolve(caseDir, "aprobacion.json"));
  const invoiceText = readTextIfExists(resolve(caseDir, "factura.txt"));

  const packageData: PackageData = {
    correo: email,
    solicitud: request,
    cotizacion: quoteText ? parseQuote(quoteText) : null,
    aprobacion: rawApproval ? parseApproval(rawApproval) : null,
    factura: invoiceText ? parseInvoice(invoiceText) : null,
  };

  return { ok: true, packageData };
}

export const leer_paquete = defineTool({
  description:
    "Lee y normaliza el paquete de un caso: correo, solicitud, cotización, aprobación y factura opcional.",
  args: readPackageArgs.shape,
  async execute(args, ctx) {
    const result = await readPackage(ctx.directory, args.caso);
    if (!result.ok) return fail(result.error);
    return ok(result.packageData);
  },
});
