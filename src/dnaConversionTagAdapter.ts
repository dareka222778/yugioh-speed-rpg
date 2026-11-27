import type { Card } from './cardCatalog';
import type { Backrow, DuelState, Monster } from './duelEngine';
import { getDuelCard } from './effectRegistry';
import { RULES_PROFILE } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';

export const DNA_CONVERSION_CARD_IDS = Object.freeze({
  DNA_SURGERY: '74701381',
  DNA_TRANSPLANT: '56769674',
} as const);

export const DNA_CONVERSION_ATTRIBUTES = Object.freeze([
  'DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE',
] as const);

export const DNA_CONVERSION_RACES = Object.freeze([
  'Spellcaster', 'Dragon', 'Zombie', 'Warrior', 'Beast-Warrior',
  'Beast', 'Winged Beast', 'Fiend', 'Fairy', 'Insect', 'Dinosaur',
  'Reptile', 'Fish', 'Sea Serpent', 'Aqua', 'Pyro', 'Thunder',
  'Rock', 'Plant', 'Machine', 'Psychic', 'Divine-Beast', 'Wyrm',
  'Cyberse', 'Illusion',
] as const);

type Team = 0 | 1;
type LocatedMonster = { team: Team; index: number; monster: Monster };
type DnaCardKey = keyof typeof DNA_CONVERSION_CARD_IDS;
type DnaProperty = 'race' | 'attribute';

export type DnaConversionState = TagDuel;
export type DnaConversionIds = Readonly<Partial<Record<DnaCardKey, string>>>;
export type DnaConversionLookup =
  (id: string) => Pick<Card, 'kind' | 'attribute' | 'race'> | undefined;
export type DnaDeclarationLookup = (uid: string) => string | undefined;
export type DnaActivationOrderLookup = (uid: string) => number | undefined;
export type DnaNegationLookup = (state: DuelState, uid: string) => boolean;

export type DnaConversionResult = Readonly<{
  targetUid: string;
  originalRace: string;
  originalAttribute: string;
  race: string;
  attribute: string;
  raceSourceUid: string | null;
  attributeSourceUid: string | null;
  activeSources: number;
  sourceUids: readonly string[];
}>;

type ActiveDeclaration = Readonly<{
  uid: string;
  property: DnaProperty;
  value: string;
  activationOrder: number;
}>;

const defaultLookup: DnaConversionLookup = id => getDuelCard(id);
const noDeclaration: DnaDeclarationLookup = () => undefined;
const defaultActivationOrder: DnaActivationOrderLookup = () => 0;
const neverNegated: DnaNegationLookup = () => false;
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

