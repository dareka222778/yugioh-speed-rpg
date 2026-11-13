'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const DE_SPELL='19159413';
const BOOK='14087893';
const TORRENTIAL='53582587';
assert.ok(getPlayableCard(DE_SPELL)?.kind==='spell');
assert.equal(getEffect(DE_SPELL)?.kind,'deSpell');
assert.ok(getPlayableCard(BOOK)?.kind==='spell');
assert.ok(getPlayableCard(TORRENTIAL)?.kind==='trap');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const deckIds=normal.slice(0,7).map(entry=>entry.id);
function member(seat){return 'm117-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...deckIds])];
  assert.ok(ids.length>=7);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function takeCard(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M117 fixture card missing from physical seat '+seat+': '+id);
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80);
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'De-Spell must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function setup(targetId,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M117 Seat '+seat,
    cards:deck(seat===2?[DE_SPELL]:seat===3?[targetId]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  const before=inventorySnapshot(state);
  const deSpellCard=takeCard(state,2,DE_SPELL);
  const targetCard=takeCard(state,3,targetId);
  const deSpell={...deSpellCard,setTurn:0,faceUp:false};
  const target={...targetCard,setTurn:0,faceUp:false};
  state.core.players[0].backrow.push(deSpell);
  state.core.players[1].backrow.push(target);
  state.core.turn=3;
  assert.match(deSpell.uid,/^m2:/,'De-Spell must retain inactive seat 2 physical ownership');
  assert.match(target.uid,/^m3:/,'the revealed opposing card must retain inactive seat 3 physical ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,before,deSpell,target};
}
function activate(state,deSpell,target){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===deSpell.uid&&candidate.target===target.uid
  );
  assert.ok(action,'the active physical seat must activate its inactive partner Set De-Spell against the hidden target');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical owner of De-Spell cannot receive Main Phase actions');
  return tag.stepTagDuel(state,member(0),action);
}

test('De-Spell reveals and destroys a partner-owned opposing Set Spell',()=>{
  const {state:initial,before,deSpell,target}=setup(BOOK,'m117-de-spell-hidden-spell');
  const publicBefore=tag.publicTagDuel(initial);
  for(const [id,card] of [[DE_SPELL,deSpell],[BOOK,target]]){
    assert.ok(!JSON.stringify(publicBefore).includes(id),'Set card identity must remain private: '+id);
    assert.ok(!JSON.stringify(publicBefore).includes(card.uid),'Set card UID must remain private: '+card.uid);
  }
  const state=activate(initial,deSpell,target);
  assert.equal(state.core.phase,'main',
    'with no legal response, De-Spell resolves immediately');
  assert.equal(state.core.players[1].backrow.some(card=>card.uid===target.uid),false,
    'the revealed Set Spell must be destroyed');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===target.uid),
    'the destroyed Spell goes to the opposing shared Graveyard');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===deSpell.uid),
    'De-Spell goes to the activating shared Graveyard');
  assert.ok(state.core.log.some(line=>line.includes('Livro da Lua')),
    'the reveal must be recorded in the public duel log');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

test('De-Spell reveals a Set Trap but leaves it face-down and on the field',()=>{
  const {state:initial,before,deSpell,target}=setup(TORRENTIAL,'m117-de-spell-hidden-trap');
  const publicBefore=tag.publicTagDuel(initial);
  assert.ok(!JSON.stringify(publicBefore).includes(TORRENTIAL));
  assert.ok(!JSON.stringify(publicBefore).includes(target.uid));
  const state=activate(initial,deSpell,target);
  assert.equal(state.core.phase,'main',
    'with no legal response, De-Spell resolves immediately');
  const remaining=state.core.players[1].backrow.find(card=>card.uid===target.uid);
  assert.ok(remaining,'a revealed Trap must remain in the shared backrow');
  assert.equal(remaining.faceUp,false,'the revealed Trap is turned face-down again');
  assert.ok(!state.core.players[1].grave.some(card=>card.uid===target.uid),
    'De-Spell must not destroy a Trap');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===deSpell.uid));
  assert.ok(state.core.log.some(line=>line.includes('Tributo Torrencial')),
    'the revealed Trap identity must be recorded in the duel log');
  assert.ok(!JSON.stringify(tag.publicTagDuel(state)).includes(TORRENTIAL),
    'after the reveal resolves, the Trap remains hidden in the public field projection');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
