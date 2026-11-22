'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  A_TEAM_TRAP_DISPOSAL_UNIT_ID,
  prepareATeamTagDuelResponse,
  resolveATeamTagDuelResponse,
} = require('../dist/aTeamTagDuelAdapter');

function player(id) {
  return { id, name: id, lp: 8000, deck: [], hand: [], monsters: [], backrow: [], grave: [], extra: [], banished: [], field: null, summoned: false };
}
function state() {
  const team0 = player('tag-team-0');
  const team1 = player('tag-team-1');
  team0.monsters.push({
    uid: 'm2:a-team', id: A_TEAM_TRAP_DISPOSAL_UNIT_ID, owner: 0, faceUp: true,
    position: 'atk', entered: 1, changed: 1, attacked: 0, atkBoost: 0, defBoost: 0,
  });
  team1.backrow.push({ uid: 'm3:trap', id: '04031928', setTurn: 1, faceUp: false });
  return {
    version: 1, mode: 'tag-classic',
    members: [
      { id: 'seat0', name: 'Seat 0', team: 0 },
      { id: 'seat1', name: 'Seat 1', team: 1 },
      { id: 'seat2', name: 'Seat 2', team: 0 },
      { id: 'seat3', name: 'Seat 3', team: 1 },
    ],
    active: [0, 1], cursor: 1,
    reserves: {
      2: { deck: [], hand: [], extra: [] },
      3: { deck: [], hand: [], extra: [] },
    },
    core: {
      version: 1, players: [team0, team1], turn: 3, current: 1, phase: 'response',
      resume: 'main', priority: 0, passes: 0,
      pending: { kind: 'spell', actor: 1, card: 'm3:trap', id: '04031928' },
      pendingNegated: false, chain: [{ kind: 'spell', actor: 1, card: 'm3:trap', id: '04031928' }],
      winner: null, reason: '', log: [],
    },
  };
}
const cardKind = id => id === '04031928' ? 'trap' : id === A_TEAM_TRAP_DISPOSAL_UNIT_ID ? 'monster' : undefined;
const speed = () => 2;

test('maps physical owners from UIDs and current controllers from active seats', () => {
  const s = state();
  const result = prepareATeamTagDuelResponse(s, 0, 0, 'm2:a-team', cardKind, speed);
  assert.equal(result.eligible, true);
  assert.deepEqual(result.offer, {
    sourceUid: 'm2:a-team',
    trapUid: 'm3:trap',
    activationId: '3:1:m3:trap:04031928',
    sourceTeam: 'even',
    targetTeam: 'odd',
    responseSpeed: 2,
    cost: 'tribute-source',
  });
});

test('only the active physical representative may offer the response', () => {
  const s = state();
  assert.throws(
    () => prepareATeamTagDuelResponse(s, 0, 2, 'm2:a-team', cardKind, speed),
    /representante ativo/,
  );
});

test('rejects a source that is not on the responding team shared Monster Zone', () => {
  const s = state();
  assert.deepEqual(
    prepareATeamTagDuelResponse(s, 0, 0, 'missing', cardKind, speed),
    { eligible: false, reason: 'source-not-on-monster-zone' },
  );
});

test('rejects a non-Trap pending link and a closed response window', () => {
  const s = state();
  const nonTrap = prepareATeamTagDuelResponse(s, 0, 0, 'm2:a-team', () => 'spell', speed);
  assert.deepEqual(nonTrap, { eligible: false, reason: 'not-a-trap-activation' });
  s.core.phase = 'main';
  const closed = prepareATeamTagDuelResponse(s, 0, 0, 'm2:a-team', cardKind, speed);
  assert.deepEqual(closed, { eligible: false, reason: 'response-window-closed' });
});

test('rejects a Counter Trap at Spell Speed 3', () => {
  const s = state();
  assert.deepEqual(
    prepareATeamTagDuelResponse(s, 0, 0, 'm2:a-team', cardKind, () => 3),
    { eligible: false, reason: 'counter-trap-speed' },
  );
});

test('revalidates the pending activation ID and both physical UIDs at resolution', () => {
  const s = state();
  const offered = prepareATeamTagDuelResponse(s, 0, 0, 'm2:a-team', cardKind, speed);
  assert.equal(offered.eligible, true);
  s.core.chain.push({ kind: 'spell', actor: 1, card: 'm3:other', id: '04031928' });
  const result = resolveATeamTagDuelResponse(s, 0, 0, 'm2:a-team', offered.offer, cardKind, speed);
  assert.deepEqual(result, { resolved: false, reason: 'stale-offer' });
});

test('plans atomic Graveyard moves while preserving the inactive partners as physical owners', () => {
  const s = state();
  const offered = prepareATeamTagDuelResponse(s, 0, 0, 'm2:a-team', cardKind, speed);
  assert.equal(offered.eligible, true);
  const result = resolveATeamTagDuelResponse(s, 0, 0, 'm2:a-team', offered.offer, cardKind, speed);
  assert.equal(result.resolved, true);
  assert.equal(result.tributedSource.ownerSeat, 2);
  assert.equal(result.destroyedTrap.ownerSeat, 3);
  assert.equal(result.negatedActivationId, offered.offer.activationId);
});

test('rejects duplicate UIDs already in the shared Graveyard without mutating the state', () => {
  const s = state();
  s.core.players[0].grave.push({ uid: 'm2:a-team', id: A_TEAM_TRAP_DISPOSAL_UNIT_ID });
  const before = structuredClone(s);
  const offered = prepareATeamTagDuelResponse(s, 0, 0, 'm2:a-team', cardKind, speed);
  assert.equal(offered.eligible, true);
  const result = resolveATeamTagDuelResponse(s, 0, 0, 'm2:a-team', offered.offer, cardKind, speed);
  assert.deepEqual(result, { resolved: false, reason: 'duplicate-physical-uid' });
  assert.deepEqual(s, before);
});

test('a source effect negated at resolution is not offered', () => {
  const s = state();
  s.core.players[0].monsters[0].effectNegatedAtResolution = true;
  assert.deepEqual(
    prepareATeamTagDuelResponse(s, 0, 0, 'm2:a-team', cardKind, speed),
    { eligible: false, reason: 'source-effect-negated' },
  );
});
