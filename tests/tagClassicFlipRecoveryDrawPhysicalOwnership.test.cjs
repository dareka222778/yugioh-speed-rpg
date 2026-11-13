'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterDefinition,getMonsterEffect}=require('../dist/monsterEffects');

const MAGICIAN_OF_FAITH='31560081';
const MASK_OF_DARKNESS='28933734';
const SKELENGEL='60694662';
const MST='05318639';
const TORRENTIAL='53582587';
for(const [id,operation,cardKind] of [
  [MAGICIAN_OF_FAITH,'recover','spell'],
  [MASK_OF_DARKNESS,'recover','trap'],
  [SKELENGEL,'draw',undefined]
]){
  assert.ok(getPlayableCard(id)?.kind==='monster','flip monster must be certified and playable: '+id);
  assert.equal(getMonsterEffect(id)?.trigger,'flip');
  assert.equal(getMonsterEffect(id)?.operation.kind,operation);
  if(cardKind)assert.equal(getMonsterEffect(id)?.operation.cardKind,cardKind);
  assert.equal(getMonsterDefinition(id)?.activation.policy,'mandatory');
}
const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7);
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm141-seat-'+seat;}
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
  throw new Error('M141 fixture card missing from physical seat '+seat+': '+id);
}
function setFlipMonster(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'def',faceUp:false,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
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
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function flip(state,source){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='position'&&candidate.card===source.uid&&candidate.mode==='flip'
  );
  assert.ok(action,'active seat 0 must be able to Flip Summon the source monster');
  return tag.stepTagDuel(state,member(0),action);
}
function choose(state,targetUid){
  assert.equal(state.core.phase,'choice');
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='choose'&&candidate.target===targetUid
  );
  assert.ok(action,'the recovered physical UID must be offered as a legal choice');
  return tag.stepTagDuel(state,member(0),action);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the flip-effect response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass);
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}

for(const entry of [
  {id:MAGICIAN_OF_FAITH,name:'Magician of Faith',recoverId:MST,owner:2},
  {id:MASK_OF_DARKNESS,name:'Mask of Darkness',recoverId:TORRENTIAL,owner:3}
])test(entry.name+' returns a recovered shared-Graveyard card to its physical owner hand',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M141 Seat '+seat,
    cards:deck(seat===0?[entry.id]:seat===entry.owner?[entry.recoverId]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m141-recover-'+entry.id});
  const source=setFlipMonster(state,0,entry.id);
  const recovered=takeCard(state,entry.owner,entry.recoverId);
  state.core.players[0].grave.push(recovered);
  state.core.turn=3;
  assert.match(source.uid,/^m0:/);
  assert.match(recovered.uid,new RegExp('^m'+entry.owner+':'));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  state=flip(state,source);
  assert.equal(state.core.phase,'choice');
  state=choose(state,recovered.uid);
  state=settle(state);
  assert.equal(state.core.phase,'main');
  assert.ok(tag.tagMemberHand(state,member(entry.owner)).some(card=>card.uid===recovered.uid),
    'recovered card must return to its original physical owner');
  assert.ok(!tag.tagMemberHand(state,member(0)).some(card=>card.uid===recovered.uid),
    'active FLIP controller must not steal the inactive physical owner card');
  assert.ok(!state.core.players[0].grave.some(card=>card.uid===recovered.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

test('Skelengel draws from the active physical seat Deck and may leave seven cards during Main Phase',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M141 Seat '+seat,
    cards:deck(seat===2?[SKELENGEL]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m141-skelengel-active-physical-deck'});
  const source=setFlipMonster(state,2,SKELENGEL);
  const extraHandCard=takeCard(state,0,normalIds[0]);
  holder(state,0).hand.push(extraHandCard);
  state.core.turn=3;
  assert.match(source.uid,/^m2:/);
  assert.equal(tag.tagMemberHand(state,member(0)).length,6,
    'fixture begins at the six-card hand limit before the Main Phase flip effect');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const handBefore=tag.tagMemberHand(state,member(0)).map(card=>card.uid);
  const partnerHandBefore=tag.tagMemberHand(state,member(2)).map(card=>card.uid);
  const partnerDeckBefore=holder(state,2).deck.map(card=>card.uid);
  const topUid=holder(state,0).deck[0].uid;
  state=settle(flip(state,source));
  assert.equal(state.core.phase,'main');
  assert.deepEqual(tag.tagMemberHand(state,member(0)).map(card=>card.uid),handBefore.concat(topUid),
    'Skelengel draws the top card from the active physical seat 0 Deck');
  assert.equal(tag.tagMemberHand(state,member(0)).length,7,
    'no discard is forced before End Phase');
  assert.deepEqual(tag.tagMemberHand(state,member(2)).map(card=>card.uid),partnerHandBefore,
    'the inactive source owner receives no unintended draw');
  assert.deepEqual(holder(state,2).deck.map(card=>card.uid),partnerDeckBefore,
    'Skelengel must not draw from the physical source owner Deck');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
