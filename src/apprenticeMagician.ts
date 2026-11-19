export const APPRENTICE_MAGICIAN_ID = '09156135' as const;

export type ApprenticeSeat = 0 | 1 | 2 | 3;
export type SpellCounterZone = 'monster' | 'spell-trap' | 'field' | 'grave' | 'deck';

export type SpellCounterTarget = Readonly<{
  uid: string;
  controller: ApprenticeSeat;
  zone: SpellCounterZone;
  faceUp: boolean;
  canReceiveSpellCounter: boolean;
  spellCounters: number;
}>;

export type ApprenticeRecruitCandidate = Readonly<{
  uid: string;
  cardId: string;
  ownerSeat: ApprenticeSeat;
  zone: 'deck' | 'extra';
  level: number;
  race: string;
  isToken: boolean;
  isExtraDeck: boolean;
  canSpecialSummon: boolean;
}>;

export type ApprenticeRecruitContext = Readonly<{
  sourceCardId: string;
  destroyedByBattle: boolean;
  effectNegated: boolean;
  teamMonsterZonesUsed: number;
  sourceDeckOwnerSeat: ApprenticeSeat;
  sourceDeck: readonly ApprenticeRecruitCandidate[];
}>;

export type ApprenticeRecruitResult =
  | Readonly<{
      ok: true;
      uid: string;
      cardId: string;
      ownerSeat: ApprenticeSeat;
      destination: 'monster-zone';
      position: 'def';
      faceUp: false;
    }>
  | Readonly<{ ok: false; reason: 'wrong-source' | 'trigger-not-met' | 'negated' | 'no-zone' | 'target-not-eligible' }>;

function validSeat(value: unknown): value is ApprenticeSeat {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
}

function validCounterTarget(target: SpellCounterTarget): boolean {
  return typeof target.uid === 'string' &&
    target.uid.length > 0 &&
    validSeat(target.controller) &&
    (target.zone === 'monster' || target.zone === 'spell-trap' || target.zone === 'field') &&
    target.faceUp === true &&
    target.canReceiveSpellCounter === true &&
    Number.isSafeInteger(target.spellCounters) &&
    target.spellCounters >= 0 &&
    target.spellCounters < Number.MAX_SAFE_INTEGER;
}

/**
 * Enumerate face-up field cards that can receive a Spell Counter.
 * The target may belong to either team; hidden cards and non-field zones
 * are never exposed as selectable targets.
 */
export function eligibleApprenticeSpellCounterTargets(
  sourceCardId: string,
  targets: readonly SpellCounterTarget[]
): string[] {
  if (sourceCardId !== APPRENTICE_MAGICIAN_ID || !Array.isArray(targets)) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const target of targets) {
    if (!target || !validCounterTarget(target) || seen.has(target.uid)) continue;
    seen.add(target.uid);
    result.push(target.uid);
  }

  return result;
}

/** Return an immutable one-counter update for a still-eligible target. */
export function placeApprenticeSpellCounter(
  sourceCardId: string,
  targetUid: string,
  targets: readonly SpellCounterTarget[]
): Readonly<{ ok: true; target: SpellCounterTarget }> |
   Readonly<{ ok: false; reason: 'wrong-source' | 'target-not-eligible' }> {
  if (sourceCardId !== APPRENTICE_MAGICIAN_ID) return { ok: false, reason: 'wrong-source' };
  if (typeof targetUid !== 'string' ||
      !eligibleApprenticeSpellCounterTargets(sourceCardId, targets).includes(targetUid)) {
    return { ok: false, reason: 'target-not-eligible' };
  }

  const target = targets.find(item => item.uid === targetUid && validCounterTarget(item));
  if (!target) return { ok: false, reason: 'target-not-eligible' };

  return {
    ok: true,
    target: Object.freeze({ ...target, spellCounters: target.spellCounters + 1 })
  };
}

function validRecruitContext(context: ApprenticeRecruitContext): boolean {
  return context.sourceCardId === APPRENTICE_MAGICIAN_ID &&
    typeof context.destroyedByBattle === 'boolean' &&
    typeof context.effectNegated === 'boolean' &&
    Number.isInteger(context.teamMonsterZonesUsed) &&
    context.teamMonsterZonesUsed >= 0 &&
    context.teamMonsterZonesUsed <= 3 &&
    validSeat(context.sourceDeckOwnerSeat) &&
    Array.isArray(context.sourceDeck);
}

function validRecruitCandidate(candidate: ApprenticeRecruitCandidate, sourceDeckOwnerSeat: ApprenticeSeat): boolean {
  return typeof candidate.uid === 'string' &&
    candidate.uid.length > 0 &&
    typeof candidate.cardId === 'string' &&
    candidate.cardId.length > 0 &&
    validSeat(candidate.ownerSeat) &&
    candidate.ownerSeat === sourceDeckOwnerSeat &&
    candidate.zone === 'deck' &&
    Number.isInteger(candidate.level) &&
    candidate.level >= 1 &&
    candidate.level <= 2 &&
    candidate.race.toLowerCase() === 'spellcaster' &&
    candidate.isToken === false &&
    candidate.isExtraDeck === false &&
    candidate.canSpecialSummon === true;
}

/**
 * Enumerate eligible Level 1–2 Spellcasters from exactly the physical Deck
 * supplied by the resolver. No partner Deck is read or concatenated.
 */
export function eligibleApprenticeRecruitTargets(
  context: ApprenticeRecruitContext
): string[] {
  if (!validRecruitContext(context) ||
      context.effectNegated ||
      !context.destroyedByBattle ||
      context.teamMonsterZonesUsed >= 3) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of context.sourceDeck) {
    if (!candidate || !validRecruitCandidate(candidate, context.sourceDeckOwnerSeat) || seen.has(candidate.uid)) continue;
    seen.add(candidate.uid);
    result.push(candidate.uid);
  }
  return result;
}

/**
 * Revalidate a selected Deck UID and prepare its face-down Defense placement.
 * This does not move a card or mutate a Deck/field; the resolver owns that
 * atomic transition and preserves the physical card object.
 */
export function prepareApprenticeRecruit(
  context: ApprenticeRecruitContext,
  selectedUid: string
): ApprenticeRecruitResult {
  if (context.sourceCardId !== APPRENTICE_MAGICIAN_ID) return { ok: false, reason: 'wrong-source' };
  if (!context.destroyedByBattle) return { ok: false, reason: 'trigger-not-met' };
  if (context.effectNegated) return { ok: false, reason: 'negated' };
  if (context.teamMonsterZonesUsed >= 3) return { ok: false, reason: 'no-zone' };
  if (!validRecruitContext(context) || typeof selectedUid !== 'string') {
    return { ok: false, reason: 'target-not-eligible' };
  }

  const candidate = context.sourceDeck.find(item =>
    item.uid === selectedUid && validRecruitCandidate(item, context.sourceDeckOwnerSeat)
  );
  if (!candidate || !eligibleApprenticeRecruitTargets(context).includes(selectedUid)) {
    return { ok: false, reason: 'target-not-eligible' };
  }

  return Object.freeze({
    ok: true,
    uid: candidate.uid,
    cardId: candidate.cardId,
    ownerSeat: candidate.ownerSeat,
    destination: 'monster-zone',
    position: 'def',
    faceUp: false
  });
}
