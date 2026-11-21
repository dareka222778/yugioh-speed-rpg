const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ARMED_DRAGON_LV3_STANDBY_OPTION_ID,
  armedDragonLv3StandbyTaskId,
  planTagArmedDragonLevelUp,
  prepareTagArmedDragonDiscardEffect,
  resolveTagArmedDragonDiscardEffect,
  canTagSummonArmedDragonLv7,
  armedDragonTagPublicSummary
} = require('../dist/armedDragonTagDuelAdapter');
const { ARMED_DRAGON_IDS } = require('../dist/armedDragonLevelUp');
const { createTagDuel, tagNormalCardIds } = require('../dist/tagDuel');
const { getPlayableCard } = require('../dist/effectRegistry');
const { atk } = require('../dist/duelEngine');

function makeGame() {
  const deck = tagNormalCardIds.slice(0, 20);
  assert.equal(deck.length, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: 'seat-' + seat,
    name: 'Seat ' + seat,
    cards: [...deck]
  }));
  return createTagDuel(players, { seed: 'm442-armed-dragon', first: 2, classic: true });
}

function takePhysicalCard(game, seat, zone = 'deck') {
  const team = seat % 2;
  const held = game.active[team] === seat ? game.core.players[team] : game.reserves[String(seat)];
  const card = held[zone].pop();
  assert.ok(card, 'expected a physical card in seat ' + seat + ' ' + zone);
  return card;
}

function addSource(game, id, ownerSeat = 0) {
  const card = takePhysicalCard(game, ownerSeat, 'deck');
  const source = {
    ...card,
    id,
    position: 'atk',
    faceUp: true,
    entered: game.core.turn,
    changed: game.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0
  };
  game.core.players[0].monsters.push(source);
  return source;
}

function addCandidate(game, seat, id, zone = 'deck') {
  const card = takePhysicalCard(game, seat, zone);
  const candidate = { ...card, id };
  const team = seat % 2;
  const held = game.active[team] === seat ? game.core.players[team] : game.reserves[String(seat)];
  held[zone].push(candidate);
  return candidate;
}

function addOpponentMonster(game, ownerSeat = 1, options = {}) {
  const card = takePhysicalCard(game, ownerSeat, 'deck');
  const monster = {
    ...card,
    id: options.id || tagNormalCardIds[0],
    position: 'atk',
    faceUp: options.faceUp ?? true,
    entered: game.core.turn,
    changed: game.core.turn,
    attacked: 0,
    atkBoost: options.atkBoost ?? 0,
    defBoost: 0
  };
  game.core.players[1].monsters.push(monster);
  return monster;
}

function activateLv3Standby(game, source) {
  const id = armedDragonLv3StandbyTaskId(source.uid, game.core.turn);
  game.core.standby = {
    version: 1,
    tasks: [{
      id,
      turn: game.core.turn,
      actor: 0,
      optional: true,
      options: [{ id: ARMED_DRAGON_LV3_STANDBY_OPTION_ID, label: 'Invocar Armed Dragon LV5', operations: [] }]
    }],
    completed: [],
    active: { id, status: 'choosing' }
  };
  game.core.phase = 'choice';
  game.core.choice = {
    actor: 0,
    source: 'standby',
    targets: [ARMED_DRAGON_LV3_STANDBY_OPTION_ID, '__skip__']
  };
}

function makeBattleRecord(source, game, overrides = {}) {
  return {
    sourceUid: source.uid,
    destroyedMonsterUid: 'battle-destroyed-monster',
    turn: game.core.turn,
    ...overrides
  };
}

function activeDiscard(game) {
  const card = game.core.players[0].hand.find(item => {
    const info = getPlayableCard(item.id);
    return info?.kind === 'monster' && typeof info.atk === 'number';
  });
  assert.ok(card, 'active physical hand should contain a certified monster');
  return card;
}

function addLevelUpSourceAndCandidate(game, sourceId, summonId, ownerSeat = 0) {
  const source = addSource(game, sourceId, ownerSeat);
  const candidate = addCandidate(game, 2, summonId, 'deck');
  return { source, candidate };
}

