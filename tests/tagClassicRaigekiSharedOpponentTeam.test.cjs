'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getDestructionModel}=require('../dist/effectModels');

const RAIGEKI='12580477';
assert.ok(getPlayableCard(RAIGEKI)?.kind==='spell','Raigeki must be certified and playable');
assert.equal(getEffect(RAIGEKI)?.kind,'raigeki');
assert.deepEqual(getDestructionModel(getEffect(RAIGEKI)),{
  operation:'destroyMonsters',scope:'opponent',destination:'grave'
});

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm136-seat-'+seat;}
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
  throw new Error('M136 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'Raigeki must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Raigeki destroys both opposing physical teammates monsters and preserves both friendly monsters',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M136 Seat '+seat,
    cards:deck(seat===0?[RAIGEKI]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m136-raigeki-opponent-team-only'});
  const raigeki=takeCard(state,0,RAIGEKI);
  holder(state,0).hand.push(raigeki);
  const friendlyActive=deploy(state,0,normal[0].id);
  const friendlyPartner=deploy(state,2,normal[1].id,{position:'def'});
  const opposingActive=deploy(state,1,normal[2].id);
  const opposingPartnerSet=deploy(state,3,normal[3].id,{faceUp:false,position:'def'});
  state.core.turn=3;
  assert.match(raigeki.uid,/^m0:/);
  assert.match(friendlyActive.uid,/^m0:/);
  assert.match(friendlyPartner.uid,/^m2:/);
  assert.match(opposingActive.uid,/^m1:/);
  assert.match(opposingPartnerSet.uid,/^m3:/);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const publicBefore=tag.publicTagDuel(state);
  assert.ok(!JSON.stringify(publicBefore).includes(opposingPartnerSet.id),
    'the opposing Set monster identity remains private before Raigeki');
  assert.ok(!JSON.stringify(publicBefore).includes(opposingPartnerSet.uid),
    'the opposing Set monster UID remains private before Raigeki');

  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===raigeki.uid
  );
  assert.ok(action,'active seat 0 must receive the legal Raigeki activation');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'inactive physical teammate cannot execute the Main Phase action');
  state=tag.stepTagDuel(state,member(0),action);
  assert.equal(state.core.phase,'main');
  assert.deepEqual(state.core.players[0].monsters.map(card=>card.uid).sort(),
    [friendlyActive.uid,friendlyPartner.uid].sort(),
    'Raigeki must preserve every monster controlled by the activating team');
  assert.deepEqual(state.core.players[1].monsters,[],
    'Raigeki destroys every monster controlled by both opposing physical teammates');
  for(const card of [opposingActive,opposingPartnerSet]){
    assert.ok(state.core.players[1].grave.some(entry=>entry.uid===card.uid),
      'opposing shared Graveyard receives physical monster '+card.uid);
  }
  assert.ok(state.core.players[0].grave.some(card=>card.uid===raigeki.uid));
  assert.deepEqual(state.core.players.map(player=>player.lp),[4000,4000]);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
