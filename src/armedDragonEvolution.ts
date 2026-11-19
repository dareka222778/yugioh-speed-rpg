import type { Card } from './cardCatalog';

export const ARMED_DRAGON_LV3_ID = '00980973';
export const ARMED_DRAGON_LV5_ID = '46384672';
export const ARMED_DRAGON_LV7_ID = '73879377';

export type ArmedDragonTeam = 0 | 1;
export type ArmedDragonPhase = 'standby' | 'end';
export type PhysicalSeat = 0 | 1 | 2 | 3;
export type ArmedDragonZone = 'hand' | 'deck';

export interface ArmedDragonPhysicalCard {
  readonly uid: string;
  readonly id: string;
  readonly entityKind?: 'token';
  readonly ownerSeat?: PhysicalSeat;
}

export interface ArmedDragonFieldMonster {
  readonly uid: string;
  readonly id: string;
  readonly team: ArmedDragonTeam;
  readonly faceUp: boolean;
}

export interface ArmedDragonLevelUpCandidate<T extends ArmedDragonPhysicalCard> {
  readonly zone: ArmedDragonZone;
  readonly card: T;
}

function validSeat(value: unknown): value is PhysicalSeat {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function assertPhysicalZone<T extends ArmedDragonPhysicalCard>(
  cards: readonly T[],
  label: string,
  expectedOwner: PhysicalSeat,
  seen: Set<string>,
): void {
  if (!Array.isArray(cards)) throw new TypeError(`${label} must be an array.`);
  for (const ref of cards) {
    if (!ref || typeof ref.uid !== 'string' || ref.uid.length === 0 ||
        typeof ref.id !== 'string' || ref.id.length === 0) {
      throw new TypeError(`${label} contains an invalid physical card reference.`);
    }
    if (ref.entityKind === 'token') {
      throw new Error(`${label} cannot contain a token.`);
    }
    if (ref.ownerSeat !== undefined && ref.ownerSeat !== expectedOwner) {
      throw new Error(`${label} contains a card owned by another physical seat.`);
    }
    if (seen.has(ref.uid)) throw new Error('Duplicate physical UID across Armed Dragon zones.');
    seen.add(ref.uid);
  }
}

function assertPhysicalSeatOwnership(
  activeSeat: number,
  handOwnerSeat: number,
  deckOwnerSeat?: number,
): { activeSeat: PhysicalSeat; handOwnerSeat: PhysicalSeat; deckOwnerSeat?: PhysicalSeat } {
  if (!validSeat(activeSeat) || !validSeat(handOwnerSeat) ||
      deckOwnerSeat !== undefined && !validSeat(deckOwnerSeat)) {
    throw new RangeError('Armed Dragon physical seat must be 0, 1, 2, or 3.');
  }
  if (activeSeat !== handOwnerSeat ||
      deckOwnerSeat !== undefined && activeSeat !== deckOwnerSeat) {
    throw new Error('Armed Dragon cannot read a partner private hand or Deck.');
  }
  return {
    activeSeat,
    handOwnerSeat,
    deckOwnerSeat: deckOwnerSeat as PhysicalSeat | undefined,
  };
}

function assertCardLookup(getCard: unknown): asserts getCard is (id: string) => Card | undefined {
  if (typeof getCard !== 'function') throw new TypeError('Armed Dragon card lookup must be a function.');
}

/**
 * LV3 evolves to LV5 during its controller's Standby Phase.
 * LV5 evolves to LV7 during the End Phase only if it destroyed a monster by
 * battle that turn. Both effects search only the resolving physical player's
 * own hand and Deck; candidates retain their original references/UIDs.
 */
export function armedDragonLevelUpCandidates<T extends ArmedDragonPhysicalCard>(
  sourceCardId: string,
  sourceFaceUp: boolean,
  phase: ArmedDragonPhase,
  destroyedMonsterByBattleThisTurn: boolean,
  activeSeat: number,
  handOwnerSeat: number,
  deckOwnerSeat: number,
  hand: readonly T[],
  deck: readonly T[],
  getCard: (id: string) => Card | undefined,
): readonly ArmedDragonLevelUpCandidate<T>[] {
  const seats = assertPhysicalSeatOwnership(activeSeat, handOwnerSeat, deckOwnerSeat);
  assertCardLookup(getCard);
  const seen = new Set<string>();
  assertPhysicalZone(hand, 'Armed Dragon hand', seats.handOwnerSeat, seen);
  assertPhysicalZone(deck, 'Armed Dragon Deck', seats.deckOwnerSeat!, seen);

  if (!sourceFaceUp) return Object.freeze([]);
  let targetId: string;
  if (sourceCardId === ARMED_DRAGON_LV3_ID) {
    if (phase !== 'standby') return Object.freeze([]);
    targetId = ARMED_DRAGON_LV5_ID;
  } else if (sourceCardId === ARMED_DRAGON_LV5_ID) {
    if (phase !== 'end' || destroyedMonsterByBattleThisTurn !== true) {
      return Object.freeze([]);
    }
    targetId = ARMED_DRAGON_LV7_ID;
  } else {
    return Object.freeze([]);
  }

  const isTarget = (ref: T) => {
    const card = getCard(ref.id);
    return card?.kind === 'monster' && ref.id === targetId;
  };
  return Object.freeze([
    ...hand.filter(isTarget).map(card => Object.freeze({ zone: 'hand' as const, card })),
    ...deck.filter(isTarget).map(card => Object.freeze({ zone: 'deck' as const, card })),
  ]);
}

/** LV7 is a Special-Summon-only monster and its evolution source is LV5. */
export function armedDragonLv7MayBeNormalSummonedOrSet(): false {
  return false;
}

export function armedDragonLv7SummonSourceAllowed(sourceCardId: string): boolean {
  return sourceCardId === ARMED_DRAGON_LV5_ID;
}

/** A previously properly Summoned LV7 may be revived; an unqualified copy may not. */
export function armedDragonLv7MayBeRevived(properlySummoned: boolean): boolean {
  return properlySummoned === true;
}

/** Only monsters in the active physical player's own hand can pay LV5/LV7's cost. */
export function armedDragonDiscardTargets<T extends ArmedDragonPhysicalCard>(
  hand: readonly T[],
  activeSeat: number,
  handOwnerSeat: number,
  getCard: (id: string) => Card | undefined,
): readonly T[] {
  const seats = assertPhysicalSeatOwnership(activeSeat, handOwnerSeat);
  assertCardLookup(getCard);
  const seen = new Set<string>();
  assertPhysicalZone(hand, 'Armed Dragon hand', seats.handOwnerSeat, seen);
  return Object.freeze(hand.filter(ref => getCard(ref.id)?.kind === 'monster'));
}

/** Revalidate a discard UID before the resolver pays the cost. */
export function resolveArmedDragonDiscard<T extends ArmedDragonPhysicalCard>(
  hand: readonly T[],
  activeSeat: number,
  handOwnerSeat: number,
  selectedUid: string,
  getCard: (id: string) => Card | undefined,
): T | null {
  const current = armedDragonDiscardTargets(hand, activeSeat, handOwnerSeat, getCard);
  if (typeof selectedUid !== 'string' || selectedUid.length === 0) return null;
  return current.find(ref => ref.uid === selectedUid) ?? null;
}

function armedDragonEligibleTargets<T extends ArmedDragonFieldMonster>(
  opposingMonsters: readonly T[],
  opposingTeam: ArmedDragonTeam,
  discardedMonsterAtk: number,
  currentAtk: (monster: T) => number,
  usedThisTurn: boolean,
): readonly T[] {
  if (!Array.isArray(opposingMonsters)) throw new TypeError('Opposing Monster Zones must be an array.');
  if (opposingTeam !== 0 && opposingTeam !== 1) throw new RangeError('Invalid opposing team.');
  if (!Number.isSafeInteger(discardedMonsterAtk) || discardedMonsterAtk < 0) {
    throw new RangeError('Discarded monster ATK must be a non-negative safe integer.');
  }
  if (typeof currentAtk !== 'function') throw new TypeError('Current ATK lookup must be a function.');
  if (typeof usedThisTurn !== 'boolean') throw new TypeError('Once-per-turn state must be boolean.');
  const seen = new Set<string>();
  for (const monster of opposingMonsters) {
    if (!monster || typeof monster.uid !== 'string' || monster.uid.length === 0 ||
        typeof monster.id !== 'string' || monster.id.length === 0 ||
        (monster.team !== 0 && monster.team !== 1) || typeof monster.faceUp !== 'boolean') {
      throw new TypeError('Opposing Monster Zones contain an invalid monster reference.');
    }
    if (seen.has(monster.uid)) throw new Error('Opposing Monster Zones contain a duplicate physical UID.');
    seen.add(monster.uid);
  }
  if (usedThisTurn) return Object.freeze([]);
  return Object.freeze(opposingMonsters.filter(monster => {
    if (monster.team !== opposingTeam || !monster.faceUp) return false;
    const atk = currentAtk(monster);
    if (!Number.isSafeInteger(atk) || atk < 0) {
      throw new RangeError('Current opposing monster ATK must be a non-negative safe integer.');
    }
    return atk <= discardedMonsterAtk;
  }));
}

/** LV5 chooses one face-up opposing monster whose current ATK is within threshold. */
export function armedDragonLv5DestroyCandidates<T extends ArmedDragonFieldMonster>(
  opposingMonsters: readonly T[],
  opposingTeam: ArmedDragonTeam,
  discardedMonsterAtk: number,
  currentAtk: (monster: T) => number,
  usedThisTurn: boolean,
): readonly T[] {
  return armedDragonEligibleTargets(
    opposingMonsters, opposingTeam, discardedMonsterAtk, currentAtk, usedThisTurn,
  );
}

export function resolveArmedDragonLv5DestroyTarget<T extends ArmedDragonFieldMonster>(
  opposingMonsters: readonly T[],
  opposingTeam: ArmedDragonTeam,
  discardedMonsterAtk: number,
  currentAtk: (monster: T) => number,
  usedThisTurn: boolean,
  selectedUid: string,
): T | null {
  const current = armedDragonLv5DestroyCandidates(
    opposingMonsters, opposingTeam, discardedMonsterAtk, currentAtk, usedThisTurn,
  );
  if (typeof selectedUid !== 'string' || selectedUid.length === 0) return null;
  return current.find(monster => monster.uid === selectedUid) ?? null;
}

/** LV7 applies the same threshold to every eligible face-up opposing monster. */
export function armedDragonLv7DestroyTargets<T extends ArmedDragonFieldMonster>(
  opposingMonsters: readonly T[],
  opposingTeam: ArmedDragonTeam,
  discardedMonsterAtk: number,
  currentAtk: (monster: T) => number,
  usedThisTurn: boolean,
): readonly T[] {
  return armedDragonEligibleTargets(
    opposingMonsters, opposingTeam, discardedMonsterAtk, currentAtk, usedThisTurn,
  );
}
