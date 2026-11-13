'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect,isQuickPlaySpell}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');
const {getMonsterEffect}=require('../dist/monsterEffects');

const BOOK='14087893';
const SKELENGEL='60694662';
assert.ok(getPlayableCard(BOOK)?.kind==='spell');
assert.equal(getEffect(BOOK)?.kind,'bookOfMoon');
assert.equal(isQuickPlaySpell(BOOK),true);
assert.equal(getActivationModel(getEffect(BOOK))?.speed,2);
assert.equal(getMonsterEffect(SKELENGEL)?.trigger,'flip',
  'Skelengel must be a certified FLIP-effect target');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const deckIds=normal.slice(0,7).map(entry=>entry.id);
function member(seat){return 'm114-seat-'+seat;}
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
  throw new Error('M114 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
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
  assert.equal(cards.length,before.size,'Book of Moon must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Book of Moon response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}

test('active teammate may use an inactive partner Set Book of Moon without triggering the target FLIP effect',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M114 Seat '+seat,
    cards:deck(seat===2?[BOOK]:seat===3?[SKELENGEL]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m114-book-of-moon-set-partner-flip-privacy'});
  const before=inventorySnapshot(state);
  const bookCard=takeCard(state,2,BOOK);
  const book={...bookCard,setTurn:0,faceUp:false};
  state.core.players[0].backrow.push(book);
  const target=deploy(state,3,SKELENGEL);
  state.core.turn=3;
  const defenderHandBefore=tag.tagMemberHand(state,member(1)).map(card=>card.uid);
  const defenderDeckBefore=holder(state,1).deck.length;
  assert.match(book.uid,/^m2:/,'the Set Quick-Play Spell must retain inactive seat 2 ownership');
  assert.match(target.uid,/^m3:/,'the target FLIP monster must retain seat 3 physical ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const publicBefore=tag.publicTagDuel(state);
  assert.ok(!JSON.stringify(publicBefore).includes(BOOK),'the Set Quick-Play Spell identity must remain private');
  assert.ok(!JSON.stringify(publicBefore).includes(book.uid),'the Set Quick-Play Spell UID must remain private');

  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===book.uid&&candidate.target===target.uid
  );
  assert.ok(action,'the active physical teammate must activate the inactive partner Set Book of Moon');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical Set Spell owner must not receive Main Phase actions');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(2),action),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged);
  state=settle(tag.stepTagDuel(state,member(0),action));

  const setTarget=state.core.players[1].monsters.find(card=>card.uid===target.uid);
  assert.ok(setTarget,'Book of Moon must not move the targeted monster between team fields');
  assert.equal(setTarget.faceUp,false);
  assert.equal(setTarget.position,'def');
  assert.equal(tag.tagMemberHand(state,member(1)).length,defenderHandBefore.length,
    'setting Skelengel face-down is not a Flip Summon and must not draw');
  assert.deepEqual(tag.tagMemberHand(state,member(1)).map(card=>card.uid),defenderHandBefore);
  assert.equal(holder(state,1).deck.length,defenderDeckBefore,
    'the FLIP effect must not consume a card from the opposing active Deck');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===book.uid),
    'the activated Quick-Play Spell goes to the shared activating-team Graveyard');
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