test('LV3 Standby uses the actual active representative and private Deck candidate', () => {
  const game = makeGame();
  const { source, candidate } = addLevelUpSourceAndCandidate(game, ARMED_DRAGON_IDS.lv3, ARMED_DRAGON_IDS.lv5);
  activateLv3Standby(game, source);
  const before = JSON.stringify(game);
  const result = planTagArmedDragonLevelUp(game, source.uid, candidate.uid);
  assert.equal(result.ok, true);
  assert.equal(result.value.effectPlayerSeat, 2);
  assert.equal(result.value.effect.summonCardId, ARMED_DRAGON_IDS.lv5);
  assert.equal(result.value.effect.summonFrom, 'deck');
  assert.equal(result.value.effect.sourceGraveyardTeam, 0);
  assert.equal(JSON.stringify(game), before);
});

test('LV3 can summon LV5 from the active physical hand', () => {
  const game = makeGame();
  const source = addSource(game, ARMED_DRAGON_IDS.lv3);
  const candidate = addCandidate(game, 2, ARMED_DRAGON_IDS.lv5, 'hand');
  activateLv3Standby(game, source);
  const result = planTagArmedDragonLevelUp(game, source.uid, candidate.uid);
  assert.equal(result.ok, true);
  assert.equal(result.value.effect.summonFrom, 'hand');
});

test('LV3 rejects a missing or different active Standby continuation', () => {
  const game = makeGame();
  const { source, candidate } = addLevelUpSourceAndCandidate(game, ARMED_DRAGON_IDS.lv3, ARMED_DRAGON_IDS.lv5);
  activateLv3Standby(game, source);
  game.core.standby.active.id = 'other-task';
  assert.deepEqual(planTagArmedDragonLevelUp(game, source.uid, candidate.uid), {
    ok: false, reason: 'lv3-standby-task-not-active'
  });
});

test('LV3 never takes the next-level card from the inactive teammate reserve', () => {
  const game = makeGame();
  const source = addSource(game, ARMED_DRAGON_IDS.lv3);
  const candidate = addCandidate(game, 0, ARMED_DRAGON_IDS.lv5, 'deck');
  activateLv3Standby(game, source);
  assert.deepEqual(planTagArmedDragonLevelUp(game, source.uid, candidate.uid), {
    ok: false, reason: 'selected-summon-not-available'
  });
});

test('LV3 requires a face-up, non-negated source on the shared team field', () => {
  const game = makeGame();
  const source = addSource(game, ARMED_DRAGON_IDS.lv3);
  const candidate = addCandidate(game, 2, ARMED_DRAGON_IDS.lv5);
  activateLv3Standby(game, source);
  source.faceUp = false;
  assert.deepEqual(planTagArmedDragonLevelUp(game, source.uid, candidate.uid), {
    ok: false, reason: 'source-not-face-up-and-usable'
  });
});

test('LV5 End Phase requires the active turn-ending window and its same-turn battle record', () => {
  const game = makeGame();
  const { source, candidate } = addLevelUpSourceAndCandidate(game, ARMED_DRAGON_IDS.lv5, ARMED_DRAGON_IDS.lv7);
  game.core.phase = 'main';
  game.core.turnEnding = true;
  const result = planTagArmedDragonLevelUp(game, source.uid, candidate.uid, makeBattleRecord(source, game));
  assert.equal(result.ok, true);
  assert.equal(result.value.effect.summonCardId, ARMED_DRAGON_IDS.lv7);
  assert.equal(result.value.effect.phase, 'end');
});

test('LV5 refuses a stale or unrelated battle-destruction record', () => {
  const game = makeGame();
  const { source, candidate } = addLevelUpSourceAndCandidate(game, ARMED_DRAGON_IDS.lv5, ARMED_DRAGON_IDS.lv7);
  game.core.phase = 'main';
  game.core.turnEnding = true;
  assert.deepEqual(planTagArmedDragonLevelUp(game, source.uid, candidate.uid), {
    ok: false, reason: 'lv5-current-turn-battle-destruction-record-required'
  });
  assert.deepEqual(planTagArmedDragonLevelUp(game, source.uid, candidate.uid, makeBattleRecord(source, game, { turn: game.core.turn - 1 })), {
    ok: false, reason: 'lv5-current-turn-battle-destruction-record-required'
  });
  assert.deepEqual(planTagArmedDragonLevelUp(game, source.uid, candidate.uid, makeBattleRecord(source, game, { sourceUid: 'other-source' })), {
    ok: false, reason: 'lv5-current-turn-battle-destruction-record-required'
  });
});

