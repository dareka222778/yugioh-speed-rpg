'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const FISSURE='66788016';
assert.ok(getPlayableCard(FISSURE)?.kind==='spell','Fissure must be certified and playable');
assert.equal(getEffect(FISSURE)?.kind,'fissure');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&entry.card.atk>0&&Number.isInteger(entry.card.defense))
  .sort((a,b)=>a.card.atk-b.card.atk||a.id.localeCompare(b.id));
assert.ok(normal.length>=7);
const low=normal[0],middle=normal.find(entry=>entry.card.atk>low.card.atk),high=normal.find(entry=>entry.card.atk>(middle?.card.atk??low.card.atk));
assert.ok(middle&&high,'the fixture needs three distinct ATK values');

function member(seat){return 'm139-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normal.slice(0,7).map(entry=>entry.id),low.id,middle.id,high.id])];
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
  throw new Error('M139 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'Fissure must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Fissure selects the lowest-ATK monster across both opposing physical teammates, ignoring a weaker friendly monster',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M139 Seat '+seat,
    cards:deck(seat===0?[FISSURE]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m139-fissure-opponent-lowest-atk'});
  const fissure=takeCard(state,0,FISSURE);
  holder(state,0).hand.push(fissure);
  const friendlyLow=deploy(state,2,low.id);
  const opponentHigh=deploy(state,1,high.id);
  const opponentMiddle=deploy(state,3,middle.id);
  state.core.turn=3;
  assert.ok(low.card.atk<middle.card.atk&&middle.card.atk<high.card.atk);
  assert.match(friendlyLow.uid,/^m2:/);
  assert.match(opponentHigh.uid,/^m1:/);
  assert.match(opponentMiddle.uid,/^m3:/);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===fissure.uid
  );
  assert.ok(action,'active seat 0 must receive the legal Fissure activation');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'inactive physical teammate cannot execute the Main Phase action');
  state=tag.stepTagDuel(state,member(0),action);
  assert.equal(state.core.phase,'main');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===friendlyLow.uid),
    'Fissure must ignore a weaker monster controlled by the activating team');
  assert.deepEqual(state.core.players[1].monsters.map(card=>card.uid),[opponentHigh.uid],
    'the higher-ATK opponent monster survives');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===opponentMiddle.uid),
    'the lowest-ATK monster across the opposing team is destroyed');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fissure.uid));
  assert.deepEqual(state.core.players.map(player=>player.lp),[4000,4000]);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
