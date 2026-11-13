'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const POLYMERIZATION='24094653';
const MYSTICAL_SAND='32751480';
const GIANT_SOLDIER='13039848';
const ANCIENT_ELF='93221206';
const BEASTKING='99426834';
const VERSAGO='50259460';

assert.equal(getEffect(POLYMERIZATION)?.kind,'polymerization');
assert.equal(getEffect(MYSTICAL_SAND)?.kind,'fusion');
for(const id of [BEASTKING,VERSAGO]){
  assert.equal(getPlayableCard(id)?.monsterType,'effect');
  assert.equal(getMonsterEffect(id)?.operation.kind,'fusionSubstitute');
}
const normalIds=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>![GIANT_SOLDIER,ANCIENT_ELF].includes(id))
  .slice(0,7);
assert.equal(normalIds.length,7);

function member(seat){return 'm151-sub-seat-'+seat;}
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
  throw new Error('M151 substitute fixture card missing from seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster.uid;
}
function snapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,81);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,81);
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('one face-up Fusion Substitute may replace exactly one named material across the shared teammate field',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M151 Substitute Seat '+seat,
    cards:deck(seat===0?[POLYMERIZATION,GIANT_SOLDIER]:seat===2?[BEASTKING,ANCIENT_ELF]:seat===3?[GIANT_SOLDIER]:[]),
    extra:seat===0?[MYSTICAL_SAND]:[]
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m151-one-fusion-substitute'});
  const before=snapshot(state);
  const poly=takeCard(state,0,POLYMERIZATION);
  holder(state,0).hand.push(poly);
  const exactUid=deploy(state,0,GIANT_SOLDIER);
  const substituteUid=deploy(state,2,BEASTKING);
  const opponentUid=deploy(state,3,GIANT_SOLDIER);
  const privateExact=takeCard(state,2,ANCIENT_ELF);
  holder(state,2).hand.push(privateExact);
  const fusion=state.core.players[0].extra.find(card=>card.id===MYSTICAL_SAND);
  assert.ok(fusion);
  state.core.turn=3;
  assert.match(exactUid,/^m0:/);
  assert.match(substituteUid,/^m2:/);
  assert.match(opponentUid,/^m3:/);
  assert.match(privateExact.uid,/^m2:/);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const actions=tag.tagActions(state,member(0));
  const action=actions.find(candidate=>
    candidate.kind==='fusion'&&candidate.card===poly.uid&&candidate.extra===fusion.uid&&
    candidate.position==='atk'&&
    [...candidate.materials].sort().join('|')===[exactUid,substituteUid].sort().join('|')
  );
  assert.ok(action,'Beastking of the Swamps must replace one named material while Giant Soldier remains exact');
  assert.ok(!actions.some(candidate=>candidate.kind==='fusion'&&candidate.card===poly.uid&&candidate.materials.includes(privateExact.uid)),
    'the partner private hand remains outside the material pool');
  assert.ok(!actions.some(candidate=>candidate.kind==='fusion'&&candidate.card===poly.uid&&candidate.materials.includes(opponentUid)),
    'the opponent field remains outside the material pool');

  state=tag.stepTagDuel(state,member(0),action);
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===fusion.uid&&card.id===MYSTICAL_SAND));
  for(const uid of [poly.uid,exactUid,substituteUid])assert.ok(state.core.players[0].grave.some(card=>card.uid===uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===opponentUid));
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===privateExact.uid));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  state=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===privateExact.uid));
  assertConserved(state,before);
});

test('two Fusion Substitutes cannot replace both named materials for one Fusion Summon',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M151 Two Substitute Seat '+seat,
    cards:deck(seat===0?[POLYMERIZATION]:seat===2?[BEASTKING,VERSAGO,ANCIENT_ELF]:[]),
    extra:seat===0?[MYSTICAL_SAND]:[]
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m151-two-fusion-substitutes'});
  const before=snapshot(state);
  const poly=takeCard(state,0,POLYMERIZATION);
  holder(state,0).hand.push(poly);
  const first=deploy(state,0,BEASTKING);
  const second=deploy(state,2,VERSAGO);
  const privateExact=takeCard(state,2,ANCIENT_ELF);
  holder(state,2).hand.push(privateExact);
  const fusion=state.core.players[0].extra.find(card=>card.id===MYSTICAL_SAND);
  assert.ok(fusion);
  state.core.turn=3;
  assert.match(first,/^m0:/);
  assert.match(second,/^m2:/);
  assert.match(privateExact.uid,/^m2:/);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const actions=tag.tagActions(state,member(0));
  assert.ok(!actions.some(action=>action.kind==='fusion'&&action.card===poly.uid&&action.extra===fusion.uid),
    'two substitutes cannot replace both named materials, and the partner private exact material is unavailable');
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===privateExact.uid));
  assertConserved(state,before);
});
