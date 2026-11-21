import { db } from './database';
import { assertTagDuel, type TagDuel } from './tagDuel';
import type { TagDuelLpGainPipelinePlan } from './tagDuelLpGainFirePrincessPipeline';

interface SessionRow { revision: number; status: string; state: string | null; }
interface LedgerRow { source_event_ids: string; fire_princess_event_ids: string; }
type CommitResult =
  | { ok: true; status: 'committed' | 'duplicate-event'; revision: number; teamLifePoints: [number, number] }
  | { ok: false; reason: string };

function fail(reason: string): CommitResult { return { ok: false, reason }; }
function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(value);
}
function tuple(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2
    || value.some(points => !Number.isSafeInteger(points) || points < 0)) return undefined;
  return [value[0], value[1]];
}
function same(left: readonly number[], right: readonly number[]): boolean {
  return left.length === 2 && right.length === 2 && left[0] === right[0] && left[1] === right[1];
}
function readLedger(row?: LedgerRow): { source: string[]; fire: string[] } | undefined {
  if (!row) return { source: [], fire: [] };
  try {
    const source = JSON.parse(row.source_event_ids);
    const fire = JSON.parse(row.fire_princess_event_ids);
    if (!Array.isArray(source) || !Array.isArray(fire)
      || source.some(id => !validId(id)) || fire.some(id => !validId(id))
      || new Set(source).size !== source.length || new Set(fire).size !== fire.length
      || source.length > 4096 || fire.length > 4096) return undefined;
    return { source, fire };
  } catch { return undefined; }
}
function sameIds(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((id, index) => id === expected[index]);
}

db.exec('CREATE TABLE IF NOT EXISTS tag_lp_event_ledgers ('
  + 'session_id TEXT PRIMARY KEY,'
  + 'source_event_ids TEXT NOT NULL,'
  + 'fire_princess_event_ids TEXT NOT NULL,'
  + 'updated INTEGER NOT NULL'
  + ')');

/**
 * Persists one M452 pipeline plan atomically with the TagDuel session revision.
 * Both shared LP totals, the source event ledger, the Fire Princess ledger and
 * the public session revision are committed in one SQLite transaction.
 *
 * This helper is intentionally separate from tagStore/duelEngineCurrent until
 * the central resolver handoff is granted. Tests use an isolated SQLite file.
 */
export function commitTagDuelLpGainPipelinePlan(
  sessionId: string,
  expectedRevision: number,
  plan: TagDuelLpGainPipelinePlan,
): CommitResult {
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(sessionId)) {
    return fail('invalid-tag-session-id');
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return fail('invalid-expected-session-revision');
  }
  if (!plan || !validId(plan.eventId) || !validId(plan.firePrincessEventId)
    || plan.firePrincessEventId !== plan.eventId + ':fire-princess') {
    return fail('invalid-lp-pipeline-plan');
  }
  const before = tuple(plan.teamLifePointsBefore);
  const after = tuple(plan.teamLifePointsAfter);
  if (!before || !after
    || !Array.isArray(plan.nextSourceProcessedEventIds)
    || !Array.isArray(plan.nextFirePrincessProcessedEventIds)) {
    return fail('invalid-lp-pipeline-plan');
  }

  const transaction = db.transaction((): CommitResult => {
    const row = db.prepare('SELECT revision,status,state FROM tag_sessions WHERE id=?')
      .get(sessionId) as SessionRow | undefined;
    if (!row) return fail('tag-session-not-found');
    if (!row.state) return fail('tag-session-has-no-duel-state');

    const ledgerRow = db.prepare(
      'SELECT source_event_ids,fire_princess_event_ids FROM tag_lp_event_ledgers WHERE session_id=?'
    ).get(sessionId) as LedgerRow | undefined;
    const ledger = readLedger(ledgerRow);
    if (!ledger) return fail('invalid-persisted-lp-event-ledger');

    const sourceHas = ledger.source.includes(plan.eventId);
    const fireHas = ledger.fire.includes(plan.firePrincessEventId);
    if (sourceHas !== fireHas) return fail('partial-persisted-lp-pipeline-ledger');

    let state: TagDuel;
    try {
      state = JSON.parse(row.state) as TagDuel;
      assertTagDuel(state);
    } catch {
      return fail('invalid-tag-session-state');
    }

    const current: [number, number] = [state.core.players[0].lp, state.core.players[1].lp];
    if (sourceHas && fireHas) {
      return { ok: true, status: 'duplicate-event', revision: row.revision, teamLifePoints: current };
    }
    if (plan.status === 'duplicate-event') return fail('duplicate-plan-without-persisted-ledger');
    if (row.status !== 'playing') return fail('tag-session-not-playing');
    if (row.revision !== expectedRevision) return fail('stale-session-revision');
    if (!same(current, before)) return fail('stale-team-life-point-snapshot');

    const expectedSource = [...ledger.source, plan.eventId];
    const expectedFire = [...ledger.fire, plan.firePrincessEventId];
    if (!sameIds(plan.nextSourceProcessedEventIds, expectedSource)
      || !sameIds(plan.nextFirePrincessProcessedEventIds, expectedFire)) {
      return fail('lp-pipeline-plan-ledger-does-not-match-persisted-state');
    }

    state.core.players[0].lp = after[0];
    state.core.players[1].lp = after[1];
    try { assertTagDuel(state); } catch { return fail('lp-pipeline-plan-produced-invalid-tag-duel'); }

    const nextRevision = row.revision + 1;
    const updated = Date.now();
    const update = db.prepare(
      'UPDATE tag_sessions SET state=?,revision=?,updated=? WHERE id=? AND revision=?'
    ).run(JSON.stringify(state), nextRevision, updated, sessionId, row.revision);
    if (update.changes !== 1) return fail('stale-session-revision');

    db.prepare(
      'INSERT INTO tag_lp_event_ledgers(session_id,source_event_ids,fire_princess_event_ids,updated) '
      + 'VALUES(?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET '
      + 'source_event_ids=excluded.source_event_ids,'
      + 'fire_princess_event_ids=excluded.fire_princess_event_ids,updated=excluded.updated'
    ).run(sessionId, JSON.stringify(expectedSource), JSON.stringify(expectedFire), updated);

    return { ok: true, status: 'committed', revision: nextRevision, teamLifePoints: after };
  });

  try { return transaction(); } catch { return fail('lp-pipeline-storage-transaction-failed'); }
}
