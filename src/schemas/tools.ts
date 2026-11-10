import { z } from "zod";
import { purchaseOrderSchema } from "./purchase-order.js";

/** Uniform result returned by every tool. */
export type ToolResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const emailSchema = z
  .object({
    id: z.string(),
    de: z.string(),
    para: z.string().optional(),
    asunto: z.string(),
    fecha: z.string(),
    cuerpo: z.string().optional(),
    adjuntos: z.array(z.string()).optional(),
  })
  .passthrough();

const purchaseRequestSchema = z
  .object({
    solicitud_id: z.string(),
    solicitante: z.string(),
    proveedor_nombre: z.string(),
    proveedor_nit: z.string().optional(),
    descripcion: z.string(),
    centro_costo: z.string(),
    subarea: z.string(),
    cantidad: z.number(),
    valor_unitario: z.number(),
    valor_total: z.number(),
    moneda: z.string(),
    indicador_iva: z.string().optional(),
    condiciones_pago: z.string().optional(),
    fecha_solicitud: z.string(),
  })
  .passthrough();

const quoteSchema = z
  .object({
    proveedor: z.string(),
    nit: z.string().nullable(),
    total: z.number(),
    moneda: z.string(),
    validez_hasta: z.string().nullable(),
    texto: z.string(),
    referencia: z.string().nullable().optional(),
  })
  .passthrough();

const approvalSchema = z
  .object({
    de: z.string(),
    para: z.string().optional(),
    fecha: z.string(),
    asunto: z.string().optional(),
    aprobado: z.boolean(),
    texto: z.string(),
  })
  .passthrough();

const invoiceSchema = z
  .object({
    numero: z.string(),
    fecha: z.string(),
    total: z.number(),
  })
  .passthrough();

export const packageSchema = z
  .object({
    correo: emailSchema,
    solicitud: purchaseRequestSchema,
    cotizacion: quoteSchema.nullable(),
    aprobacion: approvalSchema.nullable(),
    factura: invoiceSchema.nullable(),
  })
  .passthrough();

export const readPackageArgs = z.object({
  caso: z
    .string()
    .min(1)
    .describe("Case folder name under fixtures/reto-03/solicitudes/ (e.g. sol-001)"),
});

export const validateArgs = z.object({
  caso: z.string().min(1).describe("Case folder name (e.g. sol-001)"),
  paquete: packageSchema.describe("Normalized package returned by oc_leer_paquete"),
});

export const buildPayloadArgs = z.object({
  caso: z.string().min(1).describe("Case folder name (e.g. sol-001)"),
  paquete: packageSchema.describe("Normalized package returned by oc_leer_paquete"),
  derivados: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional()
    .describe("Derived values returned by oc_validar"),
  evidencia_sha256: z
    .string()
    .optional()
    .describe("SHA-256 hash of the approval evidence, when already generated"),
});

export const generateEvidenceArgs = z.object({
  caso: z.string().min(1).describe("Case folder name (e.g. sol-001)"),
  paquete: packageSchema
    .optional()
    .describe("Normalized package; if omitted it is read from fixtures"),
});

export const createOrderArgs = z.object({
  caso: z.string().min(1).describe("Case folder name (e.g. sol-001)"),
  payload: purchaseOrderSchema.describe("Validated purchase order payload"),
  confirmado: z
    .boolean()
    .optional()
    .describe("true when the user explicitly confirmed pending exceptions"),
  sessionId: z.string().optional().describe("Session id used for evidence references"),
});

export const validationResultSchema = z.object({
  apta: z.boolean(),
  bloqueos: z.array(z.string()),
  confirmaciones: z.array(z.string()),
  derivados: z.record(z.string(), z.unknown()),
  retroactiva: z.boolean(),
});

export type ReadPackageArgs = z.infer<typeof readPackageArgs>;
export type ValidateArgs = z.infer<typeof validateArgs>;
export type BuildPayloadArgs = z.infer<typeof buildPayloadArgs>;
export type GenerateEvidenceArgs = z.infer<typeof generateEvidenceArgs>;
export type CreateOrderArgs = z.infer<typeof createOrderArgs>;

// Aliases kept for compatibility with the OpenSpec artifact names.
export const leer_paquete_args = readPackageArgs;
export const validar_args = validateArgs;
export const construir_payload_args = buildPayloadArgs;
export const generar_evidencia_args = generateEvidenceArgs;
export const crear_args = createOrderArgs;
export const paqueteSchema = packageSchema;
export const resultadoValidacionSchema = validationResultSchema;
