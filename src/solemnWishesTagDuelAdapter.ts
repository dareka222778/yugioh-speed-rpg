import type { TagDuel } from './tagDuel';
import { continuousTrapsNegated } from './continuousEffects';
import {
  SOLEMN_WISHES_CARD_ID,
  resolveSolemnWishesDrawGain,
  type SolemnWishesSnapshot,
  type SolemnWishesDrawGainResult,
} from './solemnWishesDrawGain';

type Team = 0 | 1;
type PhysicalSeat = 0 | 1 | 2 | 3;
type Zone = 'deck' | 'hand' | 'monsters' | 'backrow' | 'grave' | 'extra' | 'banished' | 'field';

interface InventoryEntry {
  readonly uid: string;
  readonly id: string;
  readonly zone: Zone;
  readonly team: Team;
}

export interface TagSolemnWishesDrawEvent {
  /** Stable identity of one already-committed draw event. */
  readonly eventId: string;
  /** Physical seat whose private Deck produced the drawn cards. */
  readonly drawingSeat: PhysicalSeat;
  readonly drawCount: number;
  /** UIDs captured by the trusted draw resolver; multiple cards remain one event. */
  readonly drawnCardUids: readonly string[];
  /** Per-copy chain-negation results captured by the trusted chain resolver. */
  readonly negatedSourceUids?: readonly string[];
}

export interface TagSolemnWishesDrawResolution {
  readonly eventId: string;
  readonly drawingSeat: PhysicalSeat;
  readonly result: SolemnWishesDrawGainResult;
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
      for (const card of player[zone] ?? []) entries.push({ uid: card.uid, id: card.id, zone, team });
    }
    if (player.field) entries.push({ uid: player.field.uid, id: player.field.id, zone: 'field', team });
  }
  for (const [seatText, held] of Object.entries(game.reserves ?? {})) {
    const seat = Number(seatText);
    if (!Number.isInteger(seat) || seat < 0 || seat > 3) continue;
    const team = (seat % 2) as Team;
    for (const zone of ['deck', 'hand', 'extra'] as const) {
      for (const card of held[zone] ?? []) entries.push({ uid: card.uid, id: card.id, zone, team });
    }
  }
  return entries;
}

/** Validate the live 2v2 shape without requiring Solemn Wishes to be admitted. */
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
      || !Array.isArray(player.grave)
      || (player.extra ?? []).length > 5
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

function validateDrawEvent(
  event: TagSolemnWishesDrawEvent,
  processedEventIds: readonly string[],
): string | undefined {
  if (!event || !validIdentifier(event.eventId)) return 'invalid-solemn-wishes-draw-event-id';
  if (!Number.isInteger(event.drawingSeat) || event.drawingSeat < 0 || event.drawingSeat > 3) {
    return 'invalid-drawing-physical-seat';
  }
  if (!Number.isSafeInteger(event.drawCount) || event.drawCount < 0 || event.drawCount > 30) {
    return 'invalid-draw-count';
  }
  if (!Array.isArray(event.drawnCardUids) || event.drawnCardUids.length !== event.drawCount
    || event.drawnCardUids.some(uid => !validIdentifier(uid))
    || new Set(event.drawnCardUids).size !== event.drawnCardUids.length) {
    return 'drawn-card-uids-do-not-match-draw-count';
  }
  if (!Array.isArray(processedEventIds) || processedEventIds.length > 4096
    || processedEventIds.some(id => !validIdentifier(id))
    || new Set(processedEventIds).size !== processedEventIds.length) {
    return 'invalid-solemn-wishes-event-ledger';
  }
  const negated = event.negatedSourceUids ?? [];
  if (!Array.isArray(negated) || negated.length > 6
    || negated.some(uid => !validIdentifier(uid))
    || new Set(negated).size !== negated.length) {
    return 'invalid-solemn-wishes-negation-snapshot';
  }
  return undefined;
}