test('LV5 level-up is unavailable before End Phase begins', () => {
  const game = makeGame();
  const { source, candidate } = addLevelUpSourceAndCandidate(game, ARMED_DRAGON_IDS.lv5, ARMED_DRAGON_IDS.lv7);
  game.core.phase = 'main';
  game.core.turnEnding = false;
  assert.deepEqual(planTagArmedDragonLevelUp(game, source.uid, candidate.uid, makeBattleRecord(source, game)), {
    ok: false, reason: 'lv5-end-phase-window-not-active'
  });
});

test('level-up cannot use a summon candidate held by a different physical seat', () => {
  const game = makeGame();
  const source = addSource(game, ARMED_DRAGON_IDS.lv3);
  const candidate = addCandidate(game, 0, ARMED_DRAGON_IDS.lv5);
  activateLv3Standby(game, source);
  assert.deepEqual(planTagArmedDragonLevelUp(game, source.uid, candidate.uid), {
    ok: false, reason: 'selected-summon-not-available'
  });
});

test('level-up rejects an absent source and a source outside the active team shared field', () => {
  const game = makeGame();
  assert.deepEqual(planTagArmedDragonLevelUp(game, 'missing-source', 'missing-candidate'), {
    ok: false, reason: 'armed-dragon-source-not-on-shared-field'
  });
  const source = addSource(game, ARMED_DRAGON_IDS.lv3, 1);
  const candidate = addCandidate(game, 2, ARMED_DRAGON_IDS.lv5);
  activateLv3Standby(game, source);
  assert.deepEqual(planTagArmedDragonLevelUp(game, source.uid, candidate.uid), {
    ok: false, reason: 'armed-dragon-source-not-on-shared-field'
  });
});

test('LV5 uses the current ATK of both opposing physical owners at activation', () => {
  const game = makeGame();
  const source = addSource(game, ARMED_DRAGON_IDS.lv5);
  const discard = activeDiscard(game);
  const info = getPlayableCard(discard.id);
  const target = addOpponentMonster(game, 1, { id: discard.id, atkBoost: -100 });
  game.core.phase = 'main';
  const result = prepareTagArmedDragonDiscardEffect(game, source.uid, discard.uid, target.uid);
  assert.equal(result.ok, true);
  assert.equal(result.value.effect.discardedMonsterOriginalAtk, info.atk);
  assert.equal(result.value.effect.targeting, 'single');
});

test('LV5 discard must come from the active physical hand, not the inactive partner reserve', () => {
  const game = makeGame();
  const source = addSource(game, ARMED_DRAGON_IDS.lv5);
  const partnerCard = game.reserves['0'].hand[0];
  assert.ok(partnerCard);
  game.core.phase = 'main';
  assert.deepEqual(prepareTagArmedDragonDiscardEffect(game, source.uid, partnerCard.uid, 'target'), {
    ok: false, reason: 'discarded-card-not-in-active-physical-hand'
  });
});

test('discard cost rejects a Spell and unknown original ATK metadata', () => {
  const game = makeGame();
  const source = addSource(game, ARMED_DRAGON_IDS.lv5);
  const spellId = require('../dist/effectRegistry').getEnabledCardIds().find(id => getPlayableCard(id)?.kind === 'spell');
  assert.ok(spellId);
  const card = game.core.players[0].hand[0];
  card.id = spellId;
  game.core.phase = 'main';
  assert.deepEqual(prepareTagArmedDragonDiscardEffect(game, source.uid, card.uid, 'target'), {
    ok: false, reason: 'discard-cost-must-be-certified-monster'
  });
});

test('LV5 rejects an opponent target above discarded original ATK after current modifiers', () => {
  const game = makeGame();
  const source = addSource(game, ARMED_DRAGON_IDS.lv5);
  const discard = activeDiscard(game);
  const target = addOpponentMonster(game, 1, { id: discard.id, atkBoost: 1000 });
  game.core.phase = 'main';
  assert.deepEqual(prepareTagArmedDragonDiscardEffect(game, source.uid, discard.uid, target.uid), {
    ok: false, reason: 'lv5-target-not-eligible'
  });
});

