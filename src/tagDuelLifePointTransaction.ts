import type { TagDuel } from './tagDuel';

type Team = 0 | 1;

export interface TagDuelLifePointTransition {
  readonly eventId: string;
  /** Exact shared LP tuple observed immediately before the source event commits. */
  readonly teamLifePointsBefore: readonly [number, number];
  /** Exact shared LP tuple proposed by the already-resolved source adapter. */
  readonly teamLifePointsAfter: readonly [number, number];
}

export interface TagDuelLifePointCommitPlan {
  readonly eventId: string;
  readonly status: 'ready' | 'duplicate-event';
  readonly teamLifePointsBefore: [number, number];
  readonly teamLifePointsAfter: [number, number];
  /** Persist this list in the same transaction as teamLifePointsAfter. */
  readonly nextProcessedEventIds: string[];
}

function fail<T>(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function validEventId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(value);
}

function copyLifePoints(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2
    || value.some(points => !Number.isSafeInteger(points) || points < 0)) {
    return undefined;
  }
  return [value[0], value[1]];
}

function equalLifePoints(left: readonly number[], right: readonly number[]): boolean {
  return left.length === 2 && right.length === 2
    && left[0] === right[0] && left[1] === right[1];
}

/**
 * Produces one optimistic, immutable commit patch for an already-resolved
 * TagDuel LP event. The caller must persist teamLifePointsAfter and
 * nextProcessedEventIds atomically in the same session/database transaction.
 *
 * This function deliberately does not mutate TagDuel, player data, or the
 * caller's ledger. A duplicate event returns the current LP tuple unchanged,
 * even when the original pre-event snapshot is now stale after a prior commit.
 */
export function planTagDuelLifePointCommit(
  game: TagDuel,
  transition: TagDuelLifePointTransition,
  processedEventIds: readonly string[] = [],
): { ok: true; value: TagDuelLifePointCommitPlan } | { ok: false; reason: string } {
  if (!game || game.mode !== 'tag-classic') return fail('classic-tag-duel-required');
  if (!game.core || !Array.isArray(game.core.players) || game.core.players.length !== 2) {
    return fail('invalid-tag-duel-team-state');
  }
  if (!validEventId(transition?.eventId)) return fail('invalid-life-point-event-id');

  if (!Array.isArray(processedEventIds) || processedEventIds.length > 4096
    || processedEventIds.some(id => !validEventId(id))
    || new Set(processedEventIds).size !== processedEventIds.length) {
    return fail('invalid-life-point-event-ledger');
  }

  const current: [number, number] = [
    game.core.players[0]?.lp,
    game.core.players[1]?.lp,
  ];
  if (current.some(points => !Number.isSafeInteger(points) || points < 0)) {
    return fail('invalid-current-team-life-points');
  }

  const before = copyLifePoints(transition.teamLifePointsBefore);
  if (!before) return fail('invalid-life-point-before-snapshot');
  const after = copyLifePoints(transition.teamLifePointsAfter);
  if (!after) return fail('invalid-life-point-after-snapshot');

  if (processedEventIds.includes(transition.eventId)) {
    return {
      ok: true,
      value: {
        eventId: transition.eventId,
        status: 'duplicate-event',
        teamLifePointsBefore: [...current],
        teamLifePointsAfter: [...current],
        nextProcessedEventIds: [...processedEventIds],
      },
    };
  }

  if (!equalLifePoints(before, current)) {
    return fail('stale-team-life-point-snapshot');
  }

  return {
    ok: true,
    value: {
      eventId: transition.eventId,
      status: 'ready',
      teamLifePointsBefore: [...current],
      teamLifePointsAfter: after,
      nextProcessedEventIds: [...processedEventIds, transition.eventId],
    },
  };
}

export function tagDuelLifePointCommitPublicSummary(): string {
  return 'Transação de LP preparada para commit atômico; totais compartilhados e UIDs privados não são expostos publicamente.';
}
