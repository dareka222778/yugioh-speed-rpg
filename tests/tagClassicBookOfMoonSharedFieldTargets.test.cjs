'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');

const BOOK_OF_MOON='14087893';
assert.ok(getPlayableCard(BOOK_OF_MOON)?.kind==='spell','Book of Moon must be certified and playable');
assert.equal(getEffect(BOOK_OF_MOON)?.kind,'bookOfMoon');
assert.equal(getActivationModel(getEffect(BOOK_OF_MOON))?.speed,2);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm137-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
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
  throw new Error('M137 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,{faceUp=true,position='atk'}={}){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
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
    assert.ok(pass);
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
for(const targetSeat of [2,3])test('Book of Moon can target a face-up shared-field monster physically owned by seat '+targetSeat,()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M137 Seat '+seat,
    cards:deck(seat===0?[BOOK_OF_MOON]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m137-book-of-moon-seat-'+targetSeat});
  const book=takeCard(state,0,BOOK_OF_MOON);
  holder(state,0).hand.push(book);
  const ownPartner=deploy(state,2,normal[0].id);
  const opposing=deploy(state,3,normal[1].id);
  const alreadySet=deploy(state,1,normal[2].id,{faceUp:false,position:'def'});
  state.core.turn=3;
  const target=targetSeat===2?ownPartner:opposing;
  const other=targetSeat===2?opposing:ownPartner;
  assert.match(target.uid,new RegExp('^m'+targetSeat+':'));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===book.uid&&candidate.target===target.uid
  );
  assert.ok(action,'Book of Moon must offer the face-up target on either shared team');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'inactive physical teammate cannot execute the Main Phase action');
  assert.ok(!tag.tagActions(state,member(0)).some(candidate=>
    candidate.kind==='spell'&&candidate.card===book.uid&&candidate.target===alreadySet.uid
  ),'Book of Moon cannot target a monster that is already face-down');
  state=settle(tag.stepTagDuel(state,member(0),action));
  assert.equal(state.core.phase,'main');
  const team=targetSeat%2;
  const changed=state.core.players[team].monsters.find(card=>card.uid===target.uid);
  assert.ok(changed,'the target remains on its original team field');
  assert.equal(changed.faceUp,false,'Book of Moon turns the target face-down');
  assert.equal(changed.position,'def','Book of Moon places the target in Defense Position');
  assert.equal(changed.uid,target.uid,'Book of Moon preserves the physical UID');
  assert.equal(changed.id,target.id,'Book of Moon preserves the card identity');
  const untouched=state.core.players[other.owner].monsters.find(card=>card.uid===other.uid);
  assert.ok(untouched);
  assert.equal(untouched.faceUp,true,'the non-target monster remains face-up');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===book.uid));
  assert.deepEqual(state.core.players.map(player=>player.lp),[4000,4000]);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
