import type { TagDuel } from './tagDuel';
import { monsterEffectsNegated } from './continuousEffects';
import {
  FIRE_PRINCESS_CARD_ID,
  resolveFirePrincessLpGain,
  type FirePrincessLpGainResult,
  type FirePrincessSnapshot,
} from './firePrincessLpGain';

type Team = 0 | 1;
type PhysicalSeat = 0 | 1 | 2 | 3;
type Zone = 'deck' | 'hand' | 'monsters' | 'backrow' | 'grave' | 'extra' | 'banished' | 'field';

interface InventoryEntry {
  readonly uid: string;
  readonly id: string;
  readonly zone: Zone;
  readonly team: Team;
}

export interface TagFirePrincessLpGainEvent {
  /** Stable ID of the already-committed LP gain event. */
  readonly eventId: string;
  readonly gainingTeam: Team;
  readonly lpGained: number;
  /** LP totals immediately after the gain and before Fire Princess damage. */
  readonly teamLifePointsAfterGain: readonly [number, number];
  /** Per-copy chain-negation results captured by the trusted chain resolver. */
  readonly negatedSourceUids?: readonly string[];
}

export interface TagFirePrincessLpGainResolution {
  readonly eventId: string;
  readonly result: FirePrincessLpGainResult;
  readonly processedEventIds: string[];
}

function fail<T = never>(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function validIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(value);
}

function physicalSeatFromUid(uid: string): PhysicalSeat | null {
  const match = /^m([0-3]):/.exec(uid);
  return match ? Number(match[1]) as PhysicalSeat : null;
}

function inventoryEntries(game: TagDuel): InventoryEntry[] {
  const entries: InventoryEntry[] = [];
  for (const team of [0, 1] as const) {
    const player = game.core.players[team];
    for (const zone of ['deck', 'hand', 'monsters', 'backrow', 'grave', 'extra', 'banished'] as const) {
      for (const card of player[zone] ?? []) {
        entries.push({ uid: card.uid, id: card.id, zone, team });
      }
    }
    if (player.field) entries.push({ uid: player.field.uid, id: player.field.id, zone: 'field', team });
  }
  for (const [seatText, held] of Object.entries(game.reserves ?? {})) {
    const seat = Number(seatText);
    if (!Number.isInteger(seat) || seat < 0 || seat > 3) continue;
    const team = (seat % 2) as Team;
    for (const zone of ['deck', 'hand', 'extra'] as const) {
      for (const card of held[zone] ?? []) {
        entries.push({ uid: card.uid, id: card.id, zone, team });
      }
    }
  }
  return entries;
}

/** Validate the 2v2 shape without admitting or certifying Fire Princess. */
function validateTagDuelShape(game: TagDuel): string | undefined {
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
      || !Array.isArray(player.deck) || player.deck.length > 30
      || !Array.isArray(player.hand)
      || !Array.isArray(player.monsters) || player.monsters.length > 3
      || !Array.isArray(player.backrow) || player.backrow.length > 3
      || !Array.isArray(player.grave) || (player.extra ?? []).length > 5
      || !Array.isArray(player.banished)
      || !Number.isSafeInteger(player.lp) || player.lp < 0)
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
      || !held || !Array.isArray(held.deck) || held.deck.length > 30
      || !Array.isArray(held.hand) || !Array.isArray(held.extra) || held.extra.length > 5;
  })) return 'invalid-tag-duel-private-reserves';

  const inventory = inventoryEntries(game);
  if (inventory.some(card => typeof card.uid !== 'string' || !card.uid
    || typeof card.id !== 'string' || !card.id)
    || new Set(inventory.map(card => card.uid)).size !== inventory.length) {
    return 'tag-duel-physical-inventory-is-not-unique';
  }
  return undefined;
}

function validateEventEnvelope(
  event: TagFirePrincessLpGainEvent,
  processedEventIds: readonly string[],
): string | undefined {
  if (!event || !validIdentifier(event.eventId)) return 'invalid-lp-gain-event-id';
  if (event.gainingTeam !== 0 && event.gainingTeam !== 1) return 'invalid-lp-gain-team';
  if (!Number.isSafeInteger(event.lpGained) || event.lpGained < 0) return 'invalid-lp-gain-amount';
  if (!Array.isArray(event.teamLifePointsAfterGain) || event.teamLifePointsAfterGain.length !== 2
    || event.teamLifePointsAfterGain.some(lp => !Number.isSafeInteger(lp) || lp < 0)) {
    return 'invalid-team-life-point-snapshot';
  }
  if (!Array.isArray(processedEventIds) || processedEventIds.length > 4096
    || processedEventIds.some(id => !validIdentifier(id))
    || new Set(processedEventIds).size !== processedEventIds.length) {
    return 'invalid-fire-princess-event-ledger';
  }
  const negated = event.negatedSourceUids ?? [];
  if (!Array.isArray(negated) || negated.length > 120
    || negated.some(uid => !validIdentifier(uid))
    || new Set(negated).size !== negated.length) {
    return 'invalid-fire-princess-negation-snapshot';
  }
  return undefined;
}

