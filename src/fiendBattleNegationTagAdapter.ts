import type { TagDuel } from './tagDuel';
import { assertTagDuel, tagInventory } from './tagDuel';
import { getDuelCard } from './effectRegistry';
import { getMonsterEffect } from './monsterEffects';
import { monsterEffectsNegated } from './continuousEffects';
import { RULES_PROFILE } from './rulesProfile';

export const DARK_RULER_HA_DES_ID = '53982768';
export const DARK_BALTER_THE_TERRIBLE_ID = '80071763';

type Team = 0 | 1;
type AdapterIds = {
  darkRulerHaDesId?: string;
  darkBalterId?: string;
};

export type BattleEffectNegationEvent = {
  attackerUid: string;
  attackerCardId: string;
  attackerTeam: Team;
  attackerWasFaceUp: boolean;
  attackerEffectWasNegated?: boolean;
  destroyedUid: string;
  destroyedCardId: string;
  targetTeam: Team;
  destroyedByBattle: boolean;
};

export type BattleEffectNegation = {
  negatedEffectUid: string;
  sources: Array<'dark-ruler-ha-des' | 'dark-balter-the-terrible'>;
};

function adapterIds(ids: AdapterIds = {}) {
  return {
    darkRulerHaDesId: ids.darkRulerHaDesId ?? DARK_RULER_HA_DES_ID,
    darkBalterId: ids.darkBalterId ?? DARK_BALTER_THE_TERRIBLE_ID,
  };
}

function validTeam(team: number): team is Team {
  return team === 0 || team === 1;
}

function physicalSeat(uid: string): number {
  const match = /^m([0-3]):/.exec(uid);
  if (!match) throw new Error('UID físico 2v2 inválido: ' + uid);
  return Number(match[1]);
}

function assertClassic(duel: TagDuel): void {
  if (!duel || duel.mode !== 'tag-classic') throw new Error('O adapter exige TagDuel clássico.');
  assertTagDuel(duel);
  if (!duel.core.teamRotation || duel.core.players.length !== 2 ||
      duel.members.length !== 4 || duel.active.length !== 2 ||
      !Array.isArray(duel.core.chain)) {
    throw new Error('Estrutura física TagDuel incompleta.');
  }
}

function assertPhysicalRules(duel: TagDuel): void {
  assertClassic(duel);
  for (let team = 0; team < 2; team++) {
    const player = duel.core.players[team];
    if (player.monsters.length > RULES_PROFILE.monsterZones) throw new Error('A equipe excedeu três Monster Zones.');
    if (player.backrow.length > RULES_PROFILE.spellTrapZones) throw new Error('A equipe excedeu três Spell/Trap Zones.');
  }
  const mainCounts = [0, 0, 0, 0];
  const extraCounts = [0, 0, 0, 0];
  for (const card of tagInventory(duel).filter(card => card.entityKind !== 'token')) {
    const match = /^m([0-3]):/.exec(card.uid);
    if (!match) throw new Error('UID físico 2v2 inválido: ' + card.uid);
    const seat = Number(match[1]);
    if (duel.members[seat]?.team !== seat % 2) throw new Error('Proprietário físico incompatível com o UID.');
    const info = getDuelCard(card.id);
    if (!info) throw new Error('Carta física sem metadados jogáveis: ' + card.id);
    if (info.fusion) extraCounts[seat]++;
    else mainCounts[seat]++;
  }
  for (let seat = 0; seat < 4; seat++) {
    if (mainCounts[seat] < RULES_PROFILE.mainDeckMin || mainCounts[seat] > RULES_PROFILE.mainDeckMax) {
      throw new Error('Deck Principal físico fora de 20–30 no assento ' + seat + '.');
    }
    if (extraCounts[seat] > RULES_PROFILE.extraDeckMax) {
      throw new Error('Deck Adicional excedeu cinco cartas no assento ' + seat + '.');
    }
  }
}

/** Both classic Fiend bosses suppress the effect of an Effect Monster they
 * destroy by battle. Ha Des extends this to any Fiend controlled by its team;
 * Dark Balter applies only when it is the attacking monster. */
export function battleDestroyedEffectNegation(
  duel: TagDuel,
  event: BattleEffectNegationEvent,
  ids: AdapterIds = {},
): BattleEffectNegation | null {
  assertPhysicalRules(duel);
  if (!event || !validTeam(event.attackerTeam) || !validTeam(event.targetTeam) ||
      event.attackerTeam === event.targetTeam || !event.destroyedByBattle ||
      !event.attackerWasFaceUp || event.attackerEffectWasNegated === true ||
      typeof event.attackerUid !== 'string' || typeof event.attackerCardId !== 'string' ||
      typeof event.destroyedUid !== 'string' || typeof event.destroyedCardId !== 'string') return null;

  const inventory = tagInventory(duel);
  if (!inventory.some(card => card.uid === event.attackerUid && card.id === event.attackerCardId) ||
      !inventory.some(card => card.uid === event.destroyedUid && card.id === event.destroyedCardId)) return null;
  if (!getMonsterEffect(event.destroyedCardId)) return null;

  const { darkRulerHaDesId, darkBalterId } = adapterIds(ids);
  const haDesActive = duel.core.players[event.attackerTeam].monsters.some(monster =>
    monster.id === darkRulerHaDesId && monster.faceUp &&
    !monsterEffectsNegated(duel.core, monster.uid)
  );
  const attackerIsFiend = getDuelCard(event.attackerCardId)?.race === 'Fiend';
  const sources: BattleEffectNegation['sources'] = [];
  if (haDesActive && attackerIsFiend) sources.push('dark-ruler-ha-des');
  if (event.attackerCardId === darkBalterId) sources.push('dark-balter-the-terrible');
  return sources.length ? { negatedEffectUid: event.destroyedUid, sources } : null;
}

/** Dark Ruler Ha Des has an inherent GY Special Summon restriction; it is
 * not an activated effect and therefore cannot be switched off by negation. */
export function haDesSpecialSummonFromGraveBlocked(
  cardId: string,
  ids: AdapterIds = {},
): boolean {
  return cardId === adapterIds(ids).darkRulerHaDesId;
}
