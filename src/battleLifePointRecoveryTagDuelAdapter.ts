import type { TagDuel } from './tagDuel';
import { getPlayableCard } from './effectRegistry';
import {
  ABSORBING_KID_FROM_THE_SKY_CARD_ID,
  GUARDIAN_ANGEL_JOAN_CARD_ID,
  resolveAbsorbingKidFromTheSkyBattleGain,
  resolveGuardianAngelJoanBattleGain,
  type BattleDestination,
  type BattleLifePointRecoveryResult,
  type BattleRole,
} from './absorbingKidFromTheSky';

export interface TagBattleLifePointEvent {
  readonly eventId: string;
  readonly sourceUid: string;
  readonly sourceCardId: string;
  readonly sourceFaceUpWhenDestroying: boolean;
  readonly sourceControllerTeam: 0 | 1;
  readonly sourceBattleRole: BattleRole;
  readonly destroyedMonsterUid: string;
  readonly destroyerUid: string;
  readonly destroyedByBattle: boolean;
  readonly destination: BattleDestination;
}

export interface TagBattleLifePointRecovery {
  readonly eventId: string;
  readonly result: BattleLifePointRecoveryResult;
  readonly processedEventIds: string[];
}

type TagTeam = 0 | 1;
type PhysicalSeat = 0 | 1 | 2 | 3;
type Zone = 'deck' | 'hand' | 'monsters' | 'backrow' | 'grave' | 'extra' | 'banished' | 'field';

interface InventoryEntry {
  readonly uid: string;
  readonly id: string;
  readonly zone: Zone;
  readonly team: TagTeam;
}

