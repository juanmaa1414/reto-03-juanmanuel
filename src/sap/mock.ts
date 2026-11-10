import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { OrdenCompra } from "../types.js";
import type { OrdenCreada, ProveedorSap, SapAdapter } from "./adapter.js";
import { loadMasterData, normalizeNit, outPath } from "../tools/fixtures.js";

const PRIMER_NUMERO_OC = 4_500_000_001;

type OrdenPersistida = {
  numero_oc: string;
  fecha: string;
  orden: OrdenCompra;
};

/**
 * Implementación local del adaptador SAP sobre archivos:
 * - números secuenciales desde 4500000001
 * - una línea JSON por orden en out/sap/ordenes.jsonl
 * - idempotencia por referencia.solicitud_id
 */
export class MockSapAdapter implements SapAdapter {
  private readonly directory: string;
  private readonly now: () => Date;

  constructor(directory: string, now: () => Date = () => new Date()) {
    this.directory = directory;
    this.now = now;
  }

  private get filePath(): string {
    return outPath(this.directory, "sap", "ordenes.jsonl");
  }

  private readOrdenes(): OrdenPersistida[] {
    if (!existsSync(this.filePath)) return [];
    return readFileSync(this.filePath, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as OrdenPersistida];
        } catch {
          return [];
        }
      });
  }

  async consultarProveedor(nit: string): Promise<ProveedorSap | null> {
    const normalized = normalizeNit(nit);
    if (!normalized) return null;
    const { suppliers } = loadMasterData(this.directory);
    const found = suppliers.find(
      (p) => normalizeNit(p.nit) === normalized || normalized.startsWith(normalizeNit(p.nit) ?? ""),
    );
    return found ? { codigo_sap: found.codigo_sap, activo: found.activo } : null;
  }

  async buscarOrdenPorReferencia(solicitud_id: string): Promise<{ numero_oc: string } | null> {
    const found = this.readOrdenes().find(
      (o) => o.orden.referencia.solicitud_id === solicitud_id,
    );
    return found ? { numero_oc: found.numero_oc } : null;
  }

  async crearOrden(orden: OrdenCompra): Promise<OrdenCreada> {
    const ordenes = this.readOrdenes();
    const existing = ordenes.find(
      (o) => o.orden.referencia.solicitud_id === orden.referencia.solicitud_id,
    );
    if (existing) {
      return { numero_oc: existing.numero_oc, fecha: existing.fecha, idempotente: true };
    }

    const maxNumero = ordenes.reduce((max, o) => {
      const parsed = Number.parseInt(o.numero_oc, 10);
      return Number.isFinite(parsed) && parsed > max ? parsed : max;
    }, PRIMER_NUMERO_OC - 1);
    const numero_oc = String(maxNumero + 1);
    const fecha = this.now().toISOString();

    const persistida: OrdenPersistida = { numero_oc, fecha, orden };
    mkdirSync(dirname(this.filePath), { recursive: true });
    appendFileSync(this.filePath, `${JSON.stringify(persistida)}\n`, "utf8");

    return { numero_oc, fecha, idempotente: false };
  }
}

export function createSapAdapter(
  directory: string,
  now: () => Date = () => new Date(),
): SapAdapter {
  return new MockSapAdapter(directory, now);
}
