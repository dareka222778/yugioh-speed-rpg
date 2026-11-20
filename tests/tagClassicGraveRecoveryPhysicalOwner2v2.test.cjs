const {test} = require('node:test');
const assert = require('node:assert/strict');
const {tag,createGame,deployMonster,putInGrave,act,actCurrent,passAll} = require('./helpers/tagClassic2v2.cjs');

test('Magician of Faith recovers a shared-Graveyard Spell to its inactive physical owner hand', () => {
  let s = createGame(2);
  s.core.turn = 3;
  const faith = deployMonster(s, 2, '31560081', 'magician-of-faith', {faceUp:false,position:'def'});
  const partnerSpell = putInGrave(s, 0, '14087893', 'partner-book-of-moon');

  s = act(s, 2, 'position', a => a.card === faith.uid && a.mode === 'flip');
  s = passAll(s);
  assert.equal(s.core.phase, 'choice');
  assert.ok(s.core.choice.targets.includes(partnerSpell.uid));
  s = actCurrent(s, 'choose', a => a.target === partnerSpell.uid);
  s = passAll(s);

  assert.ok(tag.tagMemberHand(s, 'p0').some(c => c.uid === partnerSpell.uid));
  assert.equal(tag.tagMemberHand(s, 'p2').some(c => c.uid === partnerSpell.uid), false);
});
