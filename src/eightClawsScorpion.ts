export const EIGHT_CLAWS_SCORPION_ID = '14261867';
export const EIGHT_CLAWS_SCORPION_DAMAGE_CALCULATION_ATK = 2400;

export type ScorpionPhase = 'main' | 'battle' | 'end';
export type ScorpionPosition = 'atk' | 'def';
export type ScorpionDamageStep = 'declare' | 'damage' | 'calculation';

export interface EightClawsScorpionPositionState {
  readonly uid: string;
  readonly id: string;
  readonly faceUp: boolean;
  readonly position: ScorpionPosition;
  readonly changed: number;
  readonly effectUsedTurn?: number;
  readonly positionLockedThrough?: number;
}

/**
 * The ignition effect may turn a face-up Eight-Claws Scorpion face-down in
 * Defense during Main Phase. It is an effect-based position change, so normal
 * summon/attack position-change restrictions are not inferred here; the
 * engine's explicit position lock still applies.
 */
export function canEightClawsScorpionSetItself(
  source: EightClawsScorpionPositionState,
  phase: ScorpionPhase,
  turn: number,
  effectsNegated = false,
): boolean {
  if (!source || typeof source !== 'object' ||
      typeof source.uid !== 'string' || source.uid.length === 0 ||
      source.id !== EIGHT_CLAWS_SCORPION_ID ||
      typeof source.faceUp !== 'boolean' ||
      !['atk', 'def'].includes(source.position)) {
    return false;
  }
  if (!Number.isSafeInteger(turn) || turn < 1) {
    throw new RangeError('Scorpion turn must be a positive safe integer.');
  }
  if (typeof effectsNegated !== 'boolean') {
    throw new TypeError('Scorpion negation state must be boolean.');
  }
  if (source.effectUsedTurn !== undefined &&
      (!Number.isSafeInteger(source.effectUsedTurn) || source.effectUsedTurn < 0) ||
      source.positionLockedThrough !== undefined &&
      (!Number.isSafeInteger(source.positionLockedThrough) || source.positionLockedThrough < 0)) {
    throw new TypeError('Scorpion turn/position-lock metadata is invalid.');
  }
  return !effectsNegated && phase === 'main' && source.faceUp &&
    source.effectUsedTurn !== turn &&
    (source.positionLockedThrough === undefined || source.positionLockedThrough < turn);
}

/** Return a new physical monster state; the caller commits it through the resolver. */
export function setEightClawsScorpionFaceDown<T extends EightClawsScorpionPositionState>(
  source: T,
  phase: ScorpionPhase,
  turn: number,
  effectsNegated = false,
): (T & { faceUp: false; position: 'def'; changed: number; effectUsedTurn: number }) | null {
  if (!canEightClawsScorpionSetItself(source, phase, turn, effectsNegated)) return null;
  return {
    ...source,
    faceUp: false,
    position: 'def',
    changed: turn,
    effectUsedTurn: turn,
  };
}

export interface EightClawsScorpionBattleTarget {
  readonly uid: string;
  /** Current visibility at calculation may differ after a face-down target is flipped. */
  readonly faceUp: boolean;
  readonly position: ScorpionPosition;
}

/**
 * The 2400 ATK value applies only during Damage Calculation when Scorpion is
 * the attacker and the target was face-down in Defense at attack declaration.
 * targetWasFaceDownDefense is an immutable declaration snapshot: the target
 * may already have been revealed by the time Damage Calculation begins.
 * The value is a fixed ATK override, not a +2400 modifier.
 */
export function eightClawsScorpionDamageCalculationAtk(input: {
  readonly sourceCardId: string;
  readonly sourceUid: string;
  readonly attackerUid: string;
  readonly sourceFaceUp: boolean;
  readonly target: EightClawsScorpionBattleTarget;
  readonly targetWasFaceDownDefense: boolean;
  readonly step: ScorpionDamageStep;
  readonly effectsNegated?: boolean;
}): number | null {
  if (!input || typeof input !== 'object' ||
      typeof input.sourceUid !== 'string' || input.sourceUid.length === 0 ||
      typeof input.attackerUid !== 'string' || input.attackerUid.length === 0 ||
      !input.target || typeof input.target.uid !== 'string' || input.target.uid.length === 0 ||
      typeof input.sourceFaceUp !== 'boolean' ||
      typeof input.target.faceUp !== 'boolean' ||
      !['atk', 'def'].includes(input.target.position) ||
      typeof input.targetWasFaceDownDefense !== 'boolean' ||
      !['declare', 'damage', 'calculation'].includes(input.step) ||
      input.effectsNegated !== undefined && typeof input.effectsNegated !== 'boolean') {
    throw new TypeError('Scorpion Damage Calculation input is invalid.');
  }
  if (input.sourceCardId !== EIGHT_CLAWS_SCORPION_ID ||
      input.sourceUid !== input.attackerUid ||
      input.sourceUid === input.target.uid ||
      !input.sourceFaceUp ||
      input.effectsNegated === true ||
      input.step !== 'calculation' ||
      input.targetWasFaceDownDefense !== true) {
    return null;
  }
  return EIGHT_CLAWS_SCORPION_DAMAGE_CALCULATION_ATK;
}
