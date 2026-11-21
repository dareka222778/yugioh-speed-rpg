import type { TagDuel } from './tagDuel';
import { resolveTagFirePrincessLpGain } from './firePrincessTagDuelAdapter';
import type { FirePrincessLpGainResult } from './firePrincessLpGain';
import { planTagDuelLifePointCommit } from './tagDuelLifePointTransaction';

type Team = 0 | 1;

export interface TagDuelLpGainEvent {
  readonly eventId: string;
  readonly gainingTeam: Team;
  readonly lpGained: number;
  readonly teamLifePointsBefore: readonly [number, number];
  readonly teamLifePointsAfterGain: readonly [number, number];
  readonly negatedFirePrincessUids?: readonly string[];
}

export interface TagDuelLpGainPipelinePlan {
  readonly eventId: string;
  readonly firePrincessEventId: string;
  readonly status: 'ready' | 'duplicate-event';
  readonly teamLifePointsBefore: [number, number];
  readonly teamLifePointsAfter: [number, number];
  readonly nextSourceProcessedEventIds: string[];
  readonly nextFirePrincessProcessedEventIds: string[];
  readonly firePrincess: FirePrincessLpGainResult | null;
}

function fail<T = never>(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function validEventId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(value);
}

function safeTuple(value: readonly [number, number]): boolean {
  return Array.isArray(value) && value.length === 2
    && value.every(points => Number.isSafeInteger(points) && points >= 0);
}

/**
 * Plans a complete LP-gain → Fire Princess event without mutating TagDuel.
 * The source LP tuple and Fire Princess damage tuple are evaluated in order;
 * the caller persists the final LP tuple and both ledgers in one storage
 * transaction. A partial ledger state is rejected rather than risking a
 * duplicated Fire Princess burn after a crash or stale session write.
 */
export function planTagDuelLpGainFirePrincessPipeline(
  game: TagDuel,
  event: TagDuelLpGainEvent,
  sourceProcessedEventIds: readonly string[] = [],
  firePrincessProcessedEventIds: readonly string[] = [],
): { ok: true; value: TagDuelLpGainPipelinePlan } | { ok: false; reason: string } {
  if (!game || game.mode !== 'tag-classic') return fail('classic-tag-duel-required');
  if (!validEventId(event?.eventId) || event.eventId.length > 103) {
    return fail('invalid-lp-gain-source-event-id');
  }
  if (event.gainingTeam !== 0 && event.gainingTeam !== 1) return fail('invalid-lp-gaining-team');
  if (!Number.isSafeInteger(event.lpGained) || event.lpGained < 0) return fail('invalid-lp-gained-amount');
  if (!safeTuple(event.teamLifePointsBefore)) return fail('invalid-lp-gain-before-snapshot');
  if (!safeTuple(event.teamLifePointsAfterGain)) return fail('invalid-lp-gain-after-snapshot');

  const observedGain = event.teamLifePointsAfterGain[event.gainingTeam]
    - event.teamLifePointsBefore[event.gainingTeam];
  if (observedGain !== event.lpGained) return fail('lp-gain-amount-does-not-match-team-snapshot');

  const firePrincessEventId = event.eventId + ':fire-princess';
  if (!validEventId(firePrincessEventId)) return fail('invalid-fire-princess-event-id');

  const sourcePlan = planTagDuelLifePointCommit(game, {
    eventId: event.eventId,
    teamLifePointsBefore: event.teamLifePointsBefore,
    teamLifePointsAfter: event.teamLifePointsAfterGain,
  }, sourceProcessedEventIds);
  if (!sourcePlan.ok) return fail(sourcePlan.reason);

  const current: [number, number] = [game.core.players[0].lp, game.core.players[1].lp];
  const fireLedgerProbe = planTagDuelLifePointCommit(game, {
    eventId: firePrincessEventId,
    teamLifePointsBefore: current,
    teamLifePointsAfter: current,
  }, firePrincessProcessedEventIds);
  if (!fireLedgerProbe.ok) return fail(fireLedgerProbe.reason);

  if (sourcePlan.value.status === 'duplicate-event') {
    if (fireLedgerProbe.value.status !== 'duplicate-event') {
      return fail('partial-lp-gain-pipeline-ledger');
    }
    return {
      ok: true,
      value: {
        eventId: event.eventId,
        firePrincessEventId,
        status: 'duplicate-event',
        teamLifePointsBefore: [...current],
        teamLifePointsAfter: [...current],
        nextSourceProcessedEventIds: [...sourceProcessedEventIds],
        nextFirePrincessProcessedEventIds: [...firePrincessProcessedEventIds],
        firePrincess: null,
      },
    };
  }
  if (fireLedgerProbe.value.status === 'duplicate-event') {
    return fail('partial-lp-gain-pipeline-ledger');
  }

  const projected = {
    ...game,
    core: {
      ...game.core,
      players: game.core.players.map((player, team) => ({
        ...player,
        lp: event.teamLifePointsAfterGain[team as Team],
      })),
    },
  } as TagDuel;

  const firePrincess = resolveTagFirePrincessLpGain(projected, {
    eventId: firePrincessEventId,
    gainingTeam: event.gainingTeam,
    lpGained: event.lpGained,
    teamLifePointsAfterGain: event.teamLifePointsAfterGain,
    negatedSourceUids: event.negatedFirePrincessUids,
  }, firePrincessProcessedEventIds);
  if (!firePrincess.ok) return fail('fire-princess:' + firePrincess.reason);

  const firePlan = planTagDuelLifePointCommit(projected, {
    eventId: firePrincessEventId,
    teamLifePointsBefore: event.teamLifePointsAfterGain,
    teamLifePointsAfter: firePrincess.value.result.teamLifePointsAfterDamage,
  }, firePrincessProcessedEventIds);
  if (!firePlan.ok) return fail(firePlan.reason);

  return {
    ok: true,
    value: {
      eventId: event.eventId,
      firePrincessEventId,
      status: 'ready',
      teamLifePointsBefore: sourcePlan.value.teamLifePointsBefore,
      teamLifePointsAfter: firePlan.value.teamLifePointsAfter,
      nextSourceProcessedEventIds: sourcePlan.value.nextProcessedEventIds,
      nextFirePrincessProcessedEventIds: firePlan.value.nextProcessedEventIds,
      firePrincess: firePrincess.value.result,
    },
  };
}

export function tagDuelLpGainFirePrincessPublicSummary(): string {
  return 'Ganho de LP e gatilho Fire Princess preparados como uma transação idempotente; UIDs privados não são exibidos publicamente.';
}
