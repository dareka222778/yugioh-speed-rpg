'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
  A_CAT_OF_ILL_OMEN_ID,
  NECROVALLEY_ID,
  prepareACatOfIllOmen,
  aCatOfIllOmenTrapCandidates,
  resolveACatOfIllOmen
} = require('../dist/aCatOfIllOmenTagAdapter');

const KINDS = new Map([
  ['TRAP_ACTIVE', 'trap'],
  ['TRAP_ACTIVE_2', 'trap'],
  ['TRAP_PARTNER', 'trap'],
  ['TRAP_OPPONENT', 'trap'],
  ['SPELL_ACTIVE', 'spell'],
  ['MONSTER_ACTIVE', 'monster']
]);
const getCardKind = id => KINDS.get(id);

function makeState(options = {}) {
  const sourceFaceUp = options.sourceFaceUp !== false;
  const team0Deck = options.team0Deck ?? [
    {uid: 'm0:trap-active', id: 'TRAP_ACTIVE'},
    {uid: 'm0:spell-active', id: 'SPELL_ACTIVE'},
    {uid: 'm0:trap-active-2', id: 'TRAP_ACTIVE_2'}
  ];
  const team0Monsters = [{
    uid: 'm2:cat-physically-owned-by-partner',
    id: A_CAT_OF_ILL_OMEN_ID,
    position: 'def',
    faceUp: sourceFaceUp,
    entered: 1,
    changed: 1,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0
  }];
  const field = team => options.necroTeam === team
    ? {uid: `m${team}:necrovalley`, id: NECROVALLEY_ID, setTurn: 0, faceUp: true}
    : null;
  return {
    version: 1,
    players: [
      {
        id: 'tag-team-0', name: 'Equipe Azul', lp: 4000,
        deck: team0Deck, hand: [], monsters: team0Monsters, backrow: [], grave: [],
        extra: [], field: field(0), summoned: false
      },
      {
        id: 'tag-team-1', name: 'Equipe Vermelha', lp: 4000,
        deck: [{uid: 'm1:opponent-trap', id: 'TRAP_OPPONENT'}],
        hand: [], monsters: [], backrow: [], grave: [], extra: [], field: field(1), summoned: false
      }
    ],
    teamRotation: {
      version: 1, cursor: 0, active: [0, 1],
      reserves: {
        2: {hand: [], deck: [{uid: 'm2:trap-partner', id: 'TRAP_PARTNER'}], extra: []},
        3: {hand: [], deck: [], extra: []}
      }
    },
    turn: 4, current: 0, phase: 'response', resume: 'main',
    priority: 0, passes: 0,
    pending: {kind: 'flip', actor: 0, card: 'm2:cat-physically-owned-by-partner', id: A_CAT_OF_ILL_OMEN_ID},
    chain: [], winner: null, reason: '', log: []
  };
}

function activation(state, options = {}) {
  return prepareACatOfIllOmen(
    state, 0, 0, 'm2:cat-physically-owned-by-partner', 'flip', options.isNegated
  );
}

test('FLIP activation uses the active representative Deck even when the source belongs to the inactive partner', () => {
  const state = makeState();
  const before = structuredClone(state);
  const prepared = activation(state);
  assert.equal(prepared.sourceUid, 'm2:cat-physically-owned-by-partner');
  assert.equal(prepared.activeSeat, 0);
  assert.deepEqual(prepared.allowedDestinations, ['topDeck']);
  const candidates = aCatOfIllOmenTrapCandidates(state, prepared, getCardKind);
  assert.deepEqual(candidates.map(c => c.id), ['TRAP_ACTIVE', 'TRAP_ACTIVE_2']);
  assert.ok(candidates.every(c => c.visibility === 'active-seat-only'));
  assert.equal(JSON.stringify(candidates).includes('TRAP_PARTNER'), false);
  assert.deepEqual(state, before);
});

test('face-up Necrovalley on either field opens the hand destination at activation', () => {
  const state = makeState({necroTeam: 1});
  const prepared = activation(state);
  assert.equal(prepared.necrovalleyAtActivation, true);
  assert.deepEqual(prepared.allowedDestinations, ['topDeck', 'hand']);
});

