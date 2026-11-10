import { defineTool, fail, ok } from "../contract.js";
import { createOrderArgs } from "../../schemas/tools.js";
import { appendControlLog } from "../../sap/control.js";
import { createSapAdapter } from "../../sap/mock.js";
import { loadMasterData } from "../fixtures.js";
import { readPackage } from "./read-package.js";
import { validatePackage } from "./validate.js";
import type { PackageData, PurchaseOrder } from "../../types.js";

export const crear = defineTool({
  description:
    "Crea la orden de compra en el SAP simulado solo si el caso es apto y no tiene confirmaciones pendientes (o confirmado=true). Registra el intento en out/control.csv.",
  args: createOrderArgs.shape,
  async execute(args, ctx) {
    const loaded = await readPackage(ctx.directory, args.caso);
    if (!loaded.ok) return fail(loaded.error);
    const packageData: PackageData = loaded.packageData;
    const requestId = packageData.solicitud.solicitud_id;
    const masters = loadMasterData(ctx.directory);
    const validation = validatePackage(packageData, masters);
    const payload = args.payload as PurchaseOrder;

    if (payload.referencia.solicitud_id !== requestId) {
      return fail(
        `El payload pertenece a ${payload.referencia.solicitud_id}, no al caso ${args.caso} (${requestId}).`,
      );
    }

    if (!validation.apta) {
      appendControlLog(ctx.directory, {
        solicitud_id: requestId,
        resultado: "bloqueado",
        retroactiva: validation.retroactiva,
        bloqueos: validation.bloqueos,
        confirmaciones: validation.confirmaciones,
      });
      return fail(
        `No se creó la OC: el caso tiene bloqueos. ${validation.bloqueos.join(" ")}`,
      );
    }

    if (validation.confirmaciones.length > 0 && args.confirmado !== true) {
      appendControlLog(ctx.directory, {
        solicitud_id: requestId,
        resultado: "pendiente",
        retroactiva: validation.retroactiva,
        bloqueos: validation.bloqueos,
        confirmaciones: validation.confirmaciones,
      });
      return fail(
        `No se creó la OC: hay confirmaciones pendientes y no se recibió confirmación explícita. ${validation.confirmaciones.join(" ")}`,
      );
    }

    const exceptions = payload.excepciones.map((exception) => ({
      ...exception,
      confirmado_por: exception.confirmado_por ?? (args.confirmado ? "usuario" : null),
    }));

    const adapter = createSapAdapter(ctx.directory);
    const created = await adapter.crearOrden({ ...payload, excepciones: exceptions });

    appendControlLog(ctx.directory, {
      solicitud_id: requestId,
      resultado: "exitoso",
      numero_oc: created.numero_oc,
      retroactiva: validation.retroactiva,
      bloqueos: validation.bloqueos,
      confirmaciones: validation.confirmaciones,
    });

    return ok({
      numero_oc: created.numero_oc,
      fecha: created.fecha,
      idempotente: created.idempotente ?? false,
      retroactiva: validation.retroactiva,
    });
  },
});
