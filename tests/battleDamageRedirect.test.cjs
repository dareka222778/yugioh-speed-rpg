const { test } = require('node:test');
const assert = require('node:assert/strict');

const { redirectControllerBattleDamage } = require('../dist/battleDamageRedirect.js');
const { combatRuleIssues, combatRuleText } = require('../dist/combatRules.js');
const { continuousRuleIssues } = require('../dist/continuousRules.js');
const { monsterDefinitionIssues } = require('../dist/monsterEffects.js');
const { withCatalog } = require('../dist/catalogContext.js');
const { combatOutcome } = require('../dist/combatEffects.js');
const { battleEffectMonsters45 } = require('../dist/battleEffectBatch45.js');

const SWORDS_WOMAN = '94004268';
const ATOMIC_FIREFLY = '87340664';
const OPPONENT = 'm369-opponent';

function card(id, name, atk, defense, race = 'Warrior') {
  return {
    id,
    konamiId: 999999,
    name,
    englishName: name,
    kind: 'monster',
    race,
    attribute: 'EARTH',
    level: 4,
    atk,
    defense,
    summary: 'M369 isolated test metadata',
    source: 'M369 fixture',
    monsterType: 'effect',
  };
}

const cards = [
  card(SWORDS_WOMAN, 'Amazoness Swords Woman', 1500, 1600),
  card(ATOMIC_FIREFLY, 'Atomic Firefly', 1000, 800, 'Insect'),
  card(OPPONENT, 'M369 Opponent', 2000, 1000, 'Beast'),
];

function makeCatalog() {
  const metadata = new Map(cards.map(value => [value.id, value]));
  const statuses = new Map(cards.map(value => [value.id, { stage: 'certified' }]));
  return {
    id: 'm369-battle-effects-isolated',
    data: {
      format: 1,
      engineVersion: 'engine-v9',
      cards,
      effects: {},
      monsters: battleEffectMonsters45,
      certificates: {},
    },
    metadata,
    effects: new Map(),
    statuses,
    enabled: cards.map(value => value.id),
  };
}

function monster(uid, id, position = 'atk', faceUp = true) {
  return {
    uid,
    id,
    owner: 0,
    faceUp,
    position,
    atkBoost: 0,
    defBoost: 0,
    entered: 1,
    changed: 1,
    attacked: 0,
  };
}

function battle({
  attackerTeam = 0,
  attackerId = SWORDS_WOMAN,
  defenderId = OPPONENT,
  attackerFaceUp = true,
  defenderFaceUp = true,
  attackerPosition = 'atk',
  defenderPosition = 'atk',
  attackerPower = 1500,
  defenderPower = 2000,
  protectedTeam,
} = {}) {
  const players = [
    { monsters: [], backrow: [], field: null },
    { monsters: [], backrow: [], field: null },
  ];
  const attacker = monster('m369-attacker', attackerId, attackerPosition, attackerFaceUp);
  const defender = monster('m369-defender', defenderId, defenderPosition, defenderFaceUp);
  players[attackerTeam].monsters.push(attacker);
  players[1 - attackerTeam].monsters.push(defender);

  const state = {
    players,
    turn: 1,
    current: attackerTeam,
    phase: 'battle',
    resume: 'main',
    pending: { kind: 'none' },
  };
  const stats = new Map([
    [attacker.uid, { atk: attackerPower, def: 1600 }],
    [defender.uid, { atk: defenderPower, def: 1000 }],
  ]);
  const services = {
    attack: value => stats.get(value.uid).atk,
    defense: value => stats.get(value.uid).def,
    protected: (_state, team) => team === protectedTeam,
  };

  return withCatalog(makeCatalog(), () => combatOutcome(state, attackerTeam, attacker, defender, services));
}

test('redirectControllerDamage is a valid combat rule with no extra fields', () => {
  assert.deepEqual(combatRuleIssues({ kind: 'redirectControllerDamage' }), []);
  assert.deepEqual(
    combatRuleIssues({ kind: 'redirectControllerDamage', amount: 500 }),
    ['invalid-battle-damage-redirect'],
  );
});

test('continuous combat rule accepts the self-only redirection rule', () => {
  assert.deepEqual(continuousRuleIssues([{
    kind: 'combat',
    filter: { selfOnly: true },
    rule: { kind: 'redirectControllerDamage' },
  }]), []);
});

test('Amazoness Swords Woman definition passes the existing monster admission validator', () => {
  const definition = battleEffectMonsters45[SWORDS_WOMAN];
  assert.deepEqual(monsterDefinitionIssues(definition), []);
  assert.equal(definition.effect.trigger, 'continuous');
  assert.equal(definition.effect.operation.rules[0].filter.selfOnly, true);
});

