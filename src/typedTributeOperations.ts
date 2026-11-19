import type { Card } from './cardCatalog';

export const ANTI_AIRCRAFT_FLOWER_ID = '65064143';
export const ARCANE_ARCHER_OF_THE_FOREST_ID = '55001420';
export type TributeTeam = 0 | 1;
export type TributeRace = 'Insect' | 'Plant';

export interface TypedTributeMonster {
  readonly uid: string;
  readonly id: string;
  readonly team: TributeTeam;
  readonly faceUp: boolean;
  readonly entityKind?: 'token';
  readonly ownerSeat?: number;
}

export interface ArcaneArcherFieldCard {
  readonly uid: string;
  readonly id: string;
  readonly team: TributeTeam;
  readonly faceUp: boolean;
  readonly zone: 'backrow' | 'field';
}

export interface ArcaneArcherTargetOption {
  readonly uid: string;
  readonly team: TributeTeam;
  readonly zone: 'backrow' | 'field';
  readonly faceUp: boolean;
  readonly displayName: string;
  /** Omitted for an opponent's Set card to avoid leaking hidden identity. */
  readonly visibleCardId?: string;
}

function requiredTributeRace(sourceCardId: string): TributeRace | null {
  if (sourceCardId === ANTI_AIRCRAFT_FLOWER_ID) return 'Insect';
  if (sourceCardId === ARCANE_ARCHER_OF_THE_FOREST_ID) return 'Plant';
  return null;
}

function assertTeam(team: number): asserts team is TributeTeam {
  if (team !== 0 && team !== 1) throw new RangeError('Tribute team must be 0 or 1.');
}

function assertLookup(getCard: unknown): asserts getCard is (id: string) => Card | undefined {
  if (typeof getCard !== 'function') throw new TypeError('Tribute card lookup must be a function.');
}

function assertUniqueFieldUids<T extends { readonly uid: string; readonly id: string }>(
  refs: readonly T[],
  label: string,
): void {
  if (!Array.isArray(refs)) throw new TypeError(`${label} must be an array.`);
  const seen = new Set<string>();
  for (const ref of refs) {
    if (!ref || typeof ref.uid !== 'string' || ref.uid.length === 0 ||
        typeof ref.id !== 'string' || ref.id.length === 0) {
      throw new TypeError(`${label} contains an invalid physical card reference.`);
    }
    if (seen.has(ref.uid)) throw new Error(`${label} contains a duplicate physical UID.`);
    seen.add(ref.uid);
  }
}

/**
 * Shared-field typed Tribute discovery for Anti-Aircraft Flower and Arcane
 * Archer. The active representative may Tribute a monster physically owned
 * by either teammate because both control the team's three shared zones.
 * Face-down allied monsters remain eligible; opposing zones are never read.
 */
export function typedTributeCandidates<T extends TypedTributeMonster>(
  sourceCardId: string,
  controllerTeam: TributeTeam,
  sharedMonsters: readonly T[],
  getCard: (id: string) => Card | undefined,
): readonly T[] {
  assertTeam(controllerTeam);
  assertLookup(getCard);
  assertUniqueFieldUids(sharedMonsters, 'Shared Monster Zones');
  const race = requiredTributeRace(sourceCardId);
  if (!race) return Object.freeze([]);
  for (const monster of sharedMonsters) {
    if ((monster.team !== 0 && monster.team !== 1) || typeof monster.faceUp !== 'boolean') {
      throw new TypeError('Shared Monster Zones contain an invalid team/position reference.');
    }
  }
  return Object.freeze(sharedMonsters.filter(monster => {
    if (monster.team !== controllerTeam) return false;
    const card = getCard(monster.id);
    return card?.kind === 'monster' && card.race === race;
  }));
}

/** Revalidate the Tribute UID against the current shared field before payment. */
export function resolveTypedTributeSelection<T extends TypedTributeMonster>(
  sourceCardId: string,
  controllerTeam: TributeTeam,
  sharedMonsters: readonly T[],
  selectedUid: string,
  getCard: (id: string) => Card | undefined,
): T | null {
  const current = typedTributeCandidates(sourceCardId, controllerTeam, sharedMonsters, getCard);
  if (typeof selectedUid !== 'string' || selectedUid.length === 0) return null;
  return current.find(monster => monster.uid === selectedUid) ?? null;
}

