import type { Card } from './cardCatalog';
import type { DuelState, Monster } from './duelEngine';
import { monsterEffectsNegated } from './continuousEffects';
import { getDuelCard } from './effectRegistry';
import { RULES_PROFILE } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';
import { synchronizeCardLifetimes } from './cardLifetime';

export const HOSHININGEN_ID = '67629977';
export const THUNDER_NYAN_NYAN_ID = '14878871';
export const HOSHININGEN_LIGHT_ATK = 500;
export const HOSHININGEN_DARK_ATK = -400;

type Team = 0 | 1;
type Attribute = 'LIGHT' | 'DARK' | string;
type LocatedMonster = { team: Team; index: number; monster: Monster };

export type AttributeFieldEffectsState = TagDuel;
export type CardLookup = (id: string) => Pick<Card, 'kind' | 'attribute' | 'monsterType'> | undefined;
export type EffectNegationLookup = (state: DuelState, uid: string) => boolean;
export type AttributeFieldEffectIds = Readonly<{
  hoshiningenId?: string;
  thunderNyanNyanId?: string;
}>;
export type HoshiningenModifier = Readonly<{
  targetUid: string;
  attribute: Attribute;
  activeSources: number;
  atk: number;
}>;
export type ThunderNyanNyanResolution = Readonly<{
  state: AttributeFieldEffectsState;
  status: 'destroyed' | 'condition-not-met' | 'negated' | 'face-down' | 'source-left-field';
  conflictingUids: readonly string[];
}>;

const defaultLookup: CardLookup = id => getDuelCard(id);
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 160;

function physicalSeat(uid: string): number {
  const match = /^m([0-3]):/.exec(uid);
  if (!match) throw new Error('UID físico 2v2 inválido.');
  return Number(match[1]);
}

function locateMonster(state: DuelState, uid: string): LocatedMonster | undefined {
  const found: LocatedMonster[] = [];
  for (let team = 0; team < 2; team++) {
    state.players[team].monsters.forEach((monster, index) => {
      if (monster.uid === uid) found.push({ team: team as Team, index, monster });
    });
  }
  return found.length === 1 ? found[0] : undefined;
}

function assertPhysicalRules(state: AttributeFieldEffectsState): void {
  for (let team = 0; team < 2; team++) {
    const player = state.core.players[team];
    if (player.monsters.length > RULES_PROFILE.monsterZones) {
      throw new Error('A equipe excedeu três Monster Zones.');
    }
    if (player.backrow.length > RULES_PROFILE.spellTrapZones) {
      throw new Error('A equipe excedeu três Spell/Trap Zones.');
    }
  }

  const mainCounts = [0, 0, 0, 0];
  const extraCounts = [0, 0, 0, 0];
  for (const card of tagInventory(state)) {
    if (card.entityKind === 'token') continue;
    const seat = physicalSeat(card.uid);
    if (state.members[seat]?.team !== seat % 2) {
      throw new Error('Proprietário físico incompatível com o UID.');
    }
    const info = getDuelCard(card.id);
    if (!info) throw new Error('Carta física sem metadados admitidos.');
    if (info.fusion) extraCounts[seat]++;
    else mainCounts[seat]++;
  }

  for (let seat = 0; seat < 4; seat++) {
    if (mainCounts[seat] < RULES_PROFILE.mainDeckMin ||
        mainCounts[seat] > RULES_PROFILE.mainDeckMax) {
      throw new Error('Deck Principal físico fora de 20–30 no assento ' + seat + '.');
    }
    if (extraCounts[seat] > RULES_PROFILE.extraDeckMax) {
      throw new Error('Deck Adicional excedeu cinco cartas no assento ' + seat + '.');
    }
  }
}

function assertState(state: AttributeFieldEffectsState): void {
  if (!state || state.mode !== 'tag-classic' || !state.core ||
      !Array.isArray(state.core.players) || state.core.players.length !== 2 ||
      !Array.isArray(state.members) || state.members.length !== 4 ||
      !Array.isArray(state.active) || state.active.length !== 2 ||
      !state.core.teamRotation || !Number.isSafeInteger(state.core.turn) ||
      state.core.turn < 1 || !Array.isArray(state.core.chain)) {
    throw new Error('Estado TagDuel clássico inválido para efeitos de atributo.');
  }
  assertTagDuel(state);
  assertPhysicalRules(state);
}

function inventorySnapshot(state: AttributeFieldEffectsState): string {
  const cards = tagInventory(state);
  const uids = cards.map(card => card.uid);
  if (new Set(uids).size !== uids.length) {
    throw new Error('Inventário físico duplicado no estado TagDuel.');
  }
  return cards.map(card => card.uid + '=' + card.id).sort().join('|');
}

function assertConserved(before: string, after: AttributeFieldEffectsState): void {
  if (inventorySnapshot(after) !== before) {
    throw new Error('Efeito de atributo alterou o inventário físico.');
  }
}

