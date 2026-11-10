import type { ValidationResult } from "../types.js";

export type ConfirmationState = {
  needsConfirmation: boolean;
  message: string;
  pending: string[];
};

const AFFIRMATIVE_PATTERN =
  /^\s*(s[ií]|confirmo|confirmado|confirmar|adelante|procede|proceda|de acuerdo|ok|dale|autorizo|aprobado)(?=\s|$|[,.;!?])/i;

const CONFIRMATION_QUESTION_PATTERN = /\b(confirm\w*|autoriz\w*)\b/i;

/** True when the last user message is an explicit affirmative confirmation. */
export function isUserConfirmation(text: string | undefined): boolean {
  if (!text) return false;
  return AFFIRMATIVE_PATTERN.test(text);
}

/**
 * Detect whether the agent must pause and wait for a human confirmation.
 * Combines validation findings (RC5, RC6, RC8, RC9) with the model wording.
 */
export function detectConfirmation(
  text: string,
  validation?: ValidationResult | null,
): ConfirmationState {
  const pending = validation?.confirmaciones ?? [];
  const asksWithQuestion =
    CONFIRMATION_QUESTION_PATTERN.test(text) && /[?¿]/.test(text);
  const needsConfirmation = pending.length > 0 || asksWithQuestion;

  return {
    needsConfirmation,
    message: pending.length > 0 ? pending.join(" ") : text.trim(),
    pending,
  };
}

/** Patterns used by the UI and tests to recognize a confirmation turn. */
export const confirmationPatterns = {
  affirmative: AFFIRMATIVE_PATTERN,
  question: CONFIRMATION_QUESTION_PATTERN,
};
