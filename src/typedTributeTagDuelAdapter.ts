import type { TagDuel } from './tagDuel';
import { tagInventory } from './tagDuel';
import { engineCard } from './effectRegistry';
import {
  ANTI_AIRCRAFT_FLOWER_CARD_ID,
  ARCANE_ARCHER_OF_THE_FOREST_CARD_ID,
  eligibleTypedTributeUids,
  resolveAntiAircraftFlower,
  arcaneArcherAttackRestriction,
  resolveArcaneArcherOfTheForest,
  type TypedTributeSource,
  type FieldMonster,
  type FieldSpellTrap,
  type AntiAircraftFlowerResult,
  type ArcaneArcherResult,
  type ArcaneArcherAttackRestriction,
} from './typedTributeEffects';

type Team = 0 | 1;
type PhysicalSeat = 0 | 1 | 2 | 3;

export interface TagTypedTributeAction {
  readonly actionId: string;
  readonly turnNumber: number;
  readonly sourceUid: string;
  readonly sourcePhysicalOwnerSeat: PhysicalSeat;
  readonly sourceControllerTeam: Team;
  readonly selectedTributeUid: string;
  readonly processedActionIds: string[];
  readonly result: AntiAircraftFlowerResult;
}

export interface TagArcaneArcherActivation {
  readonly actionId: string;
  readonly turnNumber: number;
  readonly sourceUid: string;
  readonly sourcePhysicalOwnerSeat: PhysicalSeat;
  readonly sourceControllerTeam: Team;
  readonly source: TypedTributeSource;
  readonly fieldMonstersAtActivation: FieldMonster[];
  readonly fieldCardsAtActivation: FieldSpellTrap[];
  readonly selectedTributeUid: string;
  readonly selectedTargetUid: string;
  readonly processedActionIds: string[];
}

export interface TagArcaneArcherResolution {
  readonly actionId: string;
  readonly processedActionIds: string[];
  readonly result: ArcaneArcherResult;
}

