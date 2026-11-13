'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {atk,def}=require('../dist/duelEngine');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const YAMI='59197169';
const DARK_MAGICIAN='46986414';
const SUMMONED_SKULL='70781052';
const BLUE_EYES='89631139';
assert.equal(getPlayableCard(YAMI)?.kind,'spell');
assert.equal(getEffect(YAMI)?.kind,'field');
assert.deepEqual(getEffect(YAMI)?.races,['Fiend','Spellcaster']);
assert.deepEqual(getEffect(YAMI)?.penaltyRaces,['Fairy']);
assert.equal(getEffect(YAMI)?.atk,200);
assert.equal(getEffect(YAMI)?.def,200);
for(const id of [DARK_MAGICIAN,SUMMONED_SKULL,BLUE_EYES])assert.equal(getPlayableCard(id)?.kind,'monster');

const fairy=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .find(entry=>entry.card?.kind==='monster'&&entry.card.race==='Fairy');
assert.ok(fairy,'the fixture needs a certified Fairy Normal Monster');
const normalIds=[...new Set([...new Set(tag.tagNormalCardIds)].slice(0,7))];

function member(seat){return 'm145-seat-'+seat;}
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
  throw new Error('M145 fixture card missing from physical seat '+seat+': '+id);
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
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Yami field spell modifies eligible monsters on both teams and penalizes Fairy across the shared duel',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M145 Seat '+seat,
    cards:deck(seat===0?[YAMI]:seat===1?[BLUE_EYES,fairy.id]:seat===2?[DARK_MAGICIAN]:seat===3?[SUMMONED_SKULL]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m145-yami-both-teams'});
  const yami=takeCard(state,0,YAMI);
  holder(state,0).hand.push(yami);
  const fairyMonster=deploy(state,0,fairy.id);
  const blueEyes=deploy(state,1,BLUE_EYES);
  const darkMagician=deploy(state,2,DARK_MAGICIAN);
  const summonedSkull=deploy(state,3,SUMMONED_SKULL);
  state.core.turn=3;
  assert.match(yami.uid,/^m0:/);
  assert.match(darkMagician.uid,/^m2:/);
  assert.match(summonedSkull.uid,/^m3:/);
  assert.equal(getPlayableCard(darkMagician.id).race,'Spellcaster');
  assert.equal(getPlayableCard(summonedSkull.id).race,'Fiend');
  assert.equal(getPlayableCard(fairyMonster.id).race,'Fairy');
  assert.equal(getPlayableCard(blueEyes.id).race,'Dragon');
  const base={
    fairy:{atk:atk(fairyMonster,state.core),def:def(fairyMonster,state.core)},
    blueEyes:{atk:atk(blueEyes,state.core),def:def(blueEyes,state.core)},
    darkMagician:{atk:atk(darkMagician,state.core),def:def(darkMagician,state.core)},
    summonedSkull:{atk:atk(summonedSkull,state.core),def:def(summonedSkull,state.core)}
  };
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='field'&&candidate.card===yami.uid
  );
  assert.ok(action,'active seat 0 must be able to activate Yami from its hand');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'inactive physical teammate cannot execute the field activation');
  state=tag.stepTagDuel(state,member(0),action);
  assert.equal(state.core.phase,'main');
  assert.ok(state.core.players[0].field&&state.core.players[0].field.uid===yami.uid,
    'Yami occupies the activating team shared Field Zone');
  assert.equal(atk(fairyMonster,state.core),Math.max(0,base.fairy.atk-200));
  assert.equal(def(fairyMonster,state.core),Math.max(0,base.fairy.def-200),
    'Yami penalizes Fairy monsters on the activating team');
  assert.equal(atk(darkMagician,state.core),base.darkMagician.atk+200);
  assert.equal(def(darkMagician,state.core),base.darkMagician.def+200,
    'Yami boosts Spellcasters on the partner-owned shared field');
  assert.equal(atk(summonedSkull,state.core),base.summonedSkull.atk+200);
  assert.equal(def(summonedSkull,state.core),base.summonedSkull.def+200,
    'Yami boosts Fiends on the opposing shared field as well');
  assert.equal(atk(blueEyes,state.core),base.blueEyes.atk);
  assert.equal(def(blueEyes,state.core),base.blueEyes.def,
    'Yami does not modify a non-matching Dragon');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
