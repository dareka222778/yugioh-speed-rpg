import type { Card } from './cardCatalog';
import type { Backrow, DuelState, Monster } from './duelEngine';
import { getDuelCard } from './effectRegistry';
import { RULES_PROFILE } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';

export const LUMINOUS_SPARK_ID = '81777047';
export const MYSTIC_PLASMA_ZONE_ID = '18161786';
export const ATTRIBUTE_FIELD_SPELL_ATK = 500;
export const ATTRIBUTE_FIELD_SPELL_DEF = -400;

type Team = 0 | 1;
type Attribute = string;
type LocatedMonster = { team: Team; index: number; monster: Monster };

export type AttributeFieldSpellState = TagDuel;
export type AttributeFieldSpellLookup =
  (id: string) => Pick<Card, 'kind' | 'field' | 'attribute'> | undefined;
export type FieldSpellNegationLookup = (state: DuelState, uid: string) => boolean;
export type AttributeFieldSpellIds = Readonly<{
  luminousSparkId?: string;
  mysticPlasmaZoneId?: string;
}>;
export type AttributeFieldSpellModifier = Readonly<{
  targetUid: string;
  attribute: Attribute;
  activeSources: number;
  atk: number;
  def: number;
  sourceUids: readonly string[];
}>;

const defaultLookup: AttributeFieldSpellLookup = id => getDuelCard(id);
const neverNegated: FieldSpellNegationLookup = () => false;
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

function assertPhysicalRules(state: AttributeFieldSpellState): void {
  for (let team = 0; team < 2; team++) {
    const player = state.core.players[team];
    if (player.monsters.length > RULES_PROFILE.monsterZones) {
      throw new Error('A equipe excedeu três Monster Zones.');
    }
    if (player.backrow.length > RULES_PROFILE.spellTrapZones) {
      throw new Error('A equipe excedeu três Spell/Trap Zones.');
    }
    // The Field Zone is deliberately separate from the three Spell/Trap Zones.
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

function assertState(state: AttributeFieldSpellState): void {
  if (!state || state.mode !== 'tag-classic' || !state.core ||
      !Array.isArray(state.core.players) || state.core.players.length !== 2 ||
      !Array.isArray(state.members) || state.members.length !== 4 ||
      !Array.isArray(state.active) || state.active.length !== 2 ||
      !state.core.teamRotation || !Number.isSafeInteger(state.core.turn) ||
      state.core.turn < 1 || !Array.isArray(state.core.chain)) {
    throw new Error('Estado TagDuel clássico inválido para Field Spells de atributo.');
  }
  assertTagDuel(state);
  assertPhysicalRules(state);
}

function inventorySnapshot(state: AttributeFieldSpellState): string {
  const cards = tagInventory(state);
  const uids = cards.map(card => card.uid);
  if (new Set(uids).size !== uids.length) {
    throw new Error('Inventário físico duplicado no estado TagDuel.');
  }
  return cards.map(card => card.uid + '=' + card.id).sort().join('|');
}

function requiredAttribute(lookup: AttributeFieldSpellLookup, id: string): Attribute {
  const info = lookup(id);
  if (!info || info.kind !== 'monster' ||
      typeof info.attribute !== 'string' || !info.attribute) {
    throw new Error('Atributo de monstro face-up indisponível para ' + id + '.');
  }
  return info.attribute;
}

export function createAttributeFieldSpellTagAdapter(
  ids: AttributeFieldSpellIds = {},
  lookup: AttributeFieldSpellLookup = defaultLookup,
  isEffectNegated: FieldSpellNegationLookup = neverNegated
) {
  const luminousSparkId = ids.luminousSparkId ?? LUMINOUS_SPARK_ID;
  const mysticPlasmaZoneId = ids.mysticPlasmaZoneId ?? MYSTIC_PLASMA_ZONE_ID;
  if (!validId(luminousSparkId) || !validId(mysticPlasmaZoneId) ||
      luminousSparkId === mysticPlasmaZoneId) {
    throw new Error('Identidades de Luminous Spark/Mystic Plasma Zone inválidas.');
  }

  function getAttributeModifier(
    input: AttributeFieldSpellState,
    targetUid: string
  ): AttributeFieldSpellModifier {
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
        attribute: 'UNKNOWN',
        activeSources: 0,
        atk: 0,
        def: 0,
        sourceUids: [],
      };
    }

    const attribute = requiredAttribute(lookup, target.monster.id);
    const sourceUids: string[] = [];

    // Each team has its own Field Zone. Both face-up Field Spells affect
    // every matching face-up monster on both sides of the shared field.
    for (const player of input.core.players) {
      const field = player.field as Backrow | null | undefined;
      if (!field || !field.faceUp || field.resolved === false) continue;

      const fieldAttribute = field.id === luminousSparkId
        ? 'LIGHT'
        : field.id === mysticPlasmaZoneId
          ? 'DARK'
          : undefined;
      if (!fieldAttribute) continue;

      const sourceInfo = lookup(field.id);
      if (!sourceInfo || sourceInfo.kind !== 'spell' || sourceInfo.field !== true) {
        throw new Error('Field Spell de atributo sem metadados de Campo: ' + field.id + '.');
      }
      if (fieldAttribute !== attribute || isEffectNegated(input.core, field.uid)) continue;
      sourceUids.push(field.uid);
    }

    const result: AttributeFieldSpellModifier = {
      targetUid,
      attribute,
      activeSources: sourceUids.length,
      atk: sourceUids.length * ATTRIBUTE_FIELD_SPELL_ATK,
      def: sourceUids.length * ATTRIBUTE_FIELD_SPELL_DEF,
      sourceUids,
    };

    if (inventorySnapshot(input) !== before) {
      throw new Error('Consulta de Field Spell alterou o inventário físico.');
    }
    return result;
  }

  return {
    luminousSparkId,
    mysticPlasmaZoneId,
    getAttributeModifier,
  };
}