/**
 * Resolve Fire Princess after a trusted LP-gain event has already been
 * committed to the shared team LP. This adapter reads the real TagDuel field,
 * derives physical owners from stable UIDs, and delegates fixed 500 damage
 * per eligible copy to the M403 primitive.
 *
 * The function is read-only. The caller must atomically commit the returned
 * shared LP tuple and processed-event ledger. Retries are safe even after the
 * damage was committed: duplicate IDs return the current LP tuple unchanged.
 */
export function resolveTagFirePrincessLpGain(
  game: TagDuel,
  event: TagFirePrincessLpGainEvent,
  processedEventIds: readonly string[] = [],
): { ok: true; value: TagFirePrincessLpGainResolution } | { ok: false; reason: string } {
  try {
    if (!game || game.mode !== 'tag-classic') return fail('classic-tag-duel-required');
    const shapeIssue = validateTagDuelShape(game);
    if (shapeIssue) return fail(shapeIssue);
    const eventIssue = validateEventEnvelope(event, processedEventIds);
    if (eventIssue) return fail(eventIssue);

    const currentLifePoints: [number, number] = [
      game.core.players[0].lp,
      game.core.players[1].lp,
    ];

    // A committed retry must not be rejected because the game now contains
    // the post-damage LP tuple rather than the original post-gain snapshot.
    if (processedEventIds.includes(event.eventId)) {
      const duplicate = resolveFirePrincessLpGain({
        eventId: event.eventId,
        gainingTeam: event.gainingTeam,
        opposingTeam: (1 - event.gainingTeam) as Team,
        lpGained: event.lpGained,
        teamLifePointsAfterGain: currentLifePoints,
        firePrincesses: [],
        processedEventIds,
      });
      return {
        ok: true,
        value: { eventId: event.eventId, result: duplicate, processedEventIds: [...processedEventIds] },
      };
    }

    if (event.teamLifePointsAfterGain[0] !== currentLifePoints[0]
      || event.teamLifePointsAfterGain[1] !== currentLifePoints[1]) {
      return fail('lp-gain-event-snapshot-does-not-match-current-tag-duel');
    }

    const entries = inventoryEntries(game);
    const fieldUids = new Set<string>();
    const snapshots: FirePrincessSnapshot[] = [];
    const negatedSourceUids = new Set(event.negatedSourceUids ?? []);

    for (const [controllerTeam, player] of game.core.players.entries()) {
      for (const monster of player.monsters) {
        if (monster.id !== FIRE_PRINCESS_CARD_ID) continue;
        if (typeof monster.faceUp !== 'boolean'
          || (monster.position !== 'atk' && monster.position !== 'def')) {
          return fail('fire-princess-has-invalid-field-state');
        }
        const matches = entries.filter(entry => entry.uid === monster.uid);
        if (matches.length !== 1 || matches[0].id !== FIRE_PRINCESS_CARD_ID || matches[0].zone !== 'monsters') {
          return fail('fire-princess-physical-identity-is-not-unique');
        }
        const physicalOwnerSeat = physicalSeatFromUid(monster.uid);
        if (physicalOwnerSeat === null) return fail('fire-princess-has-no-physical-owner-uid');
        fieldUids.add(monster.uid);
        snapshots.push({
          uid: monster.uid,
          cardId: monster.id,
          physicalOwnerSeat,
          controllerTeam: controllerTeam as Team,
          zone: 'monster',
          faceUp: monster.faceUp,
          effectNegated: negatedSourceUids.has(monster.uid) || monsterEffectsNegated(game.core, monster.uid),
        });
      }
    }

    for (const uid of negatedSourceUids) {
      if (!fieldUids.has(uid)) return fail('negated-source-uid-is-not-a-current-fire-princess');
    }

    const result = resolveFirePrincessLpGain({
      eventId: event.eventId,
      gainingTeam: event.gainingTeam,
      opposingTeam: (1 - event.gainingTeam) as Team,
      lpGained: event.lpGained,
      teamLifePointsAfterGain: currentLifePoints,
      firePrincesses: snapshots,
      processedEventIds,
    });

    return {
      ok: true,
      value: {
        eventId: event.eventId,
        result,
        processedEventIds: [...processedEventIds, event.eventId],
      },
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'fire-princess-tag-duel-resolution-invalid');
  }
}

export function firePrincessTagDuelPublicSummary(): string {
  return 'Fire Princess: dano de 500 LP por cópia após ganho real de LP; identidades físicas, UIDs e mãos privadas não são exibidos publicamente.';
}
