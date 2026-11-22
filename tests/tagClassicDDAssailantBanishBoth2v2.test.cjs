const {test} = require('node:test');
const assert = require('node:assert/strict');
const {tag,createGame,deployMonster,act,passAll,normalCard} = require('./helpers/tagClassic2v2.cjs');

test('D.D. Assailant banishes itself and the opposing battle victim to their team banished zones', () => {
  let s = createGame(2);
  s.core.turn = 3;
  const assailant = deployMonster(s, 2, '70074904', 'dd-assailant');
  const victimInfo = normalCard(c => c.id !== assailant.id && typeof c.atk === 'number');
  const victim = deployMonster(s, 3, victimInfo.id, 'equal-atk-victim', {
    atkBoost: 1700 - victimInfo.atk
  });

  s = act(s, 2, 'battle');
  s = act(s, 2, 'attack', a => a.card === assailant.uid && a.target === victim.uid);
  s = passAll(s);

  assert.ok(s.core.players[0].banished.some(c => c.uid === assailant.uid));
  assert.ok(s.core.players[1].banished.some(c => c.uid === victim.uid));
  assert.equal(s.core.players[0].grave.some(c => c.uid === assailant.uid), false);
  assert.equal(s.core.players[1].grave.some(c => c.uid === victim.uid), false);
});