function fail<T>(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function physicalSeatFromUid(uid: string): PhysicalSeat | null {
  const match = /^m([0-3]):/.exec(uid);
  return match ? (Number(match[1]) as PhysicalSeat) : null;
}

function inventoryEntries(game: TagDuel): InventoryEntry[] {
  const entries: InventoryEntry[] = [];
  for (const team of [0, 1] as const) {
    const player = game.core.players[team];
    for (const zone of ['deck', 'hand', 'monsters', 'backrow', 'grave', 'extra', 'banished'] as const) {
      for (const card of player[zone] ?? []) entries.push({ uid: card.uid, id: card.id, zone, team });
    }
    if (player.field) entries.push({ uid: player.field.uid, id: player.field.id, zone: 'field', team });
  }
  for (const [seatText, held] of Object.entries(game.reserves ?? {})) {
    const seat = Number(seatText);
    if (!Number.isInteger(seat) || seat < 0 || seat > 3) continue;
    const team = (seat % 2) as TagTeam;
    for (const zone of ['deck', 'hand', 'extra'] as const) {
      for (const card of held[zone] ?? []) entries.push({ uid: card.uid, id: card.id, zone, team });
    }
  }
  return entries;
}

function uniqueInventoryCard(entries: readonly InventoryEntry[], uid: string): InventoryEntry | null {
  const matches = entries.filter(entry => entry.uid === uid);
  return matches.length === 1 ? matches[0] : null;
}

function zoneMatchesDestination(zone: Zone, destination: BattleDestination): boolean {
  if (destination === 'graveyard') return zone === 'grave';
  if (destination === 'banished') return zone === 'banished';
  if (destination === 'hand') return zone === 'hand';
  if (destination === 'deck') return zone === 'deck';
  if (destination === 'extraDeck') return zone === 'extra';
  return zone === 'monsters' || zone === 'backrow' || zone === 'field';
}

function validateEvent(event: TagBattleLifePointEvent): string | undefined {
  if (!event || typeof event.eventId !== 'string' || !/^[A-Za-z0-9:_-]{1,120}$/.test(event.eventId)) return 'invalid-battle-event-id';
  if (typeof event.sourceUid !== 'string' || !event.sourceUid.trim() ||
      typeof event.destroyedMonsterUid !== 'string' || !event.destroyedMonsterUid.trim() ||
      typeof event.destroyerUid !== 'string' || !event.destroyerUid.trim()) return 'invalid-battle-event-uid';
  if (event.sourceUid === event.destroyedMonsterUid) return 'source-and-destroyed-monster-must-differ';
  if (event.sourceCardId !== ABSORBING_KID_FROM_THE_SKY_CARD_ID &&
      event.sourceCardId !== GUARDIAN_ANGEL_JOAN_CARD_ID) return 'unsupported-battle-lp-source-card';
  if (event.sourceControllerTeam !== 0 && event.sourceControllerTeam !== 1) return 'invalid-source-controller-team';
  if (typeof event.sourceFaceUpWhenDestroying !== 'boolean' || typeof event.destroyedByBattle !== 'boolean') {
    return 'invalid-battle-event-flags';
  }
  if (event.sourceBattleRole !== 'attacker' && event.sourceBattleRole !== 'defender') return 'invalid-source-battle-role';
  if (!['graveyard', 'banished', 'hand', 'deck', 'extraDeck', 'field'].includes(event.destination)) {
    return 'invalid-battle-destination';
  }
  return undefined;
}

/** Resolves an already-committed battle event; it never mutates the TagDuel state. */
export function resolveTagBattleLifePointRecovery(
  game: TagDuel,
  event: TagBattleLifePointEvent,
  processedEventIds: readonly string[] = [],
): { ok: true; value: TagBattleLifePointRecovery } | { ok: false; reason: string } {
  if (!game || game.mode !== 'tag-classic' || !game.core || !Array.isArray(game.core.players) ||
      game.core.players.length !== 2) return fail('classic-tag-duel-required');
  const eventIssue = validateEvent(event);
  if (eventIssue) return fail(eventIssue);
  if (!Array.isArray(processedEventIds) || processedEventIds.length > 4096 ||
      processedEventIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9:_-]{1,120}$/.test(id)) ||
      new Set(processedEventIds).size !== processedEventIds.length) return fail('invalid-processed-battle-event-ledger');
  if (processedEventIds.includes(event.eventId)) return fail('duplicate-battle-event');

  const entries = inventoryEntries(game);
  const source = uniqueInventoryCard(entries, event.sourceUid);
  if (!source || source.id !== event.sourceCardId) return fail('battle-source-not-found-or-identity-mismatch');
  const sourcePhysicalOwnerSeat = physicalSeatFromUid(source.uid);
  if (sourcePhysicalOwnerSeat === null) return fail('battle-source-without-physical-owner');
  if (source.zone === 'monsters' && source.team !== event.sourceControllerTeam) {
    return fail('source-controller-team-does-not-match-current-shared-field');
  }

  const destroyed = uniqueInventoryCard(entries, event.destroyedMonsterUid);
  if (!destroyed) return fail('destroyed-monster-not-found-or-duplicate-uid');
  const destroyedPhysicalOwnerSeat = physicalSeatFromUid(destroyed.uid);
  if (destroyedPhysicalOwnerSeat === null) return fail('destroyed-monster-without-physical-owner');
  if (!zoneMatchesDestination(destroyed.zone, event.destination)) return fail('destroyed-monster-destination-mismatch');
  if (event.destination === 'graveyard' && destroyed.team !== (destroyedPhysicalOwnerSeat % 2)) {
    return fail('destroyed-monster-not-in-physical-owner-team-graveyard');
  }

  const destroyedDefinition = getPlayableCard(destroyed.id);
  if (!destroyedDefinition || destroyedDefinition.kind !== 'monster') return fail('destroyed-monster-not-in-certified-catalog');
  const teamLifePoints: [number, number] = [game.core.players[0].lp, game.core.players[1].lp];
  const common = {
    sourceCardId: event.sourceCardId,
    sourceUid: event.sourceUid,
    sourcePhysicalOwnerSeat,
    sourceControllerTeam: event.sourceControllerTeam,
    sourceFaceUpWhenDestroying: event.sourceFaceUpWhenDestroying,
    sourceBattleRole: event.sourceBattleRole,
    destroyedMonsterUid: event.destroyedMonsterUid,
    destroyerUid: event.destroyerUid,
    destroyedByBattle: event.destroyedByBattle,
    destination: event.destination,
    teamLifePoints,
  };

  try {
    let result: BattleLifePointRecoveryResult;
    if (event.sourceCardId === ABSORBING_KID_FROM_THE_SKY_CARD_ID) {
      if (typeof destroyedDefinition.level !== 'number') return fail('destroyed-monster-level-unavailable');
      result = resolveAbsorbingKidFromTheSkyBattleGain({
        ...common,
        destroyedMonsterLevel: destroyedDefinition.level,
      });
    } else {
      if (typeof destroyedDefinition.atk !== 'number') return fail('destroyed-monster-original-atk-unavailable');
      result = resolveGuardianAngelJoanBattleGain({
        ...common,
        destroyedMonsterOriginalAtk: destroyedDefinition.atk,
      });
    }
    return {
      ok: true,
      value: {
        eventId: event.eventId,
        result,
        processedEventIds: [...processedEventIds, event.eventId],
      },
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'battle-life-point-recovery-invalid');
  }
}

export function battleLifePointRecoveryPublicSummary(): string {
  return 'Recuperação de LP por batalha processada; UIDs, mãos e identidades privadas não são exibidos publicamente.';
}