test('LV5 resolves only its target and keeps discard paid if the target turns face-down', () => {
  const game = makeGame();
  const source = addSource(game, ARMED_DRAGON_IDS.lv5);
  const discard = activeDiscard(game);
  const target = addOpponentMonster(game, 1, { id: discard.id });
  game.core.phase = 'main';
  const plan = prepareTagArmedDragonDiscardEffect(game, source.uid, discard.uid, target.uid);
  assert.equal(plan.ok, true);
  target.faceUp = false;
  game.core.phase = 'response';
  const result = resolveTagArmedDragonDiscardEffect(game, plan.value);
  assert.equal(result.ok, true);
  assert.equal(result.value.costPaid, true);
  assert.deepEqual(result.value.destroyed, []);
});

test('LV7 is non-targeting and resolves against every current opposing face-up monster', () => {
  const game = makeGame();
  const source = addSource(game, ARMED_DRAGON_IDS.lv7);
  const discard = activeDiscard(game);
  const targetA = addOpponentMonster(game, 1, { id: discard.id, atkBoost: -100 });
  const targetB = addOpponentMonster(game, 3, { id: discard.id, atkBoost: -200 });
  game.core.phase = 'main';
  const plan = prepareTagArmedDragonDiscardEffect(game, source.uid, discard.uid);
  assert.equal(plan.ok, true);
  assert.equal(plan.value.effect.targeting, 'all-current');
  assert.equal(plan.value.effect.selectedTargetUid, undefined);
  const targetC = addOpponentMonster(game, 1, { id: discard.id, atkBoost: -300 });
  game.core.phase = 'response';
  const result = resolveTagArmedDragonDiscardEffect(game, plan.value);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.destroyed.map(item => item.uid), [targetA.uid, targetB.uid, targetC.uid]);
  assert.deepEqual(result.value.destroyed.map(item => item.graveyardTeam), [1, 1, 1]);
});

test('LV7 rejects a target UID because its effect does not target', () => {
  const game = makeGame();
  const source = addSource(game, ARMED_DRAGON_IDS.lv7);
  const discard = activeDiscard(game);
  const target = addOpponentMonster(game, 1, { id: discard.id });
  game.core.phase = 'main';
  assert.deepEqual(prepareTagArmedDragonDiscardEffect(game, source.uid, discard.uid, target.uid), {
    ok: false, reason: 'lv7-effect-does-not-target'
  });
});

test('discard plans are immutable and do not mutate LP, hand, field or grave', () => {
  const game = makeGame();
  const source = addSource(game, ARMED_DRAGON_IDS.lv5);
  const discard = activeDiscard(game);
  const target = addOpponentMonster(game, 1, { id: discard.id });
  game.core.phase = 'main';
  const before = JSON.stringify(game);
  const plan = prepareTagArmedDragonDiscardEffect(game, source.uid, discard.uid, target.uid);
  assert.equal(plan.ok, true);
  assert.equal(JSON.stringify(game), before);
});

test('stale turn or active-seat changes invalidate discard resolution', () => {
  const game = makeGame();
  const source = addSource(game, ARMED_DRAGON_IDS.lv7);
  const discard = activeDiscard(game);
  game.core.phase = 'main';
  const plan = prepareTagArmedDragonDiscardEffect(game, source.uid, discard.uid);
  assert.equal(plan.ok, true);
  game.core.turn++;
  assert.deepEqual(resolveTagArmedDragonDiscardEffect(game, plan.value), {
    ok: false, reason: 'stale-armed-dragon-discard-plan'
  });
});

test('LV7 summon restriction matches the physical Hand/Deck-only Level Up exception', () => {
  assert.equal(canTagSummonArmedDragonLv7('normal', 'hand'), false);
  assert.equal(canTagSummonArmedDragonLv7('set', 'hand'), false);
  assert.equal(canTagSummonArmedDragonLv7('other-special', 'hand'), false);
  assert.equal(canTagSummonArmedDragonLv7('armed-dragon-lv5', 'deck'), true);
  assert.equal(canTagSummonArmedDragonLv7('level-up', 'hand'), true);
  assert.equal(canTagSummonArmedDragonLv7('level-up', 'deck'), true);
  assert.equal(canTagSummonArmedDragonLv7('level-up', 'grave'), false);
});

test('public summary never exposes physical UIDs or private hand contents', () => {
  const summary = armedDragonTagPublicSummary();
  assert.match(summary, /identidades privadas e alvos ocultos não são exibidos publicamente/i);
  assert.equal(summary.includes(ARMED_DRAGON_IDS.lv3), false);
});