function assertPhysicalRules(state: DnaConversionState): void {
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

function assertState(state: DnaConversionState): void {
  if (!state || state.mode !== 'tag-classic' || !state.core ||
      !Array.isArray(state.core.players) || state.core.players.length !== 2 ||
      !Array.isArray(state.members) || state.members.length !== 4 ||
      !Array.isArray(state.active) || state.active.length !== 2 ||
      !state.core.teamRotation || !Number.isSafeInteger(state.core.turn) ||
      state.core.turn < 1 || !Array.isArray(state.core.chain)) {
    throw new Error('Estado TagDuel clássico inválido para DNA conversion.');
  }
  assertTagDuel(state);
  assertPhysicalRules(state);
}

function inventorySnapshot(state: DnaConversionState): string {
  const cards = tagInventory(state);
  const uids = cards.map(card => card.uid);
  if (new Set(uids).size !== uids.length) {
    throw new Error('Inventário físico duplicado no estado TagDuel.');
  }
  return cards.map(card => card.uid + '=' + card.id).sort().join('|');
}

function requiredOriginal(lookup: DnaConversionLookup, id: string): {
  race: string;
  attribute: string;
} {
  const info = lookup(id);
  if (!info || info.kind !== 'monster' ||
      typeof info.race !== 'string' || !info.race.trim() ||
      typeof info.attribute !== 'string' || !info.attribute.trim()) {
    throw new Error('Raça/Atributo original indisponível para ' + id + '.');
  }
  return { race: info.race, attribute: info.attribute };
}

function validateDeclaration(property: DnaProperty, value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return property === 'race'
    ? (DNA_CONVERSION_RACES as readonly string[]).includes(value)
    : (DNA_CONVERSION_ATTRIBUTES as readonly string[]).includes(value);
}

function effectiveDeclaration(
  property: DnaProperty,
  declarations: readonly ActiveDeclaration[]
): ActiveDeclaration | undefined {
  const matches = declarations
    .filter(item => item.property === property)
    .sort((a, b) => b.activationOrder - a.activationOrder);
  if (matches.length > 1 && matches[0].activationOrder === matches[1].activationOrder) {
    throw new Error('Ordem de ativação ambígua para DNA ' + property + '.');
  }
  return matches[0];
}

export function createDnaConversionTagAdapter(
  ids: DnaConversionIds = {},
  lookup: DnaConversionLookup = defaultLookup,
  getDeclaration: DnaDeclarationLookup = noDeclaration,
  getActivationOrder: DnaActivationOrderLookup = defaultActivationOrder,
  isEffectNegated: DnaNegationLookup = neverNegated
) {
  const cardIds = { ...DNA_CONVERSION_CARD_IDS, ...ids };
  const configured = Object.entries(cardIds) as [DnaCardKey, string][];
  const configuredIds = configured.map(([, id]) => id);
  if (configured.length !== 2 || configured.some(([, id]) => !validId(id)) ||
      new Set(configuredIds).size !== configuredIds.length) {
    throw new Error('Identidades de DNA Surgery/Transplant inválidas.');
  }

  function getDnaConversion(
    input: DnaConversionState,
    targetUid: string
  ): DnaConversionResult {
    assertState(input);
    if (!validId(targetUid)) throw new Error('UID-alvo inválido.');
    const before = inventorySnapshot(input);
    const target = locateMonster(input.core, targetUid);

    if (!target || !target.monster.faceUp) {
      if (inventorySnapshot(input) !== before) {
        throw new Error('Consulta DNA alterou o inventário físico.');
      }
      return {
        targetUid,
        originalRace: 'UNKNOWN',
        originalAttribute: 'UNKNOWN',
        race: 'UNKNOWN',
        attribute: 'UNKNOWN',
        raceSourceUid: null,
        attributeSourceUid: null,
        activeSources: 0,
        sourceUids: [],
      };
    }

    const original = requiredOriginal(lookup, target.monster.id);
    const declarations: ActiveDeclaration[] = [];

    for (const player of input.core.players) {
      for (const source of player.backrow as Backrow[]) {
        if (!source.faceUp || source.resolved === false) continue;
        const key = configured.find(([, id]) => id === source.id)?.[0];
        if (!key || isEffectNegated(input.core, source.uid)) continue;

        const sourceInfo = lookup(source.id);
        if (!sourceInfo || sourceInfo.kind !== 'trap') {
          throw new Error('DNA source sem metadados de Armadilha: ' + source.id + '.');
        }

        const property: DnaProperty = key === 'DNA_SURGERY' ? 'race' : 'attribute';
        const value = getDeclaration(source.uid);
        if (!validateDeclaration(property, value)) {
          throw new Error('Declaração inválida para DNA ' + property + ' na fonte ' + source.uid + '.');
        }
        const activationOrder = getActivationOrder(source.uid);
        if (!Number.isSafeInteger(activationOrder) || (activationOrder as number) < 0) {
          throw new Error('Ordem de ativação ausente ou inválida para DNA ' + source.uid + '.');
        }
        declarations.push({
          uid: source.uid,
          property,
          value,
          activationOrder: activationOrder as number,
        });
      }
    }

    const raceSource = effectiveDeclaration('race', declarations);
    const attributeSource = effectiveDeclaration('attribute', declarations);
    const result: DnaConversionResult = {
      targetUid,
      originalRace: original.race,
      originalAttribute: original.attribute,
      race: raceSource?.value ?? original.race,
      attribute: attributeSource?.value ?? original.attribute,
      raceSourceUid: raceSource?.uid ?? null,
      attributeSourceUid: attributeSource?.uid ?? null,
      activeSources: declarations.length,
      sourceUids: declarations
        .slice()
        .sort((a, b) => a.activationOrder - b.activationOrder)
        .map(item => item.uid),
    };

    if (inventorySnapshot(input) !== before) {
      throw new Error('Consulta DNA alterou o inventário físico.');
    }
    return result;
  }

  return Object.freeze({
    cardIds: Object.freeze({ ...cardIds }),
    getDnaConversion,
  });
}
