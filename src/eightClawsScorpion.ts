export interface EightClawsFlipInput {
  sourceFaceUp: boolean;
  effectNegated: boolean;
  usedThisTurn: boolean;
  legalPositionChangeWindow: boolean;
}

/**
 * The once-per-turn self-flip is available only while the source is face-up,
 * its effect is live, the normal position-change window is open, and the
 * effect has not already been used this turn.
 */
export function canEightClawsScorpionFlipDown(input: EightClawsFlipInput): boolean {
  return input.sourceFaceUp
    && !input.effectNegated
    && !input.usedThisTurn
    && input.legalPositionChangeWindow;
}

export interface EightClawsDamageCalculationInput {
  baseAtk: number;
  isAttacking: boolean;
  targetFaceUp: boolean;
  targetPosition: "atk" | "def";
  effectNegated: boolean;
}

export interface EightClawsDamageCalculationResult {
  calculatedAtk: number;
  persistentAtk: number;
  temporary: boolean;
  clearAfterDamageCalculation: boolean;
}

/**
 * When Eight-Claws Scorpion attacks a face-down Defense Position monster,
 * its ATK is 2400 for Damage Calculation only. This helper never mutates
 * the source stats and never writes a persistent modifier.
 */
export function resolveEightClawsScorpionDamageCalculation(
  input: EightClawsDamageCalculationInput,
): EightClawsDamageCalculationResult {
  if (!Number.isSafeInteger(input.baseAtk) || input.baseAtk < 0) {
    throw new Error("baseAtk must be a non-negative safe integer.");
  }
  const temporary = input.isAttacking
    && !input.effectNegated
    && !input.targetFaceUp
    && input.targetPosition === "def";
  return {
    calculatedAtk: temporary ? 2400 : input.baseAtk,
    persistentAtk: input.baseAtk,
    temporary,
    clearAfterDamageCalculation: temporary,
  };
}