test('Atomic Firefly reuses the mandatory battle-destroyed burn operation', () => {
  const definition = battleEffectMonsters45[ATOMIC_FIREFLY];
  assert.deepEqual(monsterDefinitionIssues(definition), []);
  assert.equal(definition.effect.trigger, 'onBattleDestroyed');
  assert.deepEqual(definition.effect.operation, { kind: 'burn', amount: 1000 });
});

test('combat rule text describes opponent-side battle damage redirection', () => {
  assert.match(combatRuleText({ kind: 'redirectControllerDamage' }), /dano de batalha.*oponente/);
});

test('attacking Amazoness Swords Woman redirects damage her team would receive', () => {
  const result = battle({ attackerPower: 1500, defenderPower: 2000 });
  assert.deepEqual(result.damage, [0, 500]);
  assert.ok(result.destroy.includes('m369-attacker'));
});

test('defending Amazoness Swords Woman redirects damage her team would receive', () => {
  const result = battle({
    attackerId: OPPONENT,
    defenderId: SWORDS_WOMAN,
    attackerPower: 2000,
    defenderPower: 1500,
  });
  assert.deepEqual(result.damage, [500, 0]);
  assert.ok(result.destroy.includes('m369-defender'));
});

test('damage already dealt to the opponent is not redirected a second time', () => {
  const result = battle({ attackerPower: 1700, defenderPower: 1000 });
  assert.deepEqual(result.damage, [0, 700]);
});

test('a Swords Woman elsewhere on the shared team field does not redirect another monster battle', () => {
  const players = [
    { monsters: [monster('m369-swords', SWORDS_WOMAN), monster('m369-attacker', OPPONENT)], backrow: [], field: null },
    { monsters: [monster('m369-defender', OPPONENT)], backrow: [], field: null },
  ];
  const state = {
    players,
    turn: 1,
    current: 0,
    phase: 'battle',
    resume: 'main',
    pending: { kind: 'none' },
  };
  const stats = new Map([
    ['m369-attacker', { atk: 1500, def: 1000 }],
    ['m369-defender', { atk: 2000, def: 1000 }],
  ]);
  const services = {
    attack: value => stats.get(value.uid).atk,
    defense: value => stats.get(value.uid).def,
    protected: () => false,
  };
  const result = withCatalog(makeCatalog(), () =>
    combatOutcome(state, 0, players[0].monsters[1], players[1].monsters[0], services));
  assert.deepEqual(result.damage, [500, 0]);
});

test('a face-down Swords Woman does not provide its continuous redirection', () => {
  const players = [
    { monsters: [monster('m369-swords', SWORDS_WOMAN, 'def', false), monster('m369-attacker', OPPONENT)], backrow: [], field: null },
    { monsters: [monster('m369-defender', OPPONENT)], backrow: [], field: null },
  ];
  const state = {
    players,
    turn: 1,
    current: 0,
    phase: 'battle',
    resume: 'main',
    pending: { kind: 'none' },
  };
  const stats = new Map([
    ['m369-attacker', { atk: 1500, def: 1000 }],
    ['m369-defender', { atk: 2000, def: 1000 }],
  ]);
  const services = {
    attack: value => stats.get(value.uid).atk,
    defense: value => stats.get(value.uid).def,
    protected: () => false,
  };
  const result = withCatalog(makeCatalog(), () =>
    combatOutcome(state, 0, players[0].monsters[1], players[1].monsters[0], services));
  assert.deepEqual(result.damage, [500, 0]);
});

test('battle protection is applied before redirection and cannot be bypassed', () => {
  const result = battle({ protectedTeam: 0, attackerPower: 1500, defenderPower: 2000 });
  assert.deepEqual(result.damage, [0, 0]);
});

test('redirection works symmetrically when the attacking team is team 1', () => {
  const result = battle({ attackerTeam: 1, attackerPower: 1500, defenderPower: 2000 });
  assert.deepEqual(result.damage, [500, 0]);
});

test('pure redirect helper uses the original damage snapshot and does not mutate input', () => {
  const damage = [700, 0];
  const result = redirectControllerBattleDamage(damage, 0, true, true);
  assert.deepEqual(result, [0, 700]);
  assert.deepEqual(damage, [700, 0]);
});

test('pure redirect helper redirects defender damage toward the attacking team', () => {
  assert.deepEqual(redirectControllerBattleDamage([0, 900], 0, false, true), [900, 0]);
});

test('pure redirect helper validates teams, damage and flags', () => {
  assert.throws(() => redirectControllerBattleDamage([-1, 0], 0, true, false), /non-negative/);
  assert.throws(() => redirectControllerBattleDamage([0, 1.5], 0, true, false), /non-negative/);
  assert.throws(() => redirectControllerBattleDamage([0, 0], 2, true, false), /team/);
  assert.throws(() => redirectControllerBattleDamage([0, 0], 0, 1, false), /booleans/);
});
