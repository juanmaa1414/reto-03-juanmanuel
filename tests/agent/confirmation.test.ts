import { describe, expect, it } from "vitest";
import {
  detectConfirmation,
  isUserConfirmation,
} from "../../src/agent/confirmation.js";
import type { ValidationResult } from "../../src/types.js";

function validation(confirmaciones: string[]): ValidationResult {
  return {
    apta: true,
    bloqueos: [],
    confirmaciones,
    derivados: {},
    retroactiva: false,
  };
}

describe("confirmation detection (5.4)", () => {
  it("detects RC5 quote discrepancy", () => {
    const state = detectConfirmation(
      "La cotización difiere de la solicitud.",
      validation(["RC5: discrepancia"]),
    );
    expect(state.needsConfirmation).toBe(true);
    expect(state.pending).toEqual(["RC5: discrepancia"]);
  });

  it("detects RC6 missing tax indicator", () => {
    expect(
      detectConfirmation("", validation(["RC6: IVA derivado"])).needsConfirmation,
    ).toBe(true);
  });

  it("detects RC8 retroactive invoice", () => {
    expect(
      detectConfirmation("", validation(["RC8: OC retroactiva"])).needsConfirmation,
    ).toBe(true);
  });

  it("detects RC9 approval before request", () => {
    expect(
      detectConfirmation("", validation(["RC9: aprobación anterior"])).needsConfirmation,
    ).toBe(true);
  });

  it("detects an explicit question even without validation findings", () => {
    expect(
      detectConfirmation("¿Confirmás la creación de la OC?").needsConfirmation,
    ).toBe(true);
  });

  it("does not ask for confirmation on a clean success", () => {
    expect(
      detectConfirmation("La OC 4500000001 fue creada.", validation([]))
        .needsConfirmation,
    ).toBe(false);
  });

  it("recognizes explicit user confirmations", () => {
    expect(isUserConfirmation("Confirmo")).toBe(true);
    expect(isUserConfirmation("sí, adelante")).toBe(true);
    expect(isUserConfirmation("dale")).toBe(true);
    expect(isUserConfirmation("no")).toBe(false);
    expect(isUserConfirmation("mostrame la OC")).toBe(false);
  });
});
