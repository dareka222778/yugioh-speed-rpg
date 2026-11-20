const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createGame,deployMonster,act,passAll,normalCard} = require('./helpers/tagClassic2v2.cjs');
const {getPlayableCard} = require('../dist/effectRegistry');

test('D.D. Crazy Beast sends only the battle-destroyed victim to the opposing team banished zone', () => {
  let s = createGame(2);
  s.core.turn = 3;
  const sourceInfo = getPlayableCard('48148828');
  const victimInfo = normalCard(c => c.id !== sourceInfo.id && c.atk < sourceInfo.atk);
  const source = deployMonster(s, 2, sourceInfo.id, 'dd-crazy-beast');
  const victim = deployMonster(s, 3, victimInfo.id, 'victim');
  s = act(s, 2, 'battle');
  s = act(s, 2, 'attack', a => a.card === source.uid && a.target === victim.uid);
  s = passAll(s);

  assert.ok(s.core.players[1].banished.some(c => c.uid === victim.uid));
  assert.equal(s.core.players[1].grave.some(c => c.uid === victim.uid), false);
  assert.ok(s.core.players[0].monsters.some(m => m.uid === source.uid));
  assert.equal(s.core.players[0].banished.some(c => c.uid === victim.uid), false);
});
