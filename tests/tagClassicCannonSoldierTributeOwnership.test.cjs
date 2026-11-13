'use strict';
const {test}=require('node:test');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getMonsterEffect}=require('../dist/effectRegistry');

const CANNON_SOLDIER='11384280';
const cannon=getPlayableCard(CANNON_SOLDIER);
assert.ok(cannon&&cannon.kind==='monster');
assert.deepEqual(getMonsterEffect(CANNON_SOLDIER)?.operation,{kind:'burn',amount:500});
const fodderId=tag.tagNormalCardIds.find(id=>getPlayableCard(id)?.kind==='monster');
assert.ok(fodderId,'the 2v2 tribute fixture needs an enabled Normal Monster');
function member(seat){return 'm90-seat-'+seat;}
function deck(required=[]){
 const ids=[...new Set([...required,...tag.tagNormalCardIds])].slice(0,7);
 assert.ok(ids.length>=7,'fixture deck must have seven unique card identities');
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
 throw new Error('M90 fixture card missing from physical seat '+seat+': '+id);
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
 assert.equal(cards.length,before.size);
 assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
 for(const card of cards)assert.equal(before.get(card.uid),card.id);
}

test('Cannon Soldier may Tribute its inactive teammate monster, preserves its physical UID and burns shared opposing LP',()=>{
 try {
 const players=[
  {id:member(0),name:'M90 Seat 0',cards:deck([CANNON_SOLDIER])},
  {id:member(1),name:'M90 Seat 1',cards:deck()},
  {id:member(2),name:'M90 Seat 2',cards:deck([fodderId])},
  {id:member(3),name:'M90 Seat 3',cards:deck()}
 ];
 let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m90-cannon-soldier-physical-tribute'});
 const before=inventorySnapshot(state);
 const cannonCard=deploy(state,0,CANNON_SOLDIER);
 const fodder=deploy(state,2,fodderId);
 state.core.turn=3;
 assert.doesNotThrow(()=>tag.assertTagDuel(state));
 assert.match(cannonCard.uid,/^m0:/);
 assert.match(fodder.uid,/^m2:/);
 assert.equal(state.core.players[0].lp,4000);
 assert.equal(state.core.players[1].lp,4000);

 const memberId=tag.tagDecisionMember(state).id;
 assert.equal(memberId,member(0));
 const action=tag.tagActions(state,memberId).find(candidate=>
  candidate.kind==='monsterEffect'&&candidate.card===cannonCard.uid&&candidate.tributes?.includes(fodder.uid)
 );
 assert.ok(action,'the active representative must be able to Tribute the teammate physical card on the shared field');
 state=tag.stepTagDuel(state,memberId,action);

 assert.ok(state.core.players[0].monsters.some(card=>card.uid===cannonCard.uid),'Cannon Soldier must remain on the field');
 assert.ok(!state.core.players[0].monsters.some(card=>card.uid===fodder.uid),'the teammate Tribute must leave the shared field');
 assert.ok(state.core.players[0].grave.some(card=>card.uid===fodder.uid&&card.id===fodderId),'the exact physical teammate card must enter the shared Graveyard');
 assert.equal(state.core.players[0].lp,4000,'the acting team LP must not change');
 assert.equal(state.core.players[1].lp,3500,'the opposing shared LP must lose exactly 500');
 assert.doesNotThrow(()=>tag.assertTagDuel(state));
 assertConserved(state,before);
 } catch(error) { const detail='[M90 Cannon Soldier diagnostic] '+(error?.stack??String(error))+'\\n';try{fs.mkdirSync('artifacts',{recursive:true});fs.appendFileSync('artifacts/engine-acceptance-failure.tap',detail);}catch{}process.stderr.write(detail);throw error; }
});