/** Anti-Aircraft Flower has no once-per-turn clause: each payment burns 800 LP. */
export function antiAircraftFlowerBurnAmount(sourceCardId: string): 800 | null {
  return sourceCardId === ANTI_AIRCRAFT_FLOWER_ID ? 800 : null;
}

/**
 * Arcane Archer cannot be attacked while its controller has a face-up Plant
 * monster anywhere in the team's shared Monster Zones.
 */
export function arcaneArcherIsAttackProtected<T extends TypedTributeMonster>(
  source: T,
  sharedMonsters: readonly T[],
  getCard: (id: string) => Card | undefined,
): boolean {
  assertLookup(getCard);
  assertUniqueFieldUids(sharedMonsters, 'Shared Monster Zones');
  if (!source || source.id !== ARCANE_ARCHER_OF_THE_FOREST_ID ||
      !source.faceUp || (source.team !== 0 && source.team !== 1) ||
      !sharedMonsters.some(monster => monster.uid === source.uid &&
        monster.id === source.id && monster.team === source.team && monster.faceUp)) {
    return false;
  }
  return sharedMonsters.some(monster => {
    if (monster.team !== source.team || !monster.faceUp) return false;
    const card = getCard(monster.id);
    return card?.kind === 'monster' && card.race === 'Plant';
  });
}

/**
 * Build a privacy-safe target menu for Arcane Archer. Any Set Spell/Trap on
 * either team's field is targetable, but an opponent's Set card is represented
 * only by a generic label; its ID/name is never copied into the option.
 */
export function arcaneArcherSpellTrapTargetOptions(
  sourceCardId: string,
  controllerTeam: TributeTeam,
  fieldCards: readonly ArcaneArcherFieldCard[],
  getCard: (id: string) => Card | undefined,
): readonly ArcaneArcherTargetOption[] {
  assertTeam(controllerTeam);
  assertLookup(getCard);
  assertUniqueFieldUids(fieldCards, 'Shared Spell/Trap Zones');
  if (sourceCardId !== ARCANE_ARCHER_OF_THE_FOREST_ID) return Object.freeze([]);
  const options: ArcaneArcherTargetOption[] = [];
  for (const ref of fieldCards) {
    if ((ref.team !== 0 && ref.team !== 1) ||
        typeof ref.faceUp !== 'boolean' ||
        !['backrow', 'field'].includes(ref.zone)) {
      throw new TypeError('Shared Spell/Trap Zones contain an invalid target reference.');
    }
    if (!ref.faceUp && ref.team !== controllerTeam) {
      options.push(Object.freeze({
        uid: ref.uid,
        team: ref.team,
        zone: ref.zone,
        faceUp: false,
        displayName: 'Carta virada para baixo',
      }));
      continue;
    }
    const card = getCard(ref.id);
    if (card?.kind !== 'spell' && card?.kind !== 'trap') continue;
    options.push(Object.freeze({
      uid: ref.uid,
      team: ref.team,
      zone: ref.zone,
      faceUp: ref.faceUp,
      displayName: card.name,
      visibleCardId: ref.id,
    }));
  }
  return Object.freeze(options);
}

/** Resolve the current target by UID; the raw reference stays server-side. */
export function resolveArcaneArcherSpellTrapTarget<T extends ArcaneArcherFieldCard>(
  controllerTeam: TributeTeam,
  fieldCards: readonly T[],
  selectedUid: string,
  getCard: (id: string) => Card | undefined,
): T | null {
  const options = arcaneArcherSpellTrapTargetOptions(
    ARCANE_ARCHER_OF_THE_FOREST_ID, controllerTeam, fieldCards, getCard,
  );
  if (typeof selectedUid !== 'string' || selectedUid.length === 0 ||
      !options.some(option => option.uid === selectedUid)) return null;
  return fieldCards.find(ref => ref.uid === selectedUid) ?? null;
}
