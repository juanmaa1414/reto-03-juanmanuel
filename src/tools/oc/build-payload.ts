import { writeFileSync } from "node:fs";
import { relative } from "node:path";
import { defineTool, fail, ok } from "../contract.js";
import { hashApproval } from "../../evidence.js";
import { buildPayloadArgs } from "../../schemas/tools.js";
import { purchaseOrderSchema } from "../../schemas/purchase-order.js";
import { findSupplier, loadMasterData, outPath } from "../fixtures.js";
import { ensureParentDirectory, truncate } from "../../util.js";
import type {
  DerivedValues,
  ExceptionItem,
  PackageData,
  PurchaseOrder,
  Quote,
  PurchaseRequest,
} from "../../types.js";

const MAX_DESCRIPTION_LENGTH = 40;

type TraceEntry = { value: string | number | boolean | null; source: string };

function unitFromDescription(description: string): "UN" | "H" | "MES" {
  const lower = description.toLowerCase();
  if (/\bhoras?\b/.test(lower)) return "H";
  if (/\bmes\b|\bmensual\b/.test(lower)) return "MES";
  return "UN";
}

function exceedsTolerance(quote: Quote, request: PurchaseRequest): boolean {
  if (request.valor_total <= 0) return false;
  return Math.abs(quote.total - request.valor_total) / request.valor_total > 0.02;
}

function buildExceptions(packageData: PackageData): ExceptionItem[] {
  const { solicitud, cotizacion, factura } = packageData;
  const exceptions: ExceptionItem[] = [];
  if (!cotizacion) {
    exceptions.push({
      codigo: "RC5",
      detalle: "No hay cotización en el paquete; excepción confirmada por el usuario.",
      confirmado_por: null,
    });
  } else if (exceedsTolerance(cotizacion, solicitud)) {
    exceptions.push({
      codigo: "RC5",
      detalle: `Cotización ${cotizacion.total} difiere de solicitud ${solicitud.valor_total}.`,
      confirmado_por: null,
    });
  }
  if (!solicitud.indicador_iva) {
    exceptions.push({
      codigo: "RC6",
      detalle: "Indicador de IVA derivado del proveedor.",
      confirmado_por: null,
    });
  }
  if (factura && factura.fecha.slice(0, 10) < solicitud.fecha_solicitud.slice(0, 10)) {
    exceptions.push({
      codigo: "RC8",
      detalle: `OC retroactiva: factura ${factura.numero} del ${factura.fecha}.`,
      confirmado_por: null,
    });
  }
  return exceptions;
}

