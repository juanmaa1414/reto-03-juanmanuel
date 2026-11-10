import { defineTool, fail, ok } from "../contract.js";
import { dateOnly, findSupplier, loadMasterData, normalizeName } from "../fixtures.js";
import { validateArgs } from "../../schemas/tools.js";
import type {
  ApproverMaster,
  CostCenterMaster,
  DerivedValues,
  MasterData,
  PackageData,
  ValidationResult,
} from "../../types.js";

function findCostCenter(masters: MasterData, costCenter: string): CostCenterMaster | null {
  return masters.costCenters.find((center) => center.centro_costo === costCenter) ?? null;
}

function findApprover(
  center: CostCenterMaster | null,
  email: string | undefined,
): ApproverMaster | null {
  if (!center || !email) return null;
  const target = email.trim().toLowerCase();
  return center.aprobadores.find((approver) => approver.email.trim().toLowerCase() === target) ?? null;
}

function money(value: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(value);
}

/**
 * Apply RC1-RC10 to a normalized package. Pure with respect to the received
 * master data, reused by the tool and by oc_crear.
 */
export function validatePackage(
  packageData: PackageData,
  masters: MasterData,
): ValidationResult {
  const { solicitud, cotizacion, aprobacion, factura } = packageData;
  const bloqueos: string[] = [];
  const confirmaciones: string[] = [];
  const derivados: DerivedValues = {};
  let retroactiva = false;

  const supplier = findSupplier(
    masters,
    solicitud.proveedor_nit,
    solicitud.proveedor_nombre,
  );
  const costCenter = findCostCenter(masters, solicitud.centro_costo);
  const approver = findApprover(costCenter, aprobacion?.de);

  // RC1 - supplier exists and is active.
  if (!supplier) {
    bloqueos.push(
      `RC1: el proveedor "${solicitud.proveedor_nombre}" no existe en el maestro de proveedores.`,
    );
  } else {
    derivados.proveedor_codigo_sap = supplier.codigo_sap;
    derivados.proveedor_nit = supplier.nit;
    derivados.proveedor_nombre = supplier.nombre;
    if (!supplier.activo) {
      bloqueos.push(`RC1: el proveedor "${supplier.nombre}" está inactivo en el maestro.`);
    }
  }

  // RC2 - approval exists, contains "Aprobado" and comes from an authorized approver.
  if (!aprobacion) {
    bloqueos.push("RC2: no existe correo de aprobación para el caso.");
  } else {
    if (!aprobacion.aprobado) {
      bloqueos.push(`RC2: el correo de ${aprobacion.de} no contiene la palabra "Aprobado".`);
    }
    if (!costCenter) {
      bloqueos.push(
        `RC2: no se puede verificar al aprobador porque el centro de costo "${solicitud.centro_costo}" no existe.`,
      );
    } else if (!approver) {
      bloqueos.push(
        `RC2: ${aprobacion.de} no está listado como aprobador del centro ${solicitud.centro_costo}.`,
      );
    }
  }

  // RC3 - total amount within the approver's cap.
  if (approver && solicitud.valor_total > approver.tope) {
    bloqueos.push(
      `RC3: el valor total ${money(solicitud.valor_total)} ${solicitud.moneda} excede el tope de ${money(approver.tope)} del aprobador ${approver.email}.`,
    );
  }

  // RC4 - subarea belongs to the cost center.
  if (!costCenter) {
    bloqueos.push(`RC4: el centro de costo "${solicitud.centro_costo}" no existe en el maestro.`);
  } else if (
    !costCenter.subareas.some(
      (subarea) => normalizeName(subarea) === normalizeName(solicitud.subarea),
    )
  ) {
    bloqueos.push(
      `RC4: la subárea "${solicitud.subarea}" no pertenece al centro ${solicitud.centro_costo}.`,
    );
  }

  // RC5 - quote vs request (2% tolerance).
  if (!cotizacion) {
    confirmaciones.push(
      "RC5: no hay cotización en el paquete; se requiere confirmación para continuar.",
    );
  } else if (solicitud.valor_total > 0) {
    const difference = Math.abs(cotizacion.total - solicitud.valor_total);
    const percentage = (difference / solicitud.valor_total) * 100;
    if (percentage > 2) {
      confirmaciones.push(
        `RC5: la cotización (${money(cotizacion.total)}) difiere de la solicitud (${money(solicitud.valor_total)}) en ${percentage.toFixed(2)}%.`,
      );
    }
  }

  // RC6 - missing tax indicator: derive from supplier and confirm.
  if (!solicitud.indicador_iva) {
    const derivedTaxIndicator = supplier?.indicador_iva_default;
    if (derivedTaxIndicator) {
      derivados.indicador_iva = derivedTaxIndicator;
      confirmaciones.push(
        `RC6: el indicador de IVA no está informado; se deriva "${derivedTaxIndicator}" del proveedor y se requiere confirmación.`,
      );
    } else {
      confirmaciones.push(
        "RC6: el indicador de IVA no está informado y no se pudo derivar del proveedor; se requiere confirmación.",
      );
    }
  }

  // RC7 - missing payment terms: derive from supplier (informational only).
  if (!solicitud.condiciones_pago) {
    const derivedPaymentTerms = supplier?.condiciones_pago_default;
    if (derivedPaymentTerms) {
      derivados.condiciones_pago = derivedPaymentTerms;
    }
  } else {
    derivados.condiciones_pago = solicitud.condiciones_pago;
  }

  // RC8 - invoice dated before the request: retroactive PO.
  const requestDate = dateOnly(solicitud.fecha_solicitud);
  const invoiceDate = dateOnly(factura?.fecha);
  if (invoiceDate && requestDate && invoiceDate < requestDate) {
    retroactiva = true;
    confirmaciones.push(
      `RC8: la factura ${factura?.numero ?? ""} es del ${invoiceDate}, anterior a la solicitud (${requestDate}). Es una OC retroactiva y requiere confirmación.`,
    );
  }

  // RC9 - approval not earlier than the request.
  const approvalDate = dateOnly(aprobacion?.fecha);
  if (approvalDate && requestDate && approvalDate < requestDate) {
    confirmaciones.push(
      `RC9: la aprobación es del ${approvalDate}, anterior a la solicitud (${requestDate}); requiere confirmación.`,
    );
  }

  // RC10 - quantity * unit price = total (+/- 1).
  const calculated = solicitud.cantidad * solicitud.valor_unitario;
  if (Math.abs(calculated - solicitud.valor_total) > 1) {
    bloqueos.push(
      `RC10: cantidad × valor unitario (${money(calculated)}) no coincide con el valor total (${money(solicitud.valor_total)}).`,
    );
  }

  return {
    apta: bloqueos.length === 0,
    bloqueos,
    confirmaciones,
    derivados,
    retroactiva,
  };
}

export const validar = defineTool({
  description:
    "Valida el paquete contra los maestros y las reglas RC1-RC10, devolviendo apta, bloqueos, confirmaciones, derivados y retroactiva.",
  args: validateArgs.shape,
  async execute(args, ctx) {
    if (!args.paquete.solicitud) {
      return fail("El paquete recibido no contiene una solicitud válida.");
    }
    const masters = loadMasterData(ctx.directory);
    return ok(validatePackage(args.paquete as PackageData, masters));
  },
});
