const {test} = require('node:test');
const assert = require('node:assert/strict');
const {tag,createGame,deployMonster,act} = require('./helpers/tagClassic2v2.cjs');

test('Cannon Soldier ignition is available in Main Phase and absent in Battle Phase for the active teammate', () => {
  let s = createGame(0);
  s.core.turn = 3;
  const cannon = deployMonster(s, 0, '11384280', 'cannon-soldier');
  const tribute = deployMonster(s, 2, tag.tagNormalCardIds[0], 'shared-tribute');

  const mainActions = tag.tagActions(s, 'p0');
  assert.ok(mainActions.some(a => a.kind === 'monsterEffect' && a.card === cannon.uid && a.tributes?.includes(tribute.uid)));

  s = act(s, 0, 'battle');
  assert.equal(s.core.phase, 'battle');
  assert.equal(tag.tagDecisionMember(s).id, 'p0');
  assert.equal(tag.tagActions(s, 'p0').some(a => a.kind === 'monsterEffect' && a.card === cannon.uid), false);
});
