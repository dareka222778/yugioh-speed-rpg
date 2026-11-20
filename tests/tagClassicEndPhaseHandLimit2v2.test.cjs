const {test} = require('node:test');
const assert = require('node:assert/strict');
const {tag,createGame,addToHand,act,tagMemberHand,passAll} = require('./helpers/tagClassic2v2.cjs');

test('current classic 2v2 permits seven cards during the turn, then requires one discard to six in End Phase', () => {
  let s = createGame(0);
  s.core.turn = 3;
  for (let i = 0; i < 3; i++) addToHand(s, 0, tag.tagNormalCardIds[i], `end-phase-overflow-${i}`);
  assert.equal(tagMemberHand(s, 'p0').length, 7);
  assert.equal(s.core.phase, 'main');
  assert.equal(tag.tagActions(s, 'p0').some(a => a.kind === 'discard'), false);

  s = act(s, 0, 'end');
  s = passAll(s);
  assert.equal(s.core.phase, 'discard');
  assert.equal(tag.tagDecisionMember(s).id, 'p0');
  assert.equal(tagMemberHand(s, 'p0').length, 7);

  const chosen = tagMemberHand(s, 'p0')[0].uid;
  s = act(s, 0, 'discard', a => a.card === chosen);
  assert.equal(tagMemberHand(s, 'p0').length, 6);
  assert.equal(s.core.phase, 'main');
  assert.equal(tag.tagDecisionMember(s).id, 'p1');
});
