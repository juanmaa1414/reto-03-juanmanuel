import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  Approval,
  CostCenterMaster,
  Invoice,
  MasterData,
  PaymentTermMaster,
  Quote,
  SupplierMaster,
  TaxIndicatorMaster,
} from "../types.js";

export const FIXTURES_ROOT = "fixtures/reto-03";

export function fixturesPath(directory: string, ...parts: string[]): string {
  return resolve(directory, FIXTURES_ROOT, ...parts);
}

export function outPath(directory: string, ...parts: string[]): string {
  return resolve(directory, "out", ...parts);
}

export function readJsonIfExists<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export function readTextIfExists(path: string): string | null {
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Keep digits only: "900.555.111-2" -> "9005551112". */
export function normalizeNit(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

/**
 * Compare NITs tolerating the check digit: the request fixture uses
 * "900555111" while the quote uses "900.555.111-2".
 */
export function sameNit(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeNit(a);
  const nb = normalizeNit(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length < nb.length ? na : nb;
  const longer = na.length < nb.length ? nb : na;
  return longer.startsWith(shorter) && longer.length - shorter.length <= 1;
}

export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMoney(raw: string): number | null {
  const match = raw.replace(/\s/g, "").match(/-?\d[\d.,]*/);
  if (!match) return null;
  const digits = match[0].replace(/[.,]/g, "");
  const value = Number.parseInt(digits, 10);
  return Number.isFinite(value) ? value : null;
}

/** Extract a YYYY-MM-DD date from an ISO or local string. */
export function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

export function addDays(date: string, days: number): string | null {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  const result = new Date(parsed + days * 24 * 60 * 60 * 1000);
  return result.toISOString().slice(0, 10);
}

/**
 * Parse the plain-text quote. Returns null when the minimum structure is
 * missing.
 */
export function parseQuote(text: string): Quote | null {
  const reference =
    text.match(/COTIZACI[ÓO]N\s+([^\s]+)/i)?.[1] ??
    text.match(/No\.?\s*([A-Z0-9-]+)/i)?.[1] ??
    null;
  const date = dateOnly(text.match(/Fecha:\s*([^\n]+)/i)?.[1]);
  const supplier = text.match(/Proveedor:\s*([^\n]+)/i)?.[1]?.trim() ?? "Desconocido";
  const nitRaw = text.match(/NIT:\s*([^\n]+)/i)?.[1] ?? null;
  const nit = nitRaw ? normalizeNit(nitRaw) : null;
  const totalLine = text.match(/TOTAL[^\n]*?[:]\s*([^\n]+)/i)?.[1] ?? "";
  const total = parseMoney(totalLine);
  if (total === null) return null;
  const currency = /\bUSD\b/i.test(totalLine) ? "USD" : "COP";
  const validityMatch = text.match(/Validez[^\n]*?:\s*(\d+)\s*d[ií]as?/i);
  const validUntil =
    date && validityMatch?.[1] ? addDays(date, Number.parseInt(validityMatch[1], 10)) : null;

  return {
    proveedor: supplier,
    nit,
    total,
    moneda: currency,
    validez_hasta: validUntil,
    texto: text,
    referencia: reference,
  };
}

export function parseApproval(raw: {
  de: string;
  para?: string;
  fecha: string;
  asunto?: string;
  cuerpo: string;
}): Approval {
  return {
    de: raw.de,
    para: raw.para,
    fecha: raw.fecha,
    asunto: raw.asunto,
    aprobado: /\baprobado\b/i.test(raw.cuerpo),
    texto: raw.cuerpo,
  };
}

/** Parse the plain-text invoice of the retroactive case. */
export function parseInvoice(text: string): Invoice | null {
  const number =
    text.match(/No\.?\s*([A-Z0-9-]+)/i)?.[1] ??
    text.match(/FACTURA[^\n]*?([A-Z]{2,}-\d+)/i)?.[1] ??
    null;
  const date = dateOnly(text.match(/Fecha[^\n]*?:\s*([^\n]+)/i)?.[1]);
  const totalLine = text.match(/TOTAL[^\n]*?[:]\s*([^\n]+)/i)?.[1] ?? "";
  const total = parseMoney(totalLine);
  if (!number || !date || total === null) return null;
  return { numero: number, fecha: date, total };
}

export function loadMasterData(directory: string): MasterData {
  const suppliers =
    readJsonIfExists<SupplierMaster[]>(fixturesPath(directory, "maestros/proveedores.json")) ?? [];
  const costCenters =
    readJsonIfExists<CostCenterMaster[]>(fixturesPath(directory, "maestros/centros-costo.json")) ?? [];
  const taxIndicators =
    readJsonIfExists<TaxIndicatorMaster[]>(fixturesPath(directory, "maestros/indicadores-iva.json")) ?? [];
  const paymentTerms =
    readJsonIfExists<PaymentTermMaster[]>(fixturesPath(directory, "maestros/condiciones-pago.json")) ?? [];
  return { suppliers, costCenters, taxIndicators, paymentTerms };
}

export function findSupplier(
  masters: MasterData,
  nit: string | null | undefined,
  name: string,
): SupplierMaster | null {
  if (nit) {
    const byNit = masters.suppliers.find((supplier) => sameNit(supplier.nit, nit));
    if (byNit) return byNit;
  }
  const normalized = normalizeName(name);
  return masters.suppliers.find((supplier) => normalizeName(supplier.nombre) === normalized) ?? null;
}
