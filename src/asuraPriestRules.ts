export const ASURA_PRIEST_ID = '02134346' as const;

export type AsuraPriestSeat = 0 | 1 | 2 | 3;
export type AsuraPriestSummonMethod = 'normal' | 'flip' | 'special';

export type AsuraPriestFieldMonster = Readonly<{
  uid: string;
  controller: AsuraPriestSeat;
  zone: 'monster' | 'spell-trap' | 'field' | 'grave' | 'banished';
  faceUp: boolean;
}>;

export type AsuraPriestAttackLedger = Readonly<{
  turn: number;
  byAttacker: Readonly<Record<string, readonly string[]>>;
}>;

export type AsuraPriestAttackContext = Readonly<{
  cardId: string;
  attackerUid: string;
  attackerSeat: AsuraPriestSeat;
  turn: number;
  opponentSeats: readonly AsuraPriestSeat[];
  opponentMonsters: readonly AsuraPriestFieldMonster[];
  ledger?: AsuraPriestAttackLedger | null;
}>;

export type AsuraPriestAttackRecordResult =
  | Readonly<{ ok: true; ledger: AsuraPriestAttackLedger }>
  | Readonly<{ ok: false; reason: 'wrong-card' | 'invalid-context' | 'already-attacked' | 'target-not-eligible' }>;

function isSeat(value: unknown): value is AsuraPriestSeat {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
}

function isTurn(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function validContext(context: AsuraPriestAttackContext): boolean {
  if (context.cardId !== ASURA_PRIEST_ID ||
      typeof context.attackerUid !== 'string' ||
      context.attackerUid.length === 0 ||
      !isSeat(context.attackerSeat) ||
      !isTurn(context.turn) ||
      !Array.isArray(context.opponentSeats) ||
      !Array.isArray(context.opponentMonsters)) {
    return false;
  }

  const seats = context.opponentSeats;
  if (seats.length === 0 ||
      seats.some(seat => !isSeat(seat) || seat === context.attackerSeat) ||
      new Set(seats).size !== seats.length) {
    return false;
  }

  return true;
}

function alreadyAttacked(context: AsuraPriestAttackContext): Set<string> {
  if (context.ledger?.turn !== context.turn) return new Set();
  const entries = context.ledger.byAttacker?.[context.attackerUid];
  return new Set(Array.isArray(entries) ? entries.filter(uid => typeof uid === 'string') : []);
}

/**
 * Return the current opposing monster UIDs Asura Priest may still attack this turn.
 * The caller supplies the two opposing seats explicitly; no partner hand or Deck
 * is read. Face-down monsters remain valid attack targets.
 */
export function eligibleAsuraPriestTargets(context: AsuraPriestAttackContext): string[] {
  if (!validContext(context)) return [];

  const opponents = new Set(context.opponentSeats);
  const used = alreadyAttacked(context);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const monster of context.opponentMonsters) {
    if (!monster ||
        typeof monster.uid !== 'string' ||
        monster.uid.length === 0 ||
        monster.uid === context.attackerUid ||
        !isSeat(monster.controller) ||
        !opponents.has(monster.controller) ||
        monster.zone !== 'monster' ||
        seen.has(monster.uid) ||
        used.has(monster.uid)) {
      continue;
    }
    seen.add(monster.uid);
    result.push(monster.uid);
  }

  return result;
}

/**
 * Record one target-specific attack. The same physical target UID cannot be
 * selected twice by this Asura Priest during the same turn. A new turn starts
 * a fresh ledger, and a newly summoned opposing monster becomes eligible.
 */
export function recordAsuraPriestTargetAttack(
  context: AsuraPriestAttackContext,
  targetUid: string
): AsuraPriestAttackRecordResult {
  if (context.cardId !== ASURA_PRIEST_ID) return { ok: false, reason: 'wrong-card' };
  if (!validContext(context)) return { ok: false, reason: 'invalid-context' };
  if (typeof targetUid !== 'string' || targetUid.length === 0) {
    return { ok: false, reason: 'target-not-eligible' };
  }

  const used = alreadyAttacked(context);
  if (used.has(targetUid)) return { ok: false, reason: 'already-attacked' };
  if (!eligibleAsuraPriestTargets(context).includes(targetUid)) {
    return { ok: false, reason: 'target-not-eligible' };
  }

  const previous = context.ledger?.turn === context.turn
    ? context.ledger.byAttacker
    : {};
  const byAttacker: Record<string, readonly string[]> = { ...previous };
  byAttacker[context.attackerUid] = Object.freeze([...used, targetUid]);

  return {
    ok: true,
    ledger: Object.freeze({
      turn: context.turn,
      byAttacker: Object.freeze(byAttacker)
    })
  };
}

/** Asura Priest cannot be Special Summoned by any method. */
export function asuraPriestSummonAllowed(
  cardId: string,
  method: AsuraPriestSummonMethod
): boolean {
  return cardId !== ASURA_PRIEST_ID || method !== 'special';
}

/**
 * The Spirit return is due only in the End Phase of the same turn in which
 * this card was Normal Summoned or flipped face-up, while it remains in a
 * Monster Zone. The caller performs the actual move to the physical hand.
 */
export function shouldReturnAsuraPriestAtEndPhase(input: Readonly<{
  cardId: string;
  turn: number;
  phase: string;
  inMonsterZone: boolean;
  normalSummonedTurn?: number | null;
  flippedFaceUpTurn?: number | null;
}>): boolean {
  if (input.cardId !== ASURA_PRIEST_ID ||
      !isTurn(input.turn) ||
      input.phase !== 'end' ||
      input.inMonsterZone !== true) {
    return false;
  }

  return input.normalSummonedTurn === input.turn ||
    input.flippedFaceUpTurn === input.turn;
}
