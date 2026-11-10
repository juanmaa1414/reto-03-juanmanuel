import { writeFileSync } from "node:fs";
import { relative } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { defineTool, fail, ok } from "../contract.js";
import { buildEvidenceText } from "../../evidence.js";
import { generateEvidenceArgs } from "../../schemas/tools.js";
import { outPath } from "../fixtures.js";
import { ensureParentDirectory } from "../../util.js";
import { readPackage } from "./read-package.js";
import type { PackageData } from "../../types.js";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const FONT_SIZE = 11;
const LINE_HEIGHT = 16;

function sanitizeForPdf(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

function wrapLine(line: string, maxChars: number): string[] {
  if (line.length <= maxChars) return [line];
  const words = line.split(/\s+/);
  const result: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      result.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) result.push(current);
  return result;
}

export async function generateEvidencePdf(content: string, filePath: string): Promise<void> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const maxChars = Math.floor((PAGE_WIDTH - MARGIN * 2) / (FONT_SIZE * 0.52));

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensureSpace = (needed: number): void => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  const lines = sanitizeForPdf(content).split("\n");
  for (const rawLine of lines) {
    const isHeader = /^(De|Para|Fecha|Asunto|SHA-256):/.test(rawLine);
    const activeFont = isHeader ? boldFont : font;
    for (const piece of wrapLine(rawLine, maxChars)) {
      ensureSpace(LINE_HEIGHT);
      page.drawText(piece, {
        x: MARGIN,
        y,
        size: FONT_SIZE,
        font: activeFont,
        color: rgb(0.1, 0.1, 0.12),
      });
      y -= LINE_HEIGHT;
    }
  }

  const bytes = await pdf.save();
  ensureParentDirectory(filePath);
  writeFileSync(filePath, bytes);
}

export const generar_evidencia = defineTool({
  description:
    "Genera la evidencia de aprobación en out/<caso>/aprobacion.txt (P0) y aprobacion.pdf (P1), devolviendo rutas y hash SHA-256.",
  args: generateEvidenceArgs.shape,
  async execute(args, ctx) {
    let packageData: PackageData | undefined = args.paquete as PackageData | undefined;
    if (!packageData) {
      const loaded = await readPackage(ctx.directory, args.caso);
      if (!loaded.ok) return fail(loaded.error);
      packageData = loaded.packageData;
    }
    if (!packageData.aprobacion) {
      return fail(
        `El caso "${args.caso}" no tiene aprobación; no se puede generar la evidencia.`,
      );
    }

    const { content, sha256 } = buildEvidenceText(packageData.aprobacion);
    const textPath = outPath(ctx.directory, args.caso, "aprobacion.txt");
    const pdfPath = outPath(ctx.directory, args.caso, "aprobacion.pdf");
    ensureParentDirectory(textPath);
    writeFileSync(textPath, content, "utf8");
    await generateEvidencePdf(content, pdfPath);

    return ok({
      ruta: relative(ctx.directory, textPath),
      sha256,
      ruta_pdf: relative(ctx.directory, pdfPath),
    });
  },
});
