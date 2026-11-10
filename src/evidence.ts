import type { Approval } from "./types.js";
import { sha256 } from "./tools/fixtures.js";

/** Build the evidence content without the trailing hash. */
export function buildApprovalContent(approval: Approval): string {
  const lines = [
    `De: ${approval.de}`,
    `Para: ${approval.para ?? "compras@periferia-ficticia.com"}`,
    `Fecha: ${approval.fecha}`,
    `Asunto: ${approval.asunto ?? "Aprobación de orden de compra"}`,
    "",
    approval.texto.trim(),
  ];
  return lines.join("\n");
}

export function hashApproval(approval: Approval): string {
  return sha256(buildApprovalContent(approval));
}

export function buildEvidenceText(approval: Approval): { content: string; sha256: string } {
  const content = buildApprovalContent(approval);
  const hash = sha256(content);
  return {
    content: `${content}\n\nSHA-256: ${hash}\n`,
    sha256: hash,
  };
}
