const {test} = require('node:test');
const assert = require('node:assert/strict');
const {tag,createGame,addToHand,deployMonster,setBackrow,act} = require('./helpers/tagClassic2v2.cjs');

test('three Monster and three Spell/Trap zones are shared by teammates but independent between teams', () => {
  let s = createGame(2);
  s.core.turn = 3;
  deployMonster(s, 0, tag.tagNormalCardIds[0], 'blue-1');
  deployMonster(s, 2, tag.tagNormalCardIds[1], 'blue-2');
  deployMonster(s, 0, tag.tagNormalCardIds[2], 'blue-3');
  setBackrow(s, 0, '04206964', 'blue-hole-1');
  setBackrow(s, 2, '53582587', 'blue-torrent');
  setBackrow(s, 0, '77414722', 'blue-jammer');
  const spareMonster = addToHand(s, 2, tag.tagNormalCardIds[3], 'blocked-summon');
  const spareTrap = addToHand(s, 2, '04206964', 'blocked-set');

  assert.equal(s.core.players[0].monsters.length, 3);
  assert.equal(s.core.players[0].backrow.length, 3);
  const blueActions = tag.tagActions(s, 'p2');
  assert.equal(blueActions.some(a => a.kind === 'summon' && a.card === spareMonster.uid), false);
  assert.equal(blueActions.some(a => a.kind === 'set' && a.card === spareTrap.uid), false);

  s = act(s, 2, 'end');
  assert.equal(tag.tagDecisionMember(s).id, 'p3');
  assert.ok(tag.tagActions(s, 'p3').some(a => a.kind === 'summon'));
});
