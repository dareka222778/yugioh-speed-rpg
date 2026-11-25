import type { Card } from './cardCatalog';
import type { Backrow, DuelState, Monster } from './duelEngine';
import { getDuelCard } from './effectRegistry';
import { RULES_PROFILE } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';

export const RACE_FIELD_SPELL_IDS = Object.freeze({
  YAMI: '59197169',
  FOREST: '87430998',
  WASTELAND: '23424603',
} as const);
export const RACE_FIELD_SPELL_DELTA = 200;

export type RaceFieldSpellName = keyof typeof RACE_FIELD_SPELL_IDS;
export type RaceFieldSpellState = TagDuel;
export type RaceFieldSpellLookup =
  (id: string) => Pick<Card, 'kind' | 'field' | 'race'> | undefined;
export type RaceFieldSpellIds = Readonly<Partial<Record<RaceFieldSpellName, string>>>;
export type FieldSpellNegationLookup = (state: DuelState, uid: string) => boolean;
export type RaceFieldSpellModifier = Readonly<{
  targetUid: string;
  race: string;
  activeSources: number;
  atk: number;
  def: number;
  sourceUids: readonly string[];
}>;

const defaultLookup: RaceFieldSpellLookup = id => getDuelCard(id);
const neverNegated: FieldSpellNegationLookup = () => false;
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 160;
const forestRaces = new Set(['Insect', 'Beast', 'Plant', 'Beast-Warrior']);
const wastelandRaces = new Set(['Dinosaur', 'Zombie', 'Rock']);

type Team = 0 | 1;
type LocatedMonster = { team: Team; index: number; monster: Monster };

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

function assertPhysicalRules(state: RaceFieldSpellState): void {
  for (let team = 0; team < 2; team++) {
    const player = state.core.players[team];
    if (player.monsters.length > RULES_PROFILE.monsterZones) {
      throw new Error('A equipe excedeu três Monster Zones.');
    }
    if (player.backrow.length > RULES_PROFILE.spellTrapZones) {
      throw new Error('A equipe excedeu três Spell/Trap Zones.');
    }
    if (player.field && !player.field.uid) {
      throw new Error('Carta inválida na Field Zone.');
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

function assertState(state: RaceFieldSpellState): void {
  if (!state || state.mode !== 'tag-classic' || !state.core ||
      !Array.isArray(state.core.players) || state.core.players.length !== 2 ||
      !Array.isArray(state.members) || state.members.length !== 4 ||
      !Array.isArray(state.active) || state.active.length !== 2 ||
      !state.core.teamRotation || !Number.isSafeInteger(state.core.turn) ||
      state.core.turn < 1 || !Array.isArray(state.core.chain)) {
    throw new Error('Estado TagDuel clássico inválido para Field Spells de Raça.');
  }
  assertTagDuel(state);
  assertPhysicalRules(state);
}

function inventorySnapshot(state: RaceFieldSpellState): string {
  const cards = tagInventory(state);
  const uids = cards.map(card => card.uid);
  if (new Set(uids).size !== uids.length) {
    throw new Error('Inventário físico duplicado no estado TagDuel.');
  }
  return cards.map(card => card.uid + '=' + card.id).sort().join('|');
}

function requiredRace(lookup: RaceFieldSpellLookup, id: string): string {
  const info = lookup(id);
  if (!info || info.kind !== 'monster' ||
      typeof info.race !== 'string' || !info.race) {
    throw new Error('Raça de monstro face-up indisponível para ' + id + '.');
  }
  return info.race;
}

function modifierFor(source: RaceFieldSpellName, race: string): number {
  if (source === 'YAMI') {
    if (race === 'Fiend' || race === 'Spellcaster') return RACE_FIELD_SPELL_DELTA;
    if (race === 'Fairy') return -RACE_FIELD_SPELL_DELTA;
    return 0;
  }
  if (source === 'FOREST') return forestRaces.has(race) ? RACE_FIELD_SPELL_DELTA : 0;
  return wastelandRaces.has(race) ? RACE_FIELD_SPELL_DELTA : 0;
}

export function createRaceFieldSpellTagAdapter(
  ids: RaceFieldSpellIds = {},
  lookup: RaceFieldSpellLookup = defaultLookup,
  isEffectNegated: FieldSpellNegationLookup = neverNegated
) {
  const fieldSpellIds = { ...RACE_FIELD_SPELL_IDS, ...ids };
  const configured = Object.entries(fieldSpellIds) as [RaceFieldSpellName, string][];
  const configuredIds = configured.map(([, id]) => id);
  if (configured.length !== 3 || configured.some(([, id]) => !validId(id)) ||
      new Set(configuredIds).size !== configuredIds.length) {
    throw new Error('Identidades de Yami, Forest e Wasteland inválidas.');
  }

  function getRaceModifier(
    input: RaceFieldSpellState,
    targetUid: string
  ): RaceFieldSpellModifier {
    assertState(input);
    if (!validId(targetUid)) throw new Error('UID-alvo inválido.');
    const before = inventorySnapshot(input);
    const target = locateMonster(input.core, targetUid);

    if (!target || !target.monster.faceUp) {
      if (inventorySnapshot(input) !== before) {
        throw new Error('Consulta de Field Spell alterou o inventário físico.');
      }
      return {
        targetUid,
        race: 'UNKNOWN',
        activeSources: 0,
        atk: 0,
        def: 0,
        sourceUids: [],
      };
    }

    const race = requiredRace(lookup, target.monster.id);
    const sourceUids: string[] = [];
    let total = 0;

    // Each team has a separate Field Zone; each active source affects
    // matching face-up monsters on both sides of the shared TagDuel field.
    for (const player of input.core.players) {
      const field = player.field as Backrow | null | undefined;
      if (!field || !field.faceUp || field.resolved === false) continue;

      const source = configured.find(([, id]) => id === field.id)?.[0];
      if (!source) continue;
      const sourceInfo = lookup(field.id);
      if (!sourceInfo || sourceInfo.kind !== 'spell' || sourceInfo.field !== true) {
        throw new Error('Field Spell de Raça sem metadados de Campo: ' + field.id + '.');
      }
      if (isEffectNegated(input.core, field.uid)) continue;

      const delta = modifierFor(source, race);
      if (delta === 0) continue;
      total += delta;
      sourceUids.push(field.uid);
    }

    const result: RaceFieldSpellModifier = {
      targetUid,
      race,
      activeSources: sourceUids.length,
      atk: total,
      def: total,
      sourceUids,
    };
    if (inventorySnapshot(input) !== before) {
      throw new Error('Consulta de Field Spell alterou o inventário físico.');
    }
    return result;
  }

  return {
    fieldSpellIds: Object.freeze({ ...fieldSpellIds }),
    getRaceModifier,
  };
}
