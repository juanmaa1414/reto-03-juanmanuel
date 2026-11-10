import { readFileSync } from "node:fs";
import { appendFileSync, existsSync } from "node:fs";
import { escapeCsvField } from "../util.js";
import { outPath } from "../tools/fixtures.js";

export type ControlResultado = "exitoso" | "bloqueado" | "pendiente";

export type ControlRow = {
  solicitud_id: string;
  resultado: ControlResultado;
  numero_oc?: string | null;
  retroactiva: boolean;
  bloqueos: string[];
  confirmaciones: string[];
  ts?: string;
};

const HEADER = [
  "solicitud_id",
  "resultado",
  "numero_oc",
  "retroactiva",
  "bloqueos",
  "confirmaciones",
  "ts",
].join(",");

/** Agrega una fila a out/control.csv, creando el encabezado si hace falta. */
export function appendControlLog(directory: string, row: ControlRow): string {
  const filePath = outPath(directory, "control.csv");
  const exists = existsSync(filePath);
  if (!exists) {
    appendFileSync(filePath, `${HEADER}\n`, "utf8");
  } else {
    const current = readFileSync(filePath, "utf8");
    if (!current.endsWith("\n")) appendFileSync(filePath, "\n", "utf8");
  }

  const line = [
    row.solicitud_id,
    row.resultado,
    row.numero_oc ?? "",
    String(row.retroactiva),
    row.bloqueos.join(" | "),
    row.confirmaciones.join(" | "),
    row.ts ?? new Date().toISOString(),
  ]
    .map(escapeCsvField)
    .join(",");

  appendFileSync(filePath, `${line}\n`, "utf8");
  return filePath;
}
