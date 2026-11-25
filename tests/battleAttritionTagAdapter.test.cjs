const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard, getPlayableCard } = require('../dist/effectRegistry.js');
const { rulesCardName } = require('../dist/cardIdentity.js');
const { atk, def } = require('../dist/duelEngine.js');
const { synchronizeCardLifetimes } = require('../dist/cardLifetime.js');
const { syncContinuous } = require('../dist/continuousEffects.js');
const {
  ZOMBYRA_ATK_LOSS,
  createBattleAttritionTagAdapter,
} = require('../dist/battleAttritionTagAdapter.js');

const EFFECT_IDS = enabledCardIds.filter(id => {
  const card = getDuelCard(id);
  return card?.kind === 'monster' && card.monsterType === 'effect' && !card.fusion;
});
const SPELL_IDS = enabledCardIds.filter(id => getDuelCard(id)?.kind === 'spell').slice(0, 2);
const TRAP_IDS = enabledCardIds.filter(id => getDuelCard(id)?.kind === 'trap').slice(0, 1);
const FUSION_NAMES = new Set();
const FUSION_IDS = enabledCardIds.filter(id => {
  const card = getDuelCard(id);
  if (!card?.fusion) return false;
  const name = rulesCardName(card);
  if (FUSION_NAMES.has(name)) return false;
  FUSION_NAMES.add(name);
  return true;
});
const NORMAL_NAMES = new Set();
const NORMAL_IDS = tagNormalCardIds.filter(id => {
  const name = rulesCardName(getDuelCard(id));
  if (NORMAL_NAMES.has(name)) return false;
  NORMAL_NAMES.add(name);
  return true;
});

assert.ok(EFFECT_IDS.length >= 3, 'fixtures require three enabled Effect Monsters');
assert.equal(SPELL_IDS.length, 2, 'fixtures require two enabled Spells');
assert.equal(TRAP_IDS.length, 1, 'fixtures require one enabled Trap');
assert.ok(NORMAL_IDS.length >= 27, 'fixtures require 27 distinct Normal Monster names');
assert.ok(FUSION_IDS.length >= 6, 'fixtures require six distinct Fusion cards');

const ZOMBYRA_FIXTURE_ID = EFFECT_IDS[0];
const HA_DES_FIXTURE_ID = EFFECT_IDS[1];
const TARGET_FIXTURE_ID = EFFECT_IDS[2];
const BASE_ZOMBYRA_ATK = getDuelCard(ZOMBYRA_FIXTURE_ID).atk ?? 0;
const BASE_DECK = [
  ...NORMAL_IDS.slice(0, 14),
  ZOMBYRA_FIXTURE_ID,
  HA_DES_FIXTURE_ID,
  TARGET_FIXTURE_ID,
  ...SPELL_IDS,
  TRAP_IDS[0],
];
const MAX_DECK = [
  ...NORMAL_IDS.slice(0, 26),
  ZOMBYRA_FIXTURE_ID,
  HA_DES_FIXTURE_ID,
  TARGET_FIXTURE_ID,
  SPELL_IDS[0],
];
assert.equal(BASE_DECK.length, 20);
assert.equal(MAX_DECK.length, 30);

const lookup = id => {
  const card = getPlayableCard(id);
  if (!card) return undefined;
  if (id === ZOMBYRA_FIXTURE_ID) return { ...card, race: 'Warrior', monsterType: 'effect' };
  if (id === HA_DES_FIXTURE_ID) return { ...card, race: 'Fiend', monsterType: 'effect' };
  return card;
};
const adapter = createBattleAttritionTagAdapter({
  zombyraId: ZOMBYRA_FIXTURE_ID,
  haDesId: HA_DES_FIXTURE_ID,
}, lookup);

function makeDuel(first = 0, deck = BASE_DECK, extraBySeat = {}) {
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i,
    name: 'Member ' + i,
    cards: [...deck],
    extra: [...(extraBySeat[i] || [])],
  }));
  return createTagDuel(players, {
    seed: 'm610-battle-attrition',
    first,
    classic: true,
  });
}

function privateZone(duel, seat, zone) {
  const team = seat % 2;
  return duel.active[team] === seat
    ? duel.core.players[team][zone]
    : duel.reserves[seat][zone];
}

