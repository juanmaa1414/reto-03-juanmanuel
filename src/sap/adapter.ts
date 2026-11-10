import type { OrdenCompra } from "../types.js";

export type ProveedorSap = {
  codigo_sap: string;
  activo: boolean;
};

export type OrdenCreada = {
  numero_oc: string;
  fecha: string;
  /** true cuando la orden ya existía para la misma referencia (idempotencia). */
  idempotente?: boolean;
};

/**
 * Interfaz obligatoria del PRD 7.4. La implementación real (OData/BAPI/archivo)
 * se documenta en SOLUCION.md; la local es src/sap/mock.ts.
 */
export interface SapAdapter {
  consultarProveedor(nit: string): Promise<ProveedorSap | null>;
  crearOrden(orden: OrdenCompra): Promise<OrdenCreada>;
  buscarOrdenPorReferencia(solicitud_id: string): Promise<{ numero_oc: string } | null>;
}
