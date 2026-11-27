import type { Card } from './cardCatalog';
import type { Backrow, DuelState, Monster } from './duelEngine';
import { getDuelCard } from './effectRegistry';
import { RULES_PROFILE } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';

export const TERRAIN_FIELD_SPELL_IDS = Object.freeze({
  SOGEN: '86318356',
  MOUNTAIN: '50913601',
  WASTELAND: '23424603',
  FOREST: '87430998',
  UMI: '22702055',
  YAMI: '59197169',
} as const);

export const TERRAIN_FIELD_SPELL_MODIFIER = 200;

type Team = 0 | 1;
type LocatedMonster = { team: Team; index: number; monster: Monster };
type TerrainFieldSpellKey = keyof typeof TERRAIN_FIELD_SPELL_IDS;

export type TerrainFieldSpellState = TagDuel;
export type TerrainFieldSpellLookup =
  (id: string) => Pick<Card, 'kind' | 'field' | 'race'> | undefined;
export type TerrainFieldSpellNegationLookup = (state: DuelState, uid: string) => boolean;
export type TerrainFieldSpellIds = Readonly<Partial<Record<TerrainFieldSpellKey, string>>>;
export type TerrainFieldSpellModifier = Readonly<{
  targetUid: string;
  race: string;
  activeSources: number;
  atk: number;
  def: number;
  sourceUids: readonly string[];
}>;

type RaceRule = Readonly<{
  gains: readonly string[];
  loses: readonly string[];
}>;

const RACE_RULES: Readonly<Record<TerrainFieldSpellKey, RaceRule>> = Object.freeze({
  SOGEN: {
    gains: ['Warrior', 'Beast-Warrior'],
    loses: [],
  },
  MOUNTAIN: {
    gains: ['Dragon', 'Winged Beast', 'Thunder'],
    loses: [],
  },
  WASTELAND: {
    gains: ['Dinosaur', 'Zombie', 'Rock'],
    loses: [],
  },
  FOREST: {
    gains: ['Insect', 'Beast', 'Plant', 'Beast-Warrior'],
    loses: [],
  },
  UMI: {
    gains: ['Fish', 'Sea Serpent', 'Thunder', 'Aqua'],
    loses: ['Machine', 'Pyro'],
  },
  YAMI: {
    gains: ['Fiend', 'Spellcaster'],
    loses: ['Fairy'],
  },
});

const defaultLookup: TerrainFieldSpellLookup = id => getDuelCard(id);
const neverNegated: TerrainFieldSpellNegationLookup = () => false;
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

function assertPhysicalRules(state: TerrainFieldSpellState): void {
  for (let team = 0; team < 2; team++) {
    const player = state.core.players[team];
    if (player.monsters.length > RULES_PROFILE.monsterZones) {
      throw new Error('A equipe excedeu três Monster Zones.');
    }
    if (player.backrow.length > RULES_PROFILE.spellTrapZones) {
      throw new Error('A equipe excedeu três Spell/Trap Zones.');
    }
    // A Field Zone is independent from the three Spell/Trap Zones.
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

function assertState(state: TerrainFieldSpellState): void {
  if (!state || state.mode !== 'tag-classic' || !state.core ||
      !Array.isArray(state.core.players) || state.core.players.length !== 2 ||
      !Array.isArray(state.members) || state.members.length !== 4 ||
      !Array.isArray(state.active) || state.active.length !== 2 ||
      !state.core.teamRotation || !Number.isSafeInteger(state.core.turn) ||
      state.core.turn < 1 || !Array.isArray(state.core.chain)) {
    throw new Error('Estado TagDuel clássico inválido para Field Spells de terreno.');
  }
  assertTagDuel(state);
  assertPhysicalRules(state);
}

function inventorySnapshot(state: TerrainFieldSpellState): string {
  const cards = tagInventory(state);
  const uids = cards.map(card => card.uid);
  if (new Set(uids).size !== uids.length) {
    throw new Error('Inventário físico duplicado no estado TagDuel.');
  }
  return cards.map(card => card.uid + '=' + card.id).sort().join('|');
}

function requiredRace(lookup: TerrainFieldSpellLookup, id: string): string {
  const info = lookup(id);
  if (!info || info.kind !== 'monster' ||
      typeof info.race !== 'string' || !info.race.trim()) {
    throw new Error('Raça de monstro face-up indisponível para ' + id + '.');
  }
  return info.race;
}

export function createTerrainFieldSpellTagAdapter(
  ids: TerrainFieldSpellIds = {},
  lookup: TerrainFieldSpellLookup = defaultLookup,
  isEffectNegated: TerrainFieldSpellNegationLookup = neverNegated
) {
  const fieldSpellIds = { ...TERRAIN_FIELD_SPELL_IDS, ...ids };
  const configured = Object.entries(fieldSpellIds) as [TerrainFieldSpellKey, string][];
  const configuredIds = configured.map(([, id]) => id);
  if (configured.length !== 6 || configured.some(([, id]) => !validId(id)) ||
      new Set(configuredIds).size !== configuredIds.length) {
    throw new Error('Identidades das seis Field Spells de terreno inválidas.');
  }

  function getTerrainModifier(
    input: TerrainFieldSpellState,
    targetUid: string
  ): TerrainFieldSpellModifier {
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
    let atk = 0;
    let def = 0;

    // Each team owns a separate Field Zone, but active Field Spells affect
    // matching face-up monsters on both sides of the shared TagDuel field.
    for (const player of input.core.players) {
      const field = player.field as Backrow | null | undefined;
      if (!field || !field.faceUp || field.resolved === false) continue;

      const key = configured.find(([, id]) => id === field.id)?.[0];
      if (!key) continue;

      const sourceInfo = lookup(field.id);
      if (!sourceInfo || sourceInfo.kind !== 'spell' || sourceInfo.field !== true) {
        throw new Error('Field Spell de terreno sem metadados de Campo: ' + field.id + '.');
      }
      if (isEffectNegated(input.core, field.uid)) continue;

      const rule = RACE_RULES[key];
      const delta = rule.gains.includes(race)
        ? TERRAIN_FIELD_SPELL_MODIFIER
        : rule.loses.includes(race)
          ? -TERRAIN_FIELD_SPELL_MODIFIER
          : 0;
      if (delta === 0) continue;

      sourceUids.push(field.uid);
      atk += delta;
      def += delta;
    }

    const result: TerrainFieldSpellModifier = {
      targetUid,
      race,
      activeSources: sourceUids.length,
      atk,
      def,
      sourceUids,
    };

    if (inventorySnapshot(input) !== before) {
      throw new Error('Consulta de Field Spell alterou o inventário físico.');
    }
    return result;
  }

  return Object.freeze({
    fieldSpellIds: Object.freeze({ ...fieldSpellIds }),
    getTerrainModifier,
  });
}