test('a selected Trap is planned for the active seat hand and revealed only to the opponent team', () => {
  const state = makeState({necroTeam: 0});
  const before = structuredClone(state);
  const prepared = activation(state);
  const plan = resolveACatOfIllOmen(state, prepared, 'm0:trap-active', 'hand', getCardKind);
  assert.equal(plan.destination, 'hand');
  assert.equal(plan.activeSeat, 0);
  assert.equal(plan.targetUid, 'm0:trap-active');
  assert.equal(plan.cardId, 'TRAP_ACTIVE');
  assert.equal(plan.revealScope, 'opponent-team');
  assert.equal(plan.keepPrivateFromPartner, true);
  assert.equal(plan.shuffleDeck, false);
  assert.deepEqual(state, before, 'the adapter emits a plan and never mutates the duel');
});

test('if Necrovalley leaves before resolution, a chosen hand destination falls back to the top of the Deck', () => {
  const state = makeState({necroTeam: 1});
  const prepared = activation(state);
  state.players[1].field = null;
  const plan = resolveACatOfIllOmen(state, prepared, 'm0:trap-active', 'hand', getCardKind);
  assert.equal(plan.destination, 'topDeck');
});

test('Necrovalley appearing only after activation cannot unlock the hand destination', () => {
  const state = makeState();
  const prepared = activation(state);
  state.players[0].field = {uid: 'm0:late-necro', id: NECROVALLEY_ID, setTurn: 0, faceUp: true};
  assert.throws(
    () => resolveACatOfIllOmen(state, prepared, 'm0:trap-active', 'hand', getCardKind),
    /destino não estava disponível/
  );
});

test('the inactive partner Deck is never a legal source for the selected Trap', () => {
  const state = makeState();
  const prepared = activation(state);
  assert.throws(
    () => resolveACatOfIllOmen(state, prepared, 'm2:trap-partner', 'topDeck', getCardKind),
    /Armadilha do Deck do representante ativo/
  );
});

test('a non-Trap card cannot be selected', () => {
  const state = makeState();
  const prepared = activation(state);
  assert.throws(
    () => resolveACatOfIllOmen(state, prepared, 'm0:spell-active', 'topDeck', getCardKind),
    /Armadilha do Deck do representante ativo/
  );
});

test('face-down and effect-negated sources cannot prepare a FLIP resolution', () => {
  const faceDown = makeState({sourceFaceUp: false});
  assert.throws(() => activation(faceDown), /precisa estar face-up/);
  const negated = makeState();
  assert.throws(() => activation(negated, {isNegated: () => true}), /efeito .* negado/);
});

test('a stale representative or turn cannot resolve against a different physical Deck', () => {
  const state = makeState();
  const prepared = activation(state);
  state.teamRotation.active[0] = 2;
  assert.throws(
    () => aCatOfIllOmenTrapCandidates(state, prepared, getCardKind),
    /representante ativo mudou/
  );
  const other = makeState();
  const preparedOther = activation(other);
  other.turn += 1;
  assert.throws(
    () => resolveACatOfIllOmen(other, preparedOther, 'm0:trap-active', 'topDeck', getCardKind),
    /turno mudou/
  );
});

test('the active Deck rejects a card whose UID belongs to another physical seat', () => {
  const state = makeState({team0Deck: [{uid: 'm2:foreign-trap', id: 'TRAP_ACTIVE'}]});
  const prepared = activation(state);
  assert.throws(
    () => aCatOfIllOmenTrapCandidates(state, prepared, getCardKind),
    /outro proprietário físico/
  );
});

test('a later field change cannot mutate the captured activation modes', () => {
  const state = makeState({necroTeam: 0});
  const prepared = activation(state);
  state.players[0].field = null;
  assert.deepEqual(prepared.allowedDestinations, ['topDeck', 'hand']);
  assert.equal(prepared.necrovalleyAtActivation, true);
});

test('a FLIP trigger is required; normal summon is not an activation source', () => {
  const state = makeState();
  assert.throws(
    () => prepareACatOfIllOmen(state, 0, 0, 'm2:cat-physically-owned-by-partner', 'summon'),
    /gatilho FLIP/
  );
});

test('no Trap in the active Deck produces no selectable candidate', () => {
  const state = makeState({team0Deck: [{uid: 'm0:only-spell', id: 'SPELL_ACTIVE'}]});
  const prepared = activation(state);
  assert.deepEqual(aCatOfIllOmenTrapCandidates(state, prepared, getCardKind), []);
});