function takeFromSeat(duel, seat, predicate, zones = ['hand', 'deck']) {
  for (const zoneName of zones) {
    const zone = privateZone(duel, seat, zoneName);
    const index = zone.findIndex(predicate);
    if (index >= 0) return zone.splice(index, 1)[0];
  }
  throw new Error('physical fixture card not found');
}

function addMonster(duel, id, ownerSeat, controllerTeam, faceUp = true) {
  const card = takeFromSeat(duel, ownerSeat, ref => ref.id === id);
  duel.core.players[controllerTeam].monsters.push({
    ...card,
    owner: ownerSeat % 2,
    position: faceUp ? 'atk' : 'def',
    faceUp,
    entered: duel.core.turn,
    changed: duel.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0,
  });
  return card.uid;
}

function addAnyMonster(duel, ownerSeat, controllerTeam) {
  const card = takeFromSeat(duel, ownerSeat, ref => {
    const info = getDuelCard(ref.id);
    return info?.kind === 'monster' && !info.fusion;
  });
  duel.core.players[controllerTeam].monsters.push({
    ...card,
    owner: ownerSeat % 2,
    position: 'atk',
    faceUp: true,
    entered: duel.core.turn,
    changed: duel.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0,
  });
  return card.uid;
}

function addAnyBackrow(duel, ownerSeat, controllerTeam) {
  const card = takeFromSeat(duel, ownerSeat, ref => {
    const kind = getDuelCard(ref.id)?.kind;
    return kind === 'spell' || kind === 'trap';
  });
  duel.core.players[controllerTeam].backrow.push({ ...card, setTurn: 0, faceUp: false });
  return card.uid;
}

function findMonster(duel, uid) {
  const found = duel.core.players.flatMap((player, team) =>
    player.monsters.filter(monster => monster.uid === uid).map(monster => ({ team, monster }))
  );
  return found.length === 1 ? found[0] : undefined;
}

function physicalSeat(uid) {
  const match = /^m([0-3]):/.exec(uid);
  assert.ok(match, 'fixture UID must retain its physical owner');
  return Number(match[1]);
}

function moveMonsterToOwnerZone(duel, uid, controllerTeam, zone = 'grave') {
  const index = duel.core.players[controllerTeam].monsters.findIndex(monster => monster.uid === uid);
  assert.ok(index >= 0, 'monster must still be on the field');
  const [monster] = duel.core.players[controllerTeam].monsters.splice(index, 1);
  const ownerTeam = physicalSeat(uid) % 2;
  if (zone === 'grave') duel.core.players[ownerTeam].grave.push({ uid: monster.uid, id: monster.id });
  else {
    duel.core.players[ownerTeam].banished ??= [];
    duel.core.players[ownerTeam].banished.push({ uid: monster.uid, id: monster.id });
  }
  synchronizeCardLifetimes(duel.core);
}

function moveOwnerGraveToDeck(duel, uid) {
  const ownerTeam = physicalSeat(uid) % 2;
  const grave = duel.core.players[ownerTeam].grave;
  const index = grave.findIndex(card => card.uid === uid);
  assert.ok(index >= 0, 'card must be in its physical owner Graveyard');
  const [card] = grave.splice(index, 1);
  duel.core.players[ownerTeam].deck.push(card);
  synchronizeCardLifetimes(duel.core);
}

function moveOwnerDeckToGrave(duel, uid) {
  const ownerTeam = physicalSeat(uid) % 2;
  const deck = duel.core.players[ownerTeam].deck;
  const index = deck.findIndex(card => card.uid === uid);
  assert.ok(index >= 0, 'card must be in its physical owner Deck');
  const [card] = deck.splice(index, 1);
  duel.core.players[ownerTeam].grave.push(card);
  synchronizeCardLifetimes(duel.core);
}

function zombyraEvent(duel, sourceUid, destroyedMonsterUid, destroyedMonsterId, eventId = 'm610:z:' + sourceUid) {
  return {
    kind: 'zombyra-battle-destroyed',
    eventId,
    turn: duel.core.turn,
    controllerTeam: duel.core.current,
    sourceUid,
    sourceId: ZOMBYRA_FIXTURE_ID,
    sourceWasFaceUp: true,
    destroyedMonsterUid,
    destroyedMonsterId,
    destroyedByBattle: true,
    damageStepComplete: true,
  };
}