export const construir_payload = defineTool({
  description:
    "Construye y valida el payload OrdenCompra a partir del paquete y los derivados, y guarda su trazabilidad en out/<caso>/trazabilidad.json.",
  args: buildPayloadArgs.shape,
  async execute(args, ctx) {
    const packageData = args.paquete as PackageData;
    const derived = (args.derivados ?? {}) as DerivedValues;
    const { solicitud, correo, cotizacion, aprobacion } = packageData;

    if (!aprobacion) {
      return fail("No se puede construir el payload sin correo de aprobación.");
    }

    const masters = loadMasterData(ctx.directory);
    const supplier = findSupplier(masters, solicitud.proveedor_nit, solicitud.proveedor_nombre);
    const sapCode = derived.proveedor_codigo_sap ?? supplier?.codigo_sap;
    const supplierNit = solicitud.proveedor_nit ?? derived.proveedor_nit ?? supplier?.nit;

    if (!sapCode) {
      return fail(
        `No se pudo resolver el código SAP del proveedor "${solicitud.proveedor_nombre}". Ejecuta oc_validar primero.`,
      );
    }
    if (!supplierNit) {
      return fail(`No se pudo resolver el NIT del proveedor "${solicitud.proveedor_nombre}".`);
    }

    const currency =
      solicitud.moneda === "USD" ? "USD" : solicitud.moneda === "COP" ? "COP" : null;
    if (!currency) {
      return fail(`Moneda no soportada: "${solicitud.moneda}". Se espera COP o USD.`);
    }

    const paymentTerms =
      solicitud.condiciones_pago ??
      derived.condiciones_pago ??
      supplier?.condiciones_pago_default;
    if (!paymentTerms) {
      return fail("No se pudo determinar la condición de pago de la orden.");
    }

    const taxIndicator =
      solicitud.indicador_iva ?? derived.indicador_iva ?? supplier?.indicador_iva_default;
    if (!taxIndicator) {
      return fail("No se pudo determinar el indicador de IVA de la posición.");
    }

    const originalDescription = solicitud.descripcion;
    const description = truncate(originalDescription, MAX_DESCRIPTION_LENGTH);
    const evidenceHash = args.evidencia_sha256 ?? hashApproval(aprobacion);
    const unit = unitFromDescription(originalDescription);

    const payload: PurchaseOrder = {
      referencia: {
        solicitud_id: solicitud.solicitud_id,
        correo_id: correo.id,
        cotizacion_ref: cotizacion?.referencia ?? null,
      },
      sociedad: "1000",
      organizacion_compras: "1000",
      proveedor: {
        codigo_sap: sapCode,
        nit: supplierNit,
        nombre: solicitud.proveedor_nombre,
      },
      moneda: currency,
      condiciones_pago: paymentTerms,
      aprobador: {
        email: aprobacion.de,
        fecha_aprobacion: aprobacion.fecha,
        evidencia_sha256: evidenceHash,
      },
      posiciones: [
        {
          numero: 10,
          descripcion: description,
          cantidad: solicitud.cantidad,
          unidad: unit,
          precio_unitario: solicitud.valor_unitario,
          centro_costo: solicitud.centro_costo,
          subarea: solicitud.subarea,
          indicador_iva: taxIndicator,
        },
      ],
      excepciones: buildExceptions(packageData),
    };

    const parsed = purchaseOrderSchema.safeParse(payload);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      return fail(`El payload generado no cumple el esquema OrdenCompra: ${detail}`);
    }

    const traceability: Record<string, TraceEntry> = {
      "referencia.solicitud_id": { value: solicitud.solicitud_id, source: "solicitud" },
      "referencia.correo_id": { value: correo.id, source: "correo" },
      "referencia.cotizacion_ref": {
        value: cotizacion?.referencia ?? null,
        source: "cotizacion",
      },
      sociedad: { value: "1000", source: "constante" },
      organizacion_compras: { value: "1000", source: "constante" },
      "proveedor.codigo_sap": { value: sapCode, source: "maestro.proveedores" },
      "proveedor.nit": { value: supplierNit, source: "solicitud" },
      "proveedor.nombre": { value: solicitud.proveedor_nombre, source: "solicitud" },
      moneda: { value: currency, source: "solicitud" },
      condiciones_pago: {
        value: paymentTerms,
        source: solicitud.condiciones_pago
          ? "solicitud"
          : derived.condiciones_pago
            ? "derivado"
            : "maestro.proveedores",
      },
      "aprobador.email": { value: aprobacion.de, source: "aprobacion" },
      "aprobador.fecha_aprobacion": { value: aprobacion.fecha, source: "aprobacion" },
      "aprobador.evidencia_sha256": {
        value: evidenceHash,
        source: args.evidencia_sha256 ? "evidencia" : "derivado",
      },
      "posiciones[0].numero": { value: 10, source: "constante" },
      "posiciones[0].descripcion": {
        value: description,
        source: originalDescription === description ? "solicitud" : "solicitud.truncada",
      },
      "posiciones[0].cantidad": { value: solicitud.cantidad, source: "solicitud" },
      "posiciones[0].unidad": { value: unit, source: "derivado" },
      "posiciones[0].precio_unitario": {
        value: solicitud.valor_unitario,
        source: "solicitud",
      },
      "posiciones[0].centro_costo": { value: solicitud.centro_costo, source: "solicitud" },
      "posiciones[0].subarea": { value: solicitud.subarea, source: "solicitud" },
      "posiciones[0].indicador_iva": {
        value: taxIndicator,
        source: solicitud.indicador_iva
          ? "solicitud"
          : derived.indicador_iva
            ? "derivado"
            : "maestro.proveedores",
      },
      excepciones: {
        value: payload.excepciones.map((exception) => exception.codigo).join(",") || "ninguna",
        source: "validacion",
      },
      "descripcion.truncada": {
        value: originalDescription !== description,
        source: "derivado",
      },
      "descripcion.original": { value: originalDescription, source: "solicitud" },
    };

    const traceabilityPath = outPath(ctx.directory, args.caso, "trazabilidad.json");
    ensureParentDirectory(traceabilityPath);
    writeFileSync(
      traceabilityPath,
      `${JSON.stringify(traceability, null, 2)}\n`,
      "utf8",
    );

    return ok({
      payload: parsed.data,
      trazabilidad_path: relative(ctx.directory, traceabilityPath),
    });
  },
});