function fail<T>(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function physicalSeatFromUid(uid: string): PhysicalSeat | null {
  const match = /^m([0-3]):/.exec(uid);
  return match ? Number(match[1]) as PhysicalSeat : null;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(value);
}

function validateTagDuel(game: TagDuel): string | undefined {
  if (!game || game.version !== 1 || game.mode !== 'tag-classic') return 'classic-tag-duel-required';
  if (
    !Array.isArray(game.members) || game.members.length !== 4
    || game.members.some((member, index) => !member || !member.id || member.team !== index % 2)
    || new Set(game.members.map(member => member.id)).size !== 4
    || !Array.isArray(game.active) || game.active.length !== 2
    || !Number.isInteger(game.cursor) || game.cursor < 0 || game.cursor > 3
    || game.active[0] % 2 !== 0 || game.active[1] % 2 !== 1
    || game.active[game.cursor % 2] !== game.cursor
  ) return 'invalid-tag-duel-seats';
  if (
    !game.core || !Array.isArray(game.core.players) || game.core.players.length !== 2
    || game.core.players.some((player, team) => !player || player.id !== 'tag-team-' + team
      || !Array.isArray(player.monsters) || !Array.isArray(player.backrow)
      || !Array.isArray(player.grave) || (player.extra ?? []).length > 5
      || player.monsters.length > 3 || player.backrow.length > 3)
    || game.core.current !== game.cursor % 2
    || !game.core.teamRotation || game.core.teamRotation.version !== 1
    || game.core.teamRotation.cursor !== game.cursor
    || JSON.stringify([game.active, game.cursor, game.reserves])
      !== JSON.stringify([game.core.teamRotation.active, game.core.teamRotation.cursor, game.core.teamRotation.reserves])
  ) return 'invalid-tag-duel-core-or-zone-capacity';
  const reserveSeats = Object.keys(game.reserves ?? {});
  if (reserveSeats.length !== 2 || reserveSeats.some(key => {
    const seat = Number(key);
    const held = game.reserves[key];
    return !/^[0-3]$/.test(key) || game.active.includes(seat)
      || !held || !Array.isArray(held.deck) || !Array.isArray(held.hand)
      || !Array.isArray(held.extra) || held.extra.length > 5;
  })) return 'invalid-tag-duel-private-reserves';
  const inventory = tagInventory(game);
  if (!Array.isArray(inventory) || inventory.some(card => !card || typeof card.uid !== 'string' || !card.uid)
    || new Set(inventory.map(card => card.uid)).size !== inventory.length) {
    return 'tag-duel-physical-inventory-is-not-unique';
  }
  return undefined;
}

function cardType(id: string): string | undefined {
  if (id === ANTI_AIRCRAFT_FLOWER_CARD_ID) return 'Plant';
  if (id === ARCANE_ARCHER_OF_THE_FOREST_CARD_ID) return 'Warrior';
  return engineCard(id)?.monsterType;
}

function fieldMonsters(game: TagDuel): FieldMonster[] {
  const result: FieldMonster[] = [];
  for (const [controllerTeam, player] of game.core.players.entries()) {
    for (const [zoneIndex, monster] of player.monsters.entries()) {
      const physicalOwnerSeat = physicalSeatFromUid(monster.uid);
      const monsterType = cardType(monster.id);
      if (physicalOwnerSeat === null) throw new Error('field monster has no physical-owner UID.');
      if (!monsterType) throw new Error('monster Type is unavailable in card metadata: ' + monster.id);
      result.push({
        uid: monster.uid,
        cardId: monster.id,
        physicalOwnerSeat,
        physicalOwnerTeam: physicalOwnerSeat % 2 as Team,
        controllerTeam: controllerTeam as Team,
        monsterType,
        zoneIndex,
        faceUp: monster.faceUp,
      });
    }
  }
  return result;
}

function fieldSpellTraps(game: TagDuel): FieldSpellTrap[] {
  const result: FieldSpellTrap[] = [];
  for (const [controllerTeam, player] of game.core.players.entries()) {
    for (const [zoneIndex, card] of player.backrow.entries()) {
      const physicalOwnerSeat = physicalSeatFromUid(card.uid);
      const cardKind = engineCard(card.id)?.kind;
      if (physicalOwnerSeat === null) throw new Error('Spell/Trap has no physical-owner UID.');
      if (cardKind !== 'spell' && cardKind !== 'trap') {
        throw new Error('Spell/Trap identity is unavailable in card metadata: ' + card.id);
      }
      result.push({
        uid: card.uid,
        cardId: card.id,
        physicalOwnerSeat,
        physicalOwnerTeam: physicalOwnerSeat % 2 as Team,
        controllerTeam: controllerTeam as Team,
        cardKind,
        zone: 'spellTrap',
        zoneIndex,
        faceUp: card.faceUp,
      });
    }
    if (player.field) {
      const card = player.field;
      const physicalOwnerSeat = physicalSeatFromUid(card.uid);
      const cardKind = engineCard(card.id)?.kind;
      if (physicalOwnerSeat === null) throw new Error('Field Spell has no physical-owner UID.');
      if (cardKind !== 'spell') throw new Error('Field Zone identity is not a Spell.');
      result.push({
        uid: card.uid,
        cardId: card.id,
        physicalOwnerSeat,
        physicalOwnerTeam: physicalOwnerSeat % 2 as Team,
        controllerTeam: controllerTeam as Team,
        cardKind: 'spell',
        zone: 'field',
        zoneIndex: 0,
        faceUp: card.faceUp,
      });
    }
  }
  return result;
}

function sourceSnapshot(
  game: TagDuel,
  sourceUid: string,
  expectedCardId: string,
  monsters: readonly FieldMonster[],
): TypedTributeSource {
  if (!validId(sourceUid)) throw new Error('invalid source UID.');
  const source = monsters.find(monster => monster.uid === sourceUid);
  if (!source || source.cardId !== expectedCardId) throw new Error('typed Tribute source is not on the shared field.');
  if (!source.faceUp) throw new Error('typed Tribute ignition source must be face-up at activation.');
  if (source.controllerTeam !== game.core.current || game.active[source.controllerTeam] !== game.cursor) {
    throw new Error('only the active physical representative may activate this effect.');
  }
  return {
    cardId: source.cardId,
    uid: source.uid,
    physicalOwnerSeat: source.physicalOwnerSeat,
    physicalOwnerTeam: source.physicalOwnerTeam,
    controllerTeam: source.controllerTeam,
    faceUpAtActivation: source.faceUp,
  };
}

function nextActionLedger(
  actionId: string,
  processedActionIds: readonly string[],
): string[] {
  if (!validId(actionId)) throw new Error('invalid typed Tribute action ID.');
  if (!Array.isArray(processedActionIds) || processedActionIds.length > 4096
    || processedActionIds.some(id => !validId(id))
    || new Set(processedActionIds).size !== processedActionIds.length) {
    throw new Error('invalid typed Tribute action ledger.');
  }
  if (processedActionIds.includes(actionId)) throw new Error('duplicate typed Tribute action.');
  return [...processedActionIds, actionId];
}

/** Plan Anti-Aircraft Flower's typed Tribute and 800 shared-team LP damage. */
export function planTagAntiAircraftFlower(
  game: TagDuel,
  actionId: string,
  sourceUid: string,
  selectedTributeUid: string,
  processedActionIds: readonly string[] = [],
): { ok: true; value: TagTypedTributeAction } | { ok: false; reason: string } {
  try {
    const issue = validateTagDuel(game);
    if (issue) return fail(issue);
    const processed = nextActionLedger(actionId, processedActionIds);
    const monsters = fieldMonsters(game);
    const source = sourceSnapshot(game, sourceUid, ANTI_AIRCRAFT_FLOWER_CARD_ID, monsters);
    const result = resolveAntiAircraftFlower({
      source,
      fieldMonstersAtActivation: monsters.filter(monster => monster.faceUp),
      selectedTributeUid,
    });
    return {
      ok: true,
      value: {
        actionId,
        turnNumber: game.core.turn,
        sourceUid,
        sourcePhysicalOwnerSeat: source.physicalOwnerSeat as PhysicalSeat,
        sourceControllerTeam: source.controllerTeam,
        selectedTributeUid,
        processedActionIds: processed,
        result,
      },
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'anti-aircraft-flower-tag-plan-invalid');
  }
}

/** Capture Arcane Archer's activation-time source, Tribute and exact target binding. */
export function captureTagArcaneArcherActivation(
  game: TagDuel,
  actionId: string,
  sourceUid: string,
  selectedTributeUid: string,
  selectedTargetUid: string,
  processedActionIds: readonly string[] = [],
): { ok: true; value: TagArcaneArcherActivation } | { ok: false; reason: string } {
  try {
    const issue = validateTagDuel(game);
    if (issue) return fail(issue);
    const processed = nextActionLedger(actionId, processedActionIds);
    const monsters = fieldMonsters(game);
    const cards = fieldSpellTraps(game);
    const source = sourceSnapshot(game, sourceUid, ARCANE_ARCHER_OF_THE_FOREST_CARD_ID, monsters);
    const faceUpMonsters = monsters.filter(monster => monster.faceUp);
    if (!eligibleTypedTributeUids(faceUpMonsters, source.controllerTeam, 'Plant').includes(selectedTributeUid)) {
      return fail('selected Tribute must be one controlled Plant monster.');
    }
    if (!cards.some(card => card.uid === selectedTargetUid)) {
      return fail('Arcane Archer target is not on the field at activation.');
    }
    return {
      ok: true,
      value: {
        actionId,
        turnNumber: game.core.turn,
        sourceUid,
        sourcePhysicalOwnerSeat: source.physicalOwnerSeat as PhysicalSeat,
        sourceControllerTeam: source.controllerTeam,
        source,
        fieldMonstersAtActivation: faceUpMonsters,
        fieldCardsAtActivation: cards,
        selectedTributeUid,
        selectedTargetUid,
        processedActionIds: processed,
      },
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'arcane-archer-tag-activation-invalid');
  }
}

/** Resolve against the current shared backrow/Field Zone; a departed target is not replaced. */
export function resolveTagArcaneArcher(
  game: TagDuel,
  activation: TagArcaneArcherActivation,
): { ok: true; value: TagArcaneArcherResolution } | { ok: false; reason: string } {
  try {
    const issue = validateTagDuel(game);
    if (issue) return fail(issue);
    if (!activation || !validId(activation.actionId)
      || !activation.processedActionIds.includes(activation.actionId)
      || activation.turnNumber !== game.core.turn
      || activation.sourceControllerTeam !== game.core.current
      || game.active[activation.sourceControllerTeam] !== game.cursor) {
      return fail('Arcane Archer activation no longer matches the active physical turn.');
    }
    const result = resolveArcaneArcherOfTheForest({
      source: activation.source,
      fieldMonstersAtActivation: activation.fieldMonstersAtActivation,
      fieldCardsAtActivation: activation.fieldCardsAtActivation,
      selectedTributeUid: activation.selectedTributeUid,
      selectedTargetUid: activation.selectedTargetUid,
      fieldCardsAtResolution: fieldSpellTraps(game),
    });
    return {
      ok: true,
      value: { actionId: activation.actionId, processedActionIds: [...activation.processedActionIds], result },
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'arcane-archer-tag-resolution-invalid');
  }
}

/** Boolean-only public-safe attack restriction; no hidden Plant UID is returned. */
export function tagArcaneArcherAttackRestriction(
  game: TagDuel,
  sourceUid: string,
): { ok: true; value: ArcaneArcherAttackRestriction } | { ok: false; reason: string } {
  try {
    const issue = validateTagDuel(game);
    if (issue) return fail(issue);
    const monsters = fieldMonsters(game);
    const source = monsters.find(monster => monster.uid === sourceUid);
    if (!source || source.cardId !== ARCANE_ARCHER_OF_THE_FOREST_CARD_ID) {
      return fail('Arcane Archer source is not present in the Monster Zones.');
    }
    if (!source.faceUp) {
      return { ok: true, value: { cannotBeAttacked: false, reason: 'source-face-down' } };
    }
    return { ok: true, value: arcaneArcherAttackRestriction(sourceUid, monsters.filter(monster => monster.faceUp)) };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'arcane-archer-tag-restriction-invalid');
  }
}

export function typedTributeTagDuelPublicSummary(): string {
  return 'Tributo tipado 2v2 validado; UIDs, mãos e identidades privadas não são exibidos publicamente.';
}
