import { z } from "zod";

export const referenceSchema = z.object({
  solicitud_id: z.string().min(1),
  correo_id: z.string().min(1),
  cotizacion_ref: z.string().nullable(),
});

export const supplierSchema = z.object({
  codigo_sap: z.string().min(1),
  nit: z.string().min(1),
  nombre: z.string().min(1),
});

export const approverSchema = z.object({
  email: z.string().email(),
  fecha_aprobacion: z.string().min(1),
  evidencia_sha256: z.string().min(1),
});

export const lineItemSchema = z.object({
  numero: z.number().int().positive(),
  descripcion: z.string().min(1).max(40),
  cantidad: z.number().nonnegative(),
  unidad: z.enum(["UN", "H", "MES"]),
  precio_unitario: z.number().nonnegative(),
  centro_costo: z.string().min(1),
  subarea: z.string().min(1),
  indicador_iva: z.string().min(1),
});

export const exceptionSchema = z.object({
  codigo: z.string().min(1),
  detalle: z.string().min(1),
  confirmado_por: z.string().nullable(),
});

export const purchaseOrderSchema = z.object({
  referencia: referenceSchema,
  sociedad: z.literal("1000"),
  organizacion_compras: z.literal("1000"),
  proveedor: supplierSchema,
  moneda: z.enum(["COP", "USD"]),
  condiciones_pago: z.string().min(1),
  aprobador: approverSchema,
  posiciones: z.array(lineItemSchema).min(1),
  excepciones: z.array(exceptionSchema),
});

export type ValidatedPurchaseOrder = z.infer<typeof purchaseOrderSchema>;

// Alias kept for compatibility with the OpenSpec artifact names.
export const ordenCompraSchema = purchaseOrderSchema;