/**
 * Resolve one already-committed physical draw event against the current shared
 * backrow. The drawing seat is explicit because card effects can make either
 * teammate draw; the team is derived from that physical seat. The adapter
 * returns the M406 LP-gain event contract unchanged so a trusted caller can
 * pass it to the M403 Fire Princess consumer after atomically committing LP.
 *
 * This function is read-only. The caller must atomically commit the returned
 * shared LP tuple and event ledger. The draw event's UIDs are checked against
 * the four-seat physical inventory, but the trusted resolver remains the
 * authority that says those cards were actually drawn.
 */
export function resolveTagSolemnWishesDrawGain(
  game: TagDuel,
  event: TagSolemnWishesDrawEvent,
  processedEventIds: readonly string[] = [],
): { ok: true; value: TagSolemnWishesDrawResolution } | { ok: false; reason: string } {
  try {
    if (!game || game.mode !== 'tag-classic') return fail('classic-tag-duel-required');
    const shapeIssue = validateTagDuelShape(game);
    if (shapeIssue) return fail(shapeIssue);
    const eventIssue = validateDrawEvent(event, processedEventIds);
    if (eventIssue) return fail(eventIssue);

    const entries = inventoryEntries(game);
    for (const uid of event.drawnCardUids) {
      const matches = entries.filter(entry => entry.uid === uid);
      if (matches.length !== 1) return fail('drawn-card-uid-is-not-unique-in-physical-inventory');
      if (physicalSeatFromUid(uid) !== event.drawingSeat) {
        return fail('drawn-card-uid-does-not-belong-to-drawing-seat');
      }
    }

    const negatedSourceUids = new Set(event.negatedSourceUids ?? []);
    const fieldUids = new Set<string>();
    const snapshots: SolemnWishesSnapshot[] = [];
    const allTrapEffectsNegated = continuousTrapsNegated(game.core);

    for (const [controllerTeam, player] of game.core.players.entries()) {
      for (const card of player.backrow) {
        if (card.id !== SOLEMN_WISHES_CARD_ID) continue;
        if (typeof card.faceUp !== 'boolean') return fail('solemn-wishes-has-invalid-visibility');
        const matches = entries.filter(entry => entry.uid === card.uid);
        if (matches.length !== 1 || matches[0].id !== SOLEMN_WISHES_CARD_ID || matches[0].zone !== 'backrow') {
          return fail('solemn-wishes-physical-identity-is-not-unique');
        }
        const physicalOwnerSeat = physicalSeatFromUid(card.uid);
        if (physicalOwnerSeat === null) return fail('solemn-wishes-has-no-physical-owner-uid');
        fieldUids.add(card.uid);
        snapshots.push({
          uid: card.uid,
          cardId: card.id,
          physicalOwnerSeat,
          controllerTeam: controllerTeam as Team,
          zone: 'backrow',
          faceUp: card.faceUp,
          effectNegated: allTrapEffectsNegated || negatedSourceUids.has(card.uid),
        });
      }
    }

    for (const uid of negatedSourceUids) {
      if (!fieldUids.has(uid)) return fail('negated-source-uid-is-not-a-current-solemn-wishes');
    }

    const teamLifePointsBefore: [number, number] = [
      game.core.players[0].lp,
      game.core.players[1].lp,
    ];
    const drawingTeam = (event.drawingSeat % 2) as Team;
    const result = resolveSolemnWishesDrawGain({
      eventId: event.eventId,
      drawingTeam,
      drawCount: event.drawCount,
      teamLifePointsBefore,
      solemnWishes: snapshots,
      processedEventIds,
    });

    return {
      ok: true,
      value: {
        eventId: event.eventId,
        drawingSeat: event.drawingSeat,
        result,
        processedEventIds: processedEventIds.includes(event.eventId)
          ? [...processedEventIds]
          : [...processedEventIds, event.eventId],
      },
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'solemn-wishes-tag-duel-resolution-invalid');
  }
}

export function solemnWishesTagDuelPublicSummary(): string {
  return 'Solemn Wishes: 500 LP por evento de compra e por cópia elegível; UIDs, mãos privadas e identidades físicas não são exibidos publicamente.';
}