function haDesEvent(duel, destroyerUid, destroyedMonsterUid, destroyedMonsterId = TARGET_FIXTURE_ID, eventId = 'm610:h:' + destroyerUid) {
  return {
    kind: 'fiend-battle-destroyed',
    eventId,
    turn: duel.core.turn,
    destroyerTeam: duel.core.current,
    destroyerUid,
    destroyerId: HA_DES_FIXTURE_ID,
    destroyedMonsterUid,
    destroyedMonsterId,
    destroyedByBattle: true,
    damageStepComplete: true,
  };
}

function inventory(duel) {
  return tagInventory(duel)
    .map(card => [card.uid, card.id])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function addZombyraAndDestroyedTarget(duel) {
  const sourceUid = addMonster(duel, ZOMBYRA_FIXTURE_ID, 2, 0);
  const targetUid = addMonster(duel, TARGET_FIXTURE_ID, 1, 1);
  moveMonsterToOwnerZone(duel, targetUid, 1, 'grave');
  return { sourceUid, targetUid };
}

function addHaDesAndDestroyedTarget(duel, targetZone = 'grave') {
  const haDesUid = addMonster(duel, HA_DES_FIXTURE_ID, 2, 0);
  const targetUid = addMonster(duel, TARGET_FIXTURE_ID, 1, 1);
  moveMonsterToOwnerZone(duel, targetUid, 1, targetZone);
  return { haDesUid, targetUid };
}

test('Zombyra perde exatamente 200 ATK e não altera DEF após destruir por batalha', () => {
  const duel = makeDuel();
  const { sourceUid, targetUid } = addZombyraAndDestroyedTarget(duel);
  const sourceBefore = findMonster(duel, sourceUid).monster;
  const beforeAtk = atk(sourceBefore, duel.core);
  const beforeDef = def(sourceBefore, duel.core);
  const beforeInventory = inventory(duel);

  const plan = adapter.prepareZombyra(
    duel,
    zombyraEvent(duel, sourceUid, targetUid, TARGET_FIXTURE_ID)
  );
  const result = adapter.resolveZombyra(duel, plan);
  const sourceAfter = findMonster(result.state, sourceUid).monster;

  assert.equal(result.status, 'reduced');
  assert.equal(result.targetAtk, Math.max(0, beforeAtk - ZOMBYRA_ATK_LOSS));
  assert.equal(atk(sourceAfter, result.state.core), Math.max(0, beforeAtk - ZOMBYRA_ATK_LOSS));
  assert.equal(def(sourceAfter, result.state.core), beforeDef);
  assert.deepEqual(inventory(result.state), beforeInventory);
});

test('perdas de Zombyra acumulam em eventos de batalha distintos', () => {
  const duel = makeDuel();
  const { sourceUid, targetUid } = addZombyraAndDestroyedTarget(duel);
  let state = adapter.resolveZombyra(
    duel,
    adapter.prepareZombyra(duel, zombyraEvent(duel, sourceUid, targetUid, TARGET_FIXTURE_ID, 'm610:z:first'))
  ).state;

  const secondTargetUid = addMonster(state, ZOMBYRA_FIXTURE_ID, 1, 1);
  moveMonsterToOwnerZone(state, secondTargetUid, 1, 'grave');
  const secondPlan = adapter.prepareZombyra(
    state,
    zombyraEvent(state, sourceUid, secondTargetUid, ZOMBYRA_FIXTURE_ID, 'm610:z:second')
  );
  state = adapter.resolveZombyra(state, secondPlan).state;

  const source = findMonster(state, sourceUid).monster;
  assert.equal(atk(source, state.core), Math.max(0, BASE_ZOMBYRA_ATK - ZOMBYRA_ATK_LOSS * 2));
});

test('recibo idempotente impede reaplicar o mesmo evento de Zombyra', () => {
  const duel = makeDuel();
  const { sourceUid, targetUid } = addZombyraAndDestroyedTarget(duel);
  const plan = adapter.prepareZombyra(duel, zombyraEvent(duel, sourceUid, targetUid, TARGET_FIXTURE_ID));
  const first = adapter.resolveZombyra(duel, plan);
  const second = adapter.resolveZombyra(first.state, plan);

  assert.equal(first.status, 'reduced');
  assert.equal(second.status, 'duplicate');
  assert.equal(atk(findMonster(second.state, sourceUid).monster, second.state.core), Math.max(0, BASE_ZOMBYRA_ATK - ZOMBYRA_ATK_LOSS));
});

test('negação da ativação de Zombyra não aplica perda de ATK', () => {
  const duel = makeDuel();
  const { sourceUid, targetUid } = addZombyraAndDestroyedTarget(duel);
  const before = atk(findMonster(duel, sourceUid).monster, duel.core);
  const plan = adapter.prepareZombyra(duel, zombyraEvent(duel, sourceUid, targetUid, TARGET_FIXTURE_ID));
  const result = adapter.resolveZombyra(duel, plan, { effectNegated: true });

  assert.equal(result.status, 'negated');
  assert.equal(atk(findMonster(result.state, sourceUid).monster, result.state.core), before);
});

test('Zombyra persiste a perda entre turnos e o reset de ATK temporário', () => {
  const duel = makeDuel();
  const { sourceUid, targetUid } = addZombyraAndDestroyedTarget(duel);
  const plan = adapter.prepareZombyra(duel, zombyraEvent(duel, sourceUid, targetUid, TARGET_FIXTURE_ID));
  const state = adapter.resolveZombyra(duel, plan).state;
  const source = findMonster(state, sourceUid).monster;

  state.core.turn++;
  source.atkBoost = 0;
  syncContinuous(state.core);

  assert.equal(atk(source, state.core), Math.max(0, BASE_ZOMBYRA_ATK - ZOMBYRA_ATK_LOSS));
});

test('virar Zombyra face-down remove a perda persistente; voltar face-up não a restaura', () => {
  const duel = makeDuel();
  const { sourceUid, targetUid } = addZombyraAndDestroyedTarget(duel);
  const plan = adapter.prepareZombyra(duel, zombyraEvent(duel, sourceUid, targetUid, TARGET_FIXTURE_ID));
  const state = adapter.resolveZombyra(duel, plan).state;
  const source = findMonster(state, sourceUid).monster;

  source.faceUp = false;
  source.position = 'def';
  source.atkBoost = 0;
  syncContinuous(state.core);
  source.faceUp = true;
  syncContinuous(state.core);

  assert.equal(atk(source, state.core), BASE_ZOMBYRA_ATK);
});

test('remover Zombyra do campo antes da resolução invalida o vínculo físico', () => {
  const duel = makeDuel();
  const { sourceUid, targetUid } = addZombyraAndDestroyedTarget(duel);
  const plan = adapter.prepareZombyra(duel, zombyraEvent(duel, sourceUid, targetUid, TARGET_FIXTURE_ID));
  moveMonsterToOwnerZone(duel, sourceUid, 0, 'grave');
  const result = adapter.resolveZombyra(duel, plan);

  assert.equal(result.status, 'source-left-field');
});

test('Zombyra que deixa de estar face-up antes da resolução não recebe a perda', () => {
  const duel = makeDuel();
  const { sourceUid, targetUid } = addZombyraAndDestroyedTarget(duel);
  const plan = adapter.prepareZombyra(duel, zombyraEvent(duel, sourceUid, targetUid, TARGET_FIXTURE_ID));
  const source = findMonster(duel, sourceUid).monster;
  source.faceUp = false;
  source.position = 'def';
  syncContinuous(duel.core);
  const result = adapter.resolveZombyra(duel, plan);

  assert.equal(result.status, 'source-no-longer-face-up');
});

test('a restrição de ataque direto de Zombyra respeita face-up e negação', () => {
  assert.equal(adapter.canZombyraAttackDirectly(ZOMBYRA_FIXTURE_ID, true), false);
  assert.equal(adapter.canZombyraAttackDirectly(ZOMBYRA_FIXTURE_ID, true, true), true);
  assert.equal(adapter.canZombyraAttackDirectly(ZOMBYRA_FIXTURE_ID, false), true);
  assert.equal(adapter.canZombyraAttackDirectly(TARGET_FIXTURE_ID, true), true);
});

test('Zombyra rejeita evento sem destruição por batalha ou antes da Damage Step', () => {
  const duel = makeDuel();
  const { sourceUid, targetUid } = addZombyraAndDestroyedTarget(duel);
  const event = zombyraEvent(duel, sourceUid, targetUid, TARGET_FIXTURE_ID);

  assert.throws(() => adapter.prepareZombyra(duel, { ...event, destroyedByBattle: false }));
  assert.throws(() => adapter.prepareZombyra(duel, { ...event, damageStepComplete: false }));
});

test('mão acima de seis permanece intacta; o adapter não antecipa descarte da End Phase', () => {
  const duel = makeDuel();
  const hand = privateZone(duel, 0, 'hand');
  const deck = privateZone(duel, 0, 'deck');
  hand.push(...deck.splice(0, 2));
  assert.equal(hand.length, 7);
  const beforeHand = hand.map(card => [card.uid, card.id]);
  const { sourceUid, targetUid } = addZombyraAndDestroyedTarget(duel);
  const plan = adapter.prepareZombyra(duel, zombyraEvent(duel, sourceUid, targetUid, TARGET_FIXTURE_ID));
  const result = adapter.resolveZombyra(duel, plan);

  assert.deepEqual(privateZone(result.state, 0, 'hand').map(card => [card.uid, card.id]), beforeHand);
  assert.equal(privateZone(result.state, 0, 'hand').length, 7);
});

test('Dark Ruler Ha Des nega o efeito do monstro de Efeito destruído por Fiend', () => {
  const duel = makeDuel();
  const { haDesUid, targetUid } = addHaDesAndDestroyedTarget(duel);
  const beforeInventory = inventory(duel);
  const plan = adapter.prepareHaDes(duel, haDesEvent(duel, haDesUid, targetUid));
  const result = adapter.resolveHaDes(duel, plan);

  assert.equal(result.status, 'applied');
  assert.equal(adapter.isHaDesEffectNegated(result.state, targetUid), true);
  assert.deepEqual(inventory(result.state), beforeInventory);
});

test('a negação de Ha Des sobrevive a JSON e permanece ligada à instância física', () => {
  const duel = makeDuel();
  const { haDesUid, targetUid } = addHaDesAndDestroyedTarget(duel, 'banished');
  const plan = adapter.prepareHaDes(duel, haDesEvent(duel, haDesUid, targetUid));
  const result = adapter.resolveHaDes(duel, plan);
  const restored = JSON.parse(JSON.stringify(result.state));

  assert.equal(result.status, 'applied');
  assert.equal(adapter.isHaDesEffectNegated(restored, targetUid), true);
});

test('Ha Des não aplica a negação quando seu efeito é negado', () => {
  const duel = makeDuel();
  const { haDesUid, targetUid } = addHaDesAndDestroyedTarget(duel);
  const plan = adapter.prepareHaDes(duel, haDesEvent(duel, haDesUid, targetUid));
  const result = adapter.resolveHaDes(duel, plan, { effectNegated: true });

  assert.equal(result.status, 'negated');
  assert.equal(adapter.isHaDesEffectNegated(result.state, targetUid), false);
});

test('Ha Des não nega um alvo que deixou o Cemitério antes da resolução', () => {
  const duel = makeDuel();
  const { haDesUid, targetUid } = addHaDesAndDestroyedTarget(duel);
  const plan = adapter.prepareHaDes(duel, haDesEvent(duel, haDesUid, targetUid));
  moveOwnerGraveToDeck(duel, targetUid);
  const result = adapter.resolveHaDes(duel, plan);

  assert.equal(result.status, 'target-left-destination');
  assert.equal(adapter.isHaDesEffectNegated(result.state, targetUid), false);
});

test('a negação de Ha Des termina quando a instância sai e retorna ao Cemitério', () => {
  const duel = makeDuel();
  const { haDesUid, targetUid } = addHaDesAndDestroyedTarget(duel);
  const plan = adapter.prepareHaDes(duel, haDesEvent(duel, haDesUid, targetUid));
  const result = adapter.resolveHaDes(duel, plan);
  assert.equal(adapter.isHaDesEffectNegated(result.state, targetUid), true);

  moveOwnerGraveToDeck(result.state, targetUid);
  moveOwnerDeckToGrave(result.state, targetUid);
  assert.equal(adapter.isHaDesEffectNegated(result.state, targetUid), false);
});

test('Ha Des exige destruidor Fiend e uma fonte Ha Des face-up na mesma equipe', () => {
  const duel = makeDuel();
  const { haDesUid, targetUid } = addHaDesAndDestroyedTarget(duel);
  const event = haDesEvent(duel, haDesUid, targetUid);
  assert.throws(() => adapter.prepareHaDes(duel, { ...event, destroyerId: ZOMBYRA_FIXTURE_ID }));

  const faceDown = makeDuel();
  const hiddenHaDes = addMonster(faceDown, HA_DES_FIXTURE_ID, 2, 0, false);
  const hiddenTarget = addMonster(faceDown, TARGET_FIXTURE_ID, 1, 1);
  moveMonsterToOwnerZone(faceDown, hiddenTarget, 1, 'grave');
  assert.throws(() => adapter.prepareHaDes(faceDown, haDesEvent(faceDown, hiddenHaDes, hiddenTarget)));
});

test('Dark Ruler Ha Des não pode ser Special Summoned do Cemitério, mesmo se seu efeito for negado', () => {
  assert.equal(adapter.canHaDesBeSpecialSummonedFrom(HA_DES_FIXTURE_ID, 'grave'), false);
  assert.equal(adapter.canHaDesBeSpecialSummonedFrom(HA_DES_FIXTURE_ID, 'banished'), true);
  assert.equal(adapter.canHaDesBeSpecialSummonedFrom(TARGET_FIXTURE_ID, 'grave'), true);
});

test('Deck 20 e 30 e Extra Deck 5 são aceitos; 19, 31 e Extra 6 são rejeitados', () => {
  assert.doesNotThrow(() => makeDuel(0, BASE_DECK));
  assert.doesNotThrow(() => makeDuel(0, MAX_DECK));
  assert.throws(() => makeDuel(0, BASE_DECK.slice(1)));
  assert.throws(() => makeDuel(0, [...MAX_DECK, NORMAL_IDS[26]]));
  assert.doesNotThrow(() => makeDuel(0, BASE_DECK, { 0: FUSION_IDS.slice(0, 5) }));
  assert.throws(() => makeDuel(0, BASE_DECK, { 0: FUSION_IDS.slice(0, 6) }));
});

test('limites 3+3 são aplicados; quatro monstros ou quatro cartas na retaguarda são rejeitados', () => {
  const monsters = makeDuel();
  for (let i = 0; i < 4; i++) addAnyMonster(monsters, i % 2 === 0 ? 0 : 2, 0);
  assert.throws(() => adapter.prepareZombyra(monsters, {}));

  const backrow = makeDuel();
  for (let i = 0; i < 4; i++) addAnyBackrow(backrow, i % 2 === 0 ? 0 : 2, 0);
  assert.throws(() => adapter.prepareZombyra(backrow, {}));
});

test('três Monster Zones e três Spell/Trap Zones são válidas sem tocar na mão ou inventário', () => {
  const duel = makeDuel();
  const sourceUid = addMonster(duel, ZOMBYRA_FIXTURE_ID, 2, 0);
  const targetUid = addMonster(duel, TARGET_FIXTURE_ID, 1, 1);
  addAnyMonster(duel, 0, 0);
  addAnyMonster(duel, 2, 0);
  addAnyBackrow(duel, 0, 0);
  addAnyBackrow(duel, 2, 0);
  addAnyBackrow(duel, 0, 0);
  moveMonsterToOwnerZone(duel, targetUid, 1, 'grave');

  const plan = adapter.prepareZombyra(duel, zombyraEvent(duel, sourceUid, targetUid, TARGET_FIXTURE_ID));
  assert.equal(plan.loss, ZOMBYRA_ATK_LOSS);
});

test('recibos de Zombyra e Ha Des não concedem, removem nem duplicam cartas', () => {
  const duel = makeDuel();
  const { sourceUid, targetUid } = addZombyraAndDestroyedTarget(duel);
  const before = inventory(duel);
  const plan = adapter.prepareZombyra(duel, zombyraEvent(duel, sourceUid, targetUid, TARGET_FIXTURE_ID));
  const result = adapter.resolveZombyra(duel, plan);
  assert.deepEqual(inventory(result.state), before);

  const haDesDuel = makeDuel();
  const { haDesUid, targetUid: haDesTargetUid } = addHaDesAndDestroyedTarget(haDesDuel);
  const haDesBefore = inventory(haDesDuel);
  const haDesPlan = adapter.prepareHaDes(haDesDuel, haDesEvent(haDesDuel, haDesUid, haDesTargetUid));
  const haDesResult = adapter.resolveHaDes(haDesDuel, haDesPlan);
  assert.deepEqual(inventory(haDesResult.state), haDesBefore);
});
