const {test} = require('node:test');
const assert = require('node:assert/strict');
const {tag,atk,def,createGame,addToHand,deployMonster,act,passAll,normalCard} = require('./helpers/tagClassic2v2.cjs');

test('Fairy Meteor Crush lets the active teammate deal piercing damage through a shared-field ally', () => {
  let s = createGame(2);
  s.core.turn = 3;
  const attackerInfo = tag.tagNormalCardIds.map(id => tag.getPlayableCard ? tag.getPlayableCard(id) : require('../dist/effectRegistry').getPlayableCard(id))
    .filter(c => c && typeof c.atk === 'number')
    .sort((a,b) => b.atk - a.atk)[0];
  assert.ok(attackerInfo);
  const defenderInfo = normalCard(c => c.id !== attackerInfo.id && typeof c.defense === 'number' && c.defense < attackerInfo.atk);
  const attacker = deployMonster(s, 0, attackerInfo.id, 'partner-attacker');
  const defender = deployMonster(s, 3, defenderInfo.id, 'opponent-defender', {position:'def'});
  const equip = addToHand(s, 2, '97687912', 'fairy-meteor-crush');

  s = act(s, 2, 'spell', a => a.card === equip.uid && a.target === attacker.uid);
  s = passAll(s);
  assert.ok(s.core.players[0].backrow.some(c => c.uid === equip.uid && c.equippedTo === attacker.uid));

  const liveAttacker = s.core.players[0].monsters.find(m => m.uid === attacker.uid);
  const liveDefender = s.core.players[1].monsters.find(m => m.uid === defender.uid);
  const expectedPiercing = atk(liveAttacker, s.core) - def(liveDefender, s.core);
  assert.ok(expectedPiercing > 0);
  s = act(s, 2, 'battle');
  s = act(s, 2, 'attack', a => a.card === attacker.uid && a.target === defender.uid);
  s = passAll(s);

  assert.equal(s.core.players[1].lp, 4000 - expectedPiercing);
  assert.ok(s.core.players[1].grave.some(c => c.uid === defender.uid));
});