function requiredAttribute(lookup: CardLookup, id: string): Attribute {
  const info = lookup(id);
  if (!info || info.kind !== 'monster' || typeof info.attribute !== 'string' || !info.attribute) {
    throw new Error('Atributo de monstro face-up indisponível para ' + id + '.');
  }
  return info.attribute;
}

export function createAttributeFieldEffectsTagAdapter(
  ids: AttributeFieldEffectIds = {},
  lookup: CardLookup = defaultLookup,
  isEffectNegated: EffectNegationLookup = monsterEffectsNegated
) {
  const hoshiningenId = ids.hoshiningenId ?? HOSHININGEN_ID;
  const thunderNyanNyanId = ids.thunderNyanNyanId ?? THUNDER_NYAN_NYAN_ID;
  if (!validId(hoshiningenId) || !validId(thunderNyanNyanId) ||
      hoshiningenId === thunderNyanNyanId) {
    throw new Error('Identidades de Hoshiningen/Thunder Nyan Nyan inválidas.');
  }

  function getHoshiningenAtkModifier(
    input: AttributeFieldEffectsState,
    targetUid: string
  ): HoshiningenModifier {
    assertState(input);
    if (!validId(targetUid)) throw new Error('UID-alvo inválido.');
    const target = locateMonster(input.core, targetUid);
    if (!target || !target.monster.faceUp) {
      return { targetUid, attribute: 'UNKNOWN', activeSources: 0, atk: 0 };
    }

    const attribute = requiredAttribute(lookup, target.monster.id);
    let activeSources = 0;
    for (const player of input.core.players) {
      for (const source of player.monsters) {
        if (source.id !== hoshiningenId || !source.faceUp) continue;
        if (requiredAttribute(lookup, source.id) !== 'LIGHT') {
          throw new Error('Hoshiningen precisa conservar seu atributo LIGHT.');
        }
        if (!isEffectNegated(input.core, source.uid)) activeSources++;
      }
    }

    const atk = attribute === 'LIGHT'
      ? activeSources * HOSHININGEN_LIGHT_ATK
      : attribute === 'DARK'
        ? activeSources * HOSHININGEN_DARK_ATK
        : 0;
    return { targetUid, attribute, activeSources, atk };
  }

  function resolveThunderNyanNyan(
    input: AttributeFieldEffectsState,
    sourceUid: string
  ): ThunderNyanNyanResolution {
    assertState(input);
    if (!validId(sourceUid)) throw new Error('UID de Thunder Nyan Nyan inválido.');
    const source = locateMonster(input.core, sourceUid);
    if (!source || source.monster.id !== thunderNyanNyanId) {
      return { state: input, status: 'source-left-field', conflictingUids: [] };
    }
    if (!source.monster.faceUp) {
      return { state: input, status: 'face-down', conflictingUids: [] };
    }
    if (requiredAttribute(lookup, source.monster.id) !== 'LIGHT') {
      throw new Error('Thunder Nyan Nyan precisa conservar seu atributo LIGHT.');
    }
    if (isEffectNegated(input.core, sourceUid)) {
      return { state: input, status: 'negated', conflictingUids: [] };
    }

    const conflictingUids = input.core.players[source.team].monsters
      .filter(monster => monster.uid !== sourceUid && monster.faceUp)
      .filter(monster => requiredAttribute(lookup, monster.id) !== 'LIGHT')
      .map(monster => monster.uid)
      .sort();

    if (conflictingUids.length === 0) {
      return { state: input, status: 'condition-not-met', conflictingUids };
    }

    const before = inventorySnapshot(input);
    const next = structuredClone(input);
    const current = locateMonster(next.core, sourceUid);
    if (!current || current.monster.id !== thunderNyanNyanId || !current.monster.faceUp) {
      return { state: input, status: 'source-left-field', conflictingUids: [] };
    }
    const ownerSeat = physicalSeat(sourceUid);
    const ownerTeam = (ownerSeat % 2) as Team;
    if (next.members[ownerSeat]?.team !== ownerTeam ||
        (current.monster.owner !== undefined && current.monster.owner !== ownerTeam)) {
      throw new Error('Proprietário físico de Thunder Nyan Nyan incompatível com o UID.');
    }

    const [destroyed] = next.core.players[current.team].monsters.splice(current.index, 1);
    next.core.players[ownerTeam].grave.push({
      uid: destroyed.uid,
      id: destroyed.id,
      ...(destroyed.properlySummoned ? { properlySummoned: true } : {}),
    });
    synchronizeCardLifetimes(next.core);
    assertConserved(before, next);
    assertState(next);
    return { state: next, status: 'destroyed', conflictingUids };
  }

  return Object.freeze({
    hoshiningenId,
    thunderNyanNyanId,
    getHoshiningenAtkModifier,
    resolveThunderNyanNyan,
  });
}
